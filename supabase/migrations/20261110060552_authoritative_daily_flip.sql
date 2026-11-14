-- Shared, account-scoped authority for the website and native clients.
-- The existing daily_decks/open_daily_card RPC is a separate fixed-five deck,
-- so this keeps the current membership allowance and lucky-bonus rules intact.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table private.daily_flip_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  bonus_total smallint not null default 0 check (bonus_total between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table private.daily_flip_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  post_id uuid not null references public.posts(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 120),
  bonus_awarded smallint not null default 0 check (bonus_awarded between 0 and 10),
  opened_at timestamptz not null default now(),
  primary key (user_id, local_date, post_id),
  unique (user_id, local_date, idempotency_key)
);

alter table private.daily_flip_days enable row level security;
alter table private.daily_flip_attempts enable row level security;
revoke all on private.daily_flip_days, private.daily_flip_attempts from public, anon, authenticated;

-- Keep existing per-user rating/like/view/completion writes available while
-- reserving opened_at exclusively for the authoritative flip RPC below.
revoke insert, update on public.user_interactions from authenticated;
grant insert (user_id, post_id, viewed_at, skipped_at, rating, liked, completed_at, exposure_count, rarity_tier)
  on public.user_interactions to authenticated;
grant update (user_id, post_id, viewed_at, skipped_at, rating, liked, completed_at, exposure_count, rarity_tier)
  on public.user_interactions to authenticated;

create or replace function private.daily_flip_state(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_tier text;
  v_today date;
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
  v_today := (pg_catalog.now() at time zone v_timezone)::date;
  v_base := case v_tier when 'plus' then 9 when 'pro' then 13 else 5 end;
  select coalesce(d.bonus_total, 0) into v_bonus
    from private.daily_flip_days d where d.user_id = p_user_id and d.local_date = v_today;
  v_bonus := coalesce(v_bonus, 0);
  select count(distinct i.post_id)::integer,
         coalesce(pg_catalog.jsonb_agg(distinct p.client_id order by p.client_id) filter (where p.client_id is not null), '[]'::jsonb)
    into v_opened, v_ids
    from public.user_interactions i
    join public.posts p on p.id = i.post_id
   where i.user_id = p_user_id
     and p.channel = 'community'
     and i.opened_at >= (v_today::timestamp at time zone v_timezone)
     and i.opened_at < ((v_today + 1)::timestamp at time zone v_timezone);
  return pg_catalog.jsonb_build_object(
    'localDate', v_today,
    'timezone', v_timezone,
    'membershipTier', v_tier,
    'baseAllowance', v_base,
    'bonus', v_bonus,
    'allowance', v_base + v_bonus,
    'openedCount', coalesce(v_opened, 0),
    'openedIds', coalesce(v_ids, '[]'::jsonb),
    'remaining', greatest(v_base + v_bonus - coalesce(v_opened, 0), 0)
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
  v_today date;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_base integer;
  v_bonus integer;
  v_used integer;
  v_roll double precision;
  v_award integer := 0;
  v_attempt private.daily_flip_attempts%rowtype;
  v_existing_key private.daily_flip_attempts%rowtype;
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
  v_today := (v_now at time zone v_timezone)::date;
  v_base := case v_tier when 'plus' then 9 when 'pro' then 13 else 5 end;
  select coalesce(pg_catalog.sum(s.rating_count), 0)::integer, coalesce(pg_catalog.sum(s.rating_sum), 0)::integer
    into v_rating_count, v_rating_sum from public.post_rating_stats s where s.post_id = p_post_id;
  v_rarity_tier := case
    when v_rating_count < 5 then 'pending'
    when v_rating_sum::numeric / v_rating_count >= 4.8 and v_rating_count >= 20 then 'SSS'
    when v_rating_sum::numeric / v_rating_count >= 4.5 and v_rating_count >= 10 then 'SS'
    when v_rating_sum::numeric / v_rating_count >= 4.0 then 'S'
    else 'ordinary'
  end;

  -- Serialize a user's flips only for their current local day. Different users
  -- and different days do not contend on the same lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':' || v_today::text, 0));

  -- Reward totals are created only by this server transaction. Never trust a
  -- client supplied bonus amount, even for compatibility with older clients.
  insert into private.daily_flip_days(user_id, local_date, bonus_total)
  values (v_user, v_today, 0)
  on conflict (user_id, local_date) do nothing;
  select d.bonus_total into v_bonus from private.daily_flip_days d
   where d.user_id = v_user and d.local_date = v_today for update;

  select a.* into v_existing_key from private.daily_flip_attempts a
   where a.user_id = v_user and a.local_date = v_today and a.idempotency_key = p_idempotency_key;
  if found then
    if v_existing_key.post_id <> p_post_id then
      raise exception using message = 'idempotency_key_reused', errcode = 'P0001';
    end if;
    v_result := private.daily_flip_state(v_user) || pg_catalog.jsonb_build_object(
      'postId', (select p.client_id from public.posts p where p.id = p_post_id),
      'bonusAwarded', v_existing_key.bonus_awarded,
      'openedAt', v_existing_key.opened_at,
      'idempotent', true
    );
    return v_result;
  end if;

  select a.* into v_attempt from private.daily_flip_attempts a
   where a.user_id = v_user and a.local_date = v_today and a.post_id = p_post_id;
  if found then
    -- Same card requested from another device/key this day is also idempotent.
    v_result := private.daily_flip_state(v_user) || pg_catalog.jsonb_build_object(
      'postId', (select p.client_id from public.posts p where p.id = p_post_id),
      'bonusAwarded', v_attempt.bonus_awarded,
      'openedAt', v_attempt.opened_at,
      'idempotent', true
    );
    return v_result;
  end if;

  select i.opened_at into v_opened_at from public.user_interactions i
   where i.user_id = v_user and i.post_id = p_post_id
     and i.opened_at >= (v_today::timestamp at time zone v_timezone)
     and i.opened_at < ((v_today + 1)::timestamp at time zone v_timezone);
  if found then
    -- A legacy client may already have recorded this flip. Do not charge or
    -- award a second time while switching clients mid-day.
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
     and i.opened_at >= (v_today::timestamp at time zone v_timezone)
     and i.opened_at < ((v_today + 1)::timestamp at time zone v_timezone);
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

  update private.daily_flip_days
     set bonus_total = bonus_total + v_award, updated_at = v_now
   where user_id = v_user and local_date = v_today;
  insert into public.user_interactions(user_id, post_id, opened_at, rarity_tier)
  values (v_user, p_post_id, v_now, v_rarity_tier)
  on conflict (user_id, post_id) do update
     set opened_at = excluded.opened_at,
         rarity_tier = excluded.rarity_tier;
  insert into private.daily_flip_attempts(user_id, local_date, post_id, idempotency_key, bonus_awarded, opened_at)
  values (v_user, v_today, p_post_id, p_idempotency_key, v_award, v_now);

  v_result := private.daily_flip_state(v_user) || pg_catalog.jsonb_build_object(
    'postId', (select p.client_id from public.posts p where p.id = p_post_id),
    'bonusAwarded', v_award,
    'openedAt', v_now,
    'idempotent', false
  );
  return v_result;
end;
$$;

revoke all on function private.daily_flip_state(uuid) from public, anon, authenticated;
revoke all on function private.confirm_daily_flip(uuid, text) from public, anon, authenticated;
grant execute on function private.daily_flip_state(uuid) to authenticated;
grant execute on function private.confirm_daily_flip(uuid, text) to authenticated;

create or replace function public.get_daily_flip_state()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.daily_flip_state(auth.uid());
$$;

create or replace function public.confirm_daily_flip(
  p_post_id uuid,
  p_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_daily_flip(p_post_id, p_idempotency_key);
$$;

revoke all on function public.get_daily_flip_state() from public, anon;
revoke all on function public.confirm_daily_flip(uuid, text) from public, anon;
grant execute on function public.get_daily_flip_state() to authenticated;
grant execute on function public.confirm_daily_flip(uuid, text) to authenticated;
