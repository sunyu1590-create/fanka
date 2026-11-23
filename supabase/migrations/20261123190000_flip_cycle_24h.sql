-- 翻卡周期改为「24 小时滚动」，不再按自然日 0 点重置。
--
-- 旧实现用 (user_id, local_date) 作为每日额度主键，跨天即清零：用户上午翻完，
-- 第二天 0 点才能再翻，实际冷却可能只有几小时，也可能因为时区边界出现「四天
-- 不更新」的观感。新实现给每个用户一条独立周期记录：首次访问生成，24 小时后
-- 到期，下次访问时在同一个事务里关闭旧周期并开启新周期。
--
-- 历史表 private.daily_flip_days / private.daily_flip_attempts 原样保留，只读，
-- 用于回溯与统计；新流量全部写 private.flip_cycles / private.flip_cycle_attempts。

create table if not exists private.flip_cycles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cycle_id uuid not null default pg_catalog.gen_random_uuid(),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  bonus_total smallint not null default 0 check (bonus_total between 0 and 10),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flip_cycles_window check (expires_at > started_at)
);

create table if not exists private.flip_cycle_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid not null,
  post_id uuid not null references public.posts(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 120),
  bonus_awarded smallint not null default 0 check (bonus_awarded between 0 and 10),
  opened_at timestamptz not null default now(),
  primary key (user_id, cycle_id, post_id),
  unique (user_id, cycle_id, idempotency_key)
);

alter table private.flip_cycles enable row level security;
alter table private.flip_cycle_attempts enable row level security;
revoke all on private.flip_cycles, private.flip_cycle_attempts from public, anon, authenticated;

create index if not exists flip_cycle_attempts_user_opened_idx
  on private.flip_cycle_attempts (user_id, opened_at desc);

/**
 * 取当前有效周期；没有或已到期时在同一事务内切换。
 * 用 advisory lock 串行化同一用户的并发请求，避免两台设备同时开两个周期。
 */
create or replace function private.ensure_flip_cycle(p_user_id uuid)
returns private.flip_cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cycle private.flip_cycles%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':flip_cycle', 0));
  select * into v_cycle from private.flip_cycles where user_id = p_user_id;
  if not found then
    insert into private.flip_cycles (user_id, started_at, expires_at)
    values (p_user_id, v_now, v_now + interval '24 hours')
    returning * into v_cycle;
    return v_cycle;
  end if;
  if v_cycle.closed_at is not null or v_cycle.expires_at <= v_now then
    update private.flip_cycles
       set cycle_id = pg_catalog.gen_random_uuid(),
           started_at = v_now,
           expires_at = v_now + interval '24 hours',
           bonus_total = 0,
           closed_at = null,
           updated_at = v_now
     where user_id = p_user_id
     returning * into v_cycle;
  end if;
  return v_cycle;
end;
$$;

revoke all on function private.ensure_flip_cycle(uuid) from public, anon, authenticated;

create or replace function private.daily_flip_state(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_tier text;
  v_cycle private.flip_cycles%rowtype;
  v_base integer;
  v_bonus integer;
  v_opened integer;
  v_ids jsonb;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception using message = 'user_scope_violation', errcode = '42501';
  end if;
  select coalesce(p.timezone, 'Asia/Shanghai'), coalesce(p.membership_tier, 'free')
    into v_timezone, v_tier
    from public.profiles p where p.id = p_user_id;
  if not found then raise exception using message = 'profile_not_found', errcode = 'P0001'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    v_timezone := 'Asia/Shanghai';
  end if;
  v_cycle := private.ensure_flip_cycle(p_user_id);
  v_base := case v_tier when 'plus' then 9 when 'pro' then 13 else 5 end;
  v_bonus := v_cycle.bonus_total;
  select count(distinct i.post_id)::integer,
         coalesce(pg_catalog.jsonb_agg(distinct p.client_id order by p.client_id) filter (where p.client_id is not null), '[]'::jsonb)
    into v_opened, v_ids
    from public.user_interactions i
    join public.posts p on p.id = i.post_id
   where i.user_id = p_user_id
     and p.channel = 'community'
     and i.opened_at >= v_cycle.started_at
     and i.opened_at < v_cycle.expires_at;
  return pg_catalog.jsonb_build_object(
    'localDate', (v_cycle.started_at at time zone v_timezone)::date,
    'timezone', v_timezone,
    'membershipTier', v_tier,
    'baseAllowance', v_base,
    'bonus', v_bonus,
    'allowance', v_base + v_bonus,
    'openedCount', coalesce(v_opened, 0),
    'openedIds', coalesce(v_ids, '[]'::jsonb),
    'remaining', greatest(v_base + v_bonus - coalesce(v_opened, 0), 0),
    'cycleId', v_cycle.cycle_id,
    'cycleStartedAt', v_cycle.started_at,
    'cycleExpiresAt', v_cycle.expires_at,
    'cycleSecondsRemaining', greatest(extract(epoch from (v_cycle.expires_at - pg_catalog.clock_timestamp()))::integer, 0)
  );
end;
$$;

create or replace function private.confirm_daily_flip(
  p_post_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_tier text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cycle private.flip_cycles%rowtype;
  v_base integer;
  v_bonus integer;
  v_used integer;
  v_roll double precision;
  v_award integer := 0;
  v_attempt private.flip_cycle_attempts%rowtype;
  v_existing_key private.flip_cycle_attempts%rowtype;
  v_opened_at timestamptz;
  v_rating_count integer := 0;
  v_rating_sum integer := 0;
  v_rarity_tier text;
  v_result jsonb;
begin
  if v_user is null then raise exception using message = 'authentication_required', errcode = '42501'; end if;
  if p_post_id is null or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 120 then
    raise exception using message = 'invalid_flip_request', errcode = '22023';
  end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.channel = 'community' and p.status = 'published') then
    raise exception using message = 'daily_card_unavailable', errcode = 'P0001';
  end if;
  select coalesce(p.timezone, 'Asia/Shanghai'), coalesce(p.membership_tier, 'free')
    into v_timezone, v_tier from public.profiles p where p.id = v_user;
  if not found then raise exception using message = 'profile_not_found', errcode = 'P0001'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    v_timezone := 'Asia/Shanghai';
  end if;

  v_cycle := private.ensure_flip_cycle(v_user);
  v_base := case v_tier when 'plus' then 9 when 'pro' then 13 else 5 end;
  v_bonus := v_cycle.bonus_total;

  select coalesce(pg_catalog.sum(s.rating_count), 0)::integer, coalesce(pg_catalog.sum(s.rating_sum), 0)::integer
    into v_rating_count, v_rating_sum from public.post_rating_stats s where s.post_id = p_post_id;
  v_rarity_tier := case
    when v_rating_count < 5 then 'pending'
    when v_rating_sum::numeric / v_rating_count >= 4.8 and v_rating_count >= 20 then 'SSS'
    when v_rating_sum::numeric / v_rating_count >= 4.5 and v_rating_count >= 10 then 'SS'
    when v_rating_sum::numeric / v_rating_count >= 4.0 then 'S'
    else 'ordinary'
  end;

  -- 同一用户的翻卡串行化。lock key 不带日期：跨周期切换也走同一把锁。
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':flip_flip', 0));

  -- 周期记录可能被并发 ensure 重建，重新读一次拿最新 bonus。
  select * into v_cycle from private.flip_cycles where user_id = v_user for update;
  v_bonus := v_cycle.bonus_total;

  select a.* into v_existing_key from private.flip_cycle_attempts a
   where a.user_id = v_user and a.cycle_id = v_cycle.cycle_id and a.idempotency_key = p_idempotency_key;
  if found then
    if v_existing_key.post_id <> p_post_id then
      raise exception using message = 'idempotency_key_reused', errcode = 'P0001';
    end if;
    return private.daily_flip_state(v_user) || pg_catalog.jsonb_build_object(
      'postId', (select p.client_id from public.posts p where p.id = p_post_id),
      'bonusAwarded', v_existing_key.bonus_awarded,
      'openedAt', v_existing_key.opened_at,
      'idempotent', true
    );
  end if;

  select a.* into v_attempt from private.flip_cycle_attempts a
   where a.user_id = v_user and a.cycle_id = v_cycle.cycle_id and a.post_id = p_post_id;
  if found then
    return private.daily_flip_state(v_user) || pg_catalog.jsonb_build_object(
      'postId', (select p.client_id from public.posts p where p.id = p_post_id),
      'bonusAwarded', v_attempt.bonus_awarded,
      'openedAt', v_attempt.opened_at,
      'idempotent', true
    );
  end if;

  -- 旧客户端可能已经把这次翻卡写进 user_interactions（没有 attempts 记录）。
  -- 周期内重复翻同一张不重复扣次数。
  select i.opened_at into v_opened_at from public.user_interactions i
   where i.user_id = v_user and i.post_id = p_post_id
     and i.opened_at >= v_cycle.started_at and i.opened_at < v_cycle.expires_at;
  if found then
    return private.daily_flip_state(v_user) || pg_catalog.jsonb_build_object(
      'postId', (select p.client_id from public.posts p where p.id = p_post_id),
      'bonusAwarded', 0,
      'openedAt', v_opened_at,
      'idempotent', true
    );
  end if;

  select count(distinct i.post_id)::integer into v_used
    from public.user_interactions i
    join public.posts p on p.id = i.post_id
   where i.user_id = v_user and p.channel = 'community'
     and i.opened_at >= v_cycle.started_at and i.opened_at < v_cycle.expires_at;
  if v_used >= v_base + v_bonus then
    raise exception using message = 'daily_flip_limit_reached', errcode = 'P0001';
  end if;

  if v_bonus < 10 then
    v_roll := pg_catalog.random();
    v_award := case
      when v_roll < 0.001 then 10
      when v_roll < 0.016 then 5
      when v_roll < 0.066 then 3
      when v_roll < 0.166 then 2
      else 0
    end;
    v_award := least(v_award, 10 - v_bonus);
  end if;

  update private.flip_cycles
     set bonus_total = bonus_total + v_award, updated_at = v_now
   where user_id = v_user;
  insert into public.user_interactions(user_id, post_id, opened_at, rarity_tier)
  values (v_user, p_post_id, v_now, v_rarity_tier)
  on conflict (user_id, post_id) do update
     set opened_at = excluded.opened_at,
         rarity_tier = excluded.rarity_tier;
  insert into private.flip_cycle_attempts(user_id, cycle_id, post_id, idempotency_key, bonus_awarded, opened_at)
  values (v_user, v_cycle.cycle_id, p_post_id, p_idempotency_key, v_award, v_now);

  return private.daily_flip_state(v_user) || pg_catalog.jsonb_build_object(
    'postId', (select p.client_id from public.posts p where p.id = p_post_id),
    'bonusAwarded', v_award,
    'openedAt', v_now,
    'idempotent', false
  );
end;
$$;

-- 兼容旧数据：把历史每日额度合并成当前周期，避免升级瞬间把今天的进度清零。
insert into private.flip_cycles (user_id, started_at, expires_at, bonus_total)
select d.user_id,
       (d.local_date::timestamp at time zone coalesce(p.timezone, 'Asia/Shanghai')),
       (d.local_date::timestamp at time zone coalesce(p.timezone, 'Asia/Shanghai')) + interval '24 hours',
       d.bonus_total
  from private.daily_flip_days d
  join public.profiles p on p.id = d.user_id
 where d.local_date = (pg_catalog.now() at time zone coalesce(p.timezone, 'Asia/Shanghai'))::date
on conflict (user_id) do nothing;
