-- Additive membership support and redemption ledger. Existing profile tiers are
-- preserved as legacy lifetime periods; no user or EXP data is deleted.
create table if not exists public.membership_plans (
  tier text primary key check (tier in ('free','plus','pro')),
  display_name text not null,
  daily_flips integer not null check (daily_flips > 0),
  duration_days integer,
  support_price_cents integer not null default 0 check (support_price_cents >= 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  benefits jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check ((tier = 'free' and duration_days is null) or (tier <> 'free' and duration_days > 0))
);

insert into public.membership_plans(tier,display_name,daily_flips,duration_days,support_price_cents,currency,benefits)
values
 ('free','Free',5,null,0,'CNY','["每日 5 次基础翻卡","基础内容浏览与社区互动"]'::jsonb),
 ('plus','Plus',9,30,1200,'CNY','["每日 9 次基础翻卡","包含 Free 的现有社区功能","支持独立开发者"]'::jsonb),
 ('pro','Pro',13,30,1600,'CNY','["每日 13 次基础翻卡","包含 Plus 的现有社区功能","支持黑卡持续维护"]'::jsonb)
on conflict (tier) do nothing;

alter table public.membership_plans enable row level security;
drop policy if exists membership_plans_read_enabled on public.membership_plans;
create policy membership_plans_read_enabled on public.membership_plans
  for select to anon,authenticated using (enabled);
grant select on public.membership_plans to anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.membership_plans from anon,authenticated;

alter table public.profiles
  add column if not exists membership_expires_at timestamptz;

create table if not exists public.redeem_code_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  tier text not null references public.membership_plans(tier),
  duration_days integer not null check (duration_days between 1 and 7300),
  code_count integer not null check (code_count between 1 and 5000),
  created_by uuid not null references public.profiles(id),
  export_ref uuid unique,
  export_label text,
  exported_at timestamptz,
  exported_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.redeem_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.redeem_code_batches(id) on delete restrict,
  code_hash text not null unique check (length(code_hash) = 64),
  code_ciphertext text not null,
  code_suffix text not null check (length(code_suffix) = 4),
  tier text not null references public.membership_plans(tier),
  duration_days integer not null check (duration_days between 1 and 7300),
  status text not null default 'available' check (status in ('available','redeemed','disabled')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles(id),
  disabled_at timestamptz,
  disabled_by uuid references public.profiles(id),
  check ((status = 'redeemed') = (redeemed_at is not null and redeemed_by is not null))
);
create index if not exists redeem_codes_batch_status_idx on public.redeem_codes(batch_id,status);

create table if not exists public.user_membership_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('plus','pro')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  source text not null check (source in ('legacy','redeem','admin')),
  code_id uuid references public.redeem_codes(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  revoke_reason text,
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists user_membership_periods_active_idx on public.user_membership_periods(user_id,starts_at,ends_at);

-- Existing manually managed Plus/Pro accounts keep their current no-expiry status.
insert into public.user_membership_periods(user_id,tier,starts_at,ends_at,source)
select p.id,p.membership_tier,coalesce(p.created_at,now()),null,'legacy'
from public.profiles p
where p.membership_tier in ('plus','pro')
  and not exists (select 1 from public.user_membership_periods m where m.user_id=p.id);

create table if not exists public.redemption_records (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_id uuid not null references public.redeem_codes(id) on delete restrict,
  tier text not null check (tier in ('plus','pro')),
  duration_days integer not null,
  effective_from timestamptz not null,
  expires_at timestamptz not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id,request_id),
  unique(code_id)
);
create index if not exists redemption_records_user_created_idx on public.redemption_records(user_id,created_at desc);

create table if not exists public.membership_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null check (event_type in ('redeemed','granted','extended','queued','expired','revoked','plan_changed')),
  old_tier text check (old_tier is null or old_tier in ('free','plus','pro')),
  new_tier text check (new_tier is null or new_tier in ('free','plus','pro')),
  starts_at timestamptz,
  ends_at timestamptz,
  source text not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists membership_events_user_created_idx on public.membership_events(user_id,created_at desc);

create table if not exists public.afdian_orders (
  id uuid primary key default gen_random_uuid(),
  provider_order_id text not null unique,
  plan_id text,
  amount_cents integer check (amount_cents is null or amount_cents>=0),
  payment_status text not null default 'unverified' check (payment_status in ('unverified','paid','refunded','failed','unknown')),
  processing_status text not null default 'pending' check (processing_status in ('pending','verified','fulfilled','needs_review','ignored')),
  redeem_batch_id uuid references public.redeem_code_batches(id) on delete set null,
  received_at timestamptz not null default now(),
  verified_at timestamptz,
  issue_note text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists afdian_orders_status_idx on public.afdian_orders(processing_status,received_at desc);
alter table public.afdian_orders enable row level security;
revoke all on public.afdian_orders from public,anon,authenticated;
grant all on public.afdian_orders to service_role;

create table if not exists private.membership_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('preview','redeem')),
  bucket_start timestamptz not null,
  count integer not null default 1,
  primary key(user_id,action,bucket_start)
);
alter table private.membership_rate_limits enable row level security;
revoke all on private.membership_rate_limits from public,anon,authenticated;

alter table public.redeem_code_batches enable row level security;
alter table public.redeem_codes enable row level security;
alter table public.user_membership_periods enable row level security;
alter table public.redemption_records enable row level security;
alter table public.membership_events enable row level security;
revoke all on public.redeem_code_batches,public.redeem_codes,public.user_membership_periods,public.redemption_records,public.membership_events from public,anon,authenticated;
grant all on public.redeem_code_batches,public.redeem_codes,public.user_membership_periods,public.redemption_records,public.membership_events to service_role;
grant all on public.membership_plans to service_role;

create or replace function private.effective_membership_tier(p_user_id uuid,p_at timestamptz default now())
returns text language plpgsql stable security definer set search_path=''
as $$
begin
  if p_user_id is null then return 'free'; end if;
  if auth.uid() is distinct from p_user_id and coalesce(auth.role(),'')<>'service_role' and not public.is_admin() then raise exception using message='user_scope_violation',errcode='42501'; end if;
  return coalesce((select m.tier from public.user_membership_periods m where m.user_id=p_user_id and m.revoked_at is null and m.starts_at<=p_at and (m.ends_at is null or m.ends_at>p_at) order by m.starts_at desc,m.created_at desc limit 1),'free');
end;
$$;
revoke all on function private.effective_membership_tier(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.effective_membership_tier(uuid,timestamptz) to authenticated,service_role;

create or replace function public.current_membership_tier()
returns text language sql stable security invoker set search_path=''
as $$ select private.effective_membership_tier(auth.uid(),now()); $$;
revoke all on function public.current_membership_tier() from public,anon;
grant execute on function public.current_membership_tier() to authenticated;

create or replace function public.my_membership_state()
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'tier',private.effective_membership_tier(auth.uid(),now()),
    'expiresAt',(select m.ends_at from public.user_membership_periods m where m.user_id=auth.uid() and m.revoked_at is null and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) order by m.starts_at desc,m.created_at desc limit 1)
  );
$$;
revoke all on function public.my_membership_state() from public,anon;
grant execute on function public.my_membership_state() to authenticated;

-- Preserve the existing administrator picker as a lifetime/manual adjustment.
create or replace function public.set_membership_tier(p_profile_id uuid,p_membership_tier text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_old_tier text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if p_membership_tier not in ('free','plus','pro') then raise exception 'invalid membership tier'; end if;
  perform 1 from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'profile not found'; end if;
  v_old_tier:=private.effective_membership_tier(p_profile_id,now());
  update public.user_membership_periods set revoked_at=now(),revoked_by=auth.uid(),revoke_reason='管理员通过旧版等级选择器调整' where user_id=p_profile_id and revoked_at is null and (ends_at is null or ends_at>now());
  if p_membership_tier<>'free' then insert into public.user_membership_periods(user_id,tier,starts_at,ends_at,source) values(p_profile_id,p_membership_tier,now(),null,'admin'); end if;
  update public.profiles set membership_tier=p_membership_tier,membership_expires_at=null where id=p_profile_id;
  insert into public.membership_events(user_id,actor_id,event_type,old_tier,new_tier,starts_at,ends_at,source,reason)
    values(p_profile_id,auth.uid(),case when p_membership_tier='free' then 'revoked' else 'granted' end,v_old_tier,p_membership_tier,now(),null,'admin','管理员通过旧版等级选择器调整');
  return p_membership_tier;
end;
$$;
revoke all on function public.set_membership_tier(uuid,text) from public,anon;
grant execute on function public.set_membership_tier(uuid,text) to authenticated;

create or replace function public.my_experience_summary()
returns jsonb language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'total',coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id=auth.uid()),0),
    'membershipTier',private.effective_membership_tier(auth.uid(),now()),
    'events',coalesce((select jsonb_agg(jsonb_build_object('type',e.event_type,'points',e.points,'createdAt',e.created_at) order by e.created_at desc)
      from (select event_type,points,created_at from public.experience_events where user_id=auth.uid() order by created_at desc limit 20) e),'[]'::jsonb)
  );
$$;

create or replace function public.record_experience_event(p_event_type text,p_post_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_timezone text; v_membership text:='free'; v_local_date date; v_points integer:=0; v_bonus integer:=0; v_event_key text; v_daily_count integer; v_inserted integer; v_total integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_event_type not in ('flip','rating') then raise exception 'invalid experience event'; end if;
  if not exists(select 1 from public.posts p where p.id=p_post_id and p.status='published' and p.author_id is distinct from v_user) then raise exception 'post is not eligible for experience'; end if;
  select coalesce(p.timezone,'Asia/Shanghai') into v_timezone from public.profiles p where p.id=v_user;
  v_membership:=private.effective_membership_tier(v_user,now());
  v_local_date:=(now() at time zone v_timezone)::date;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text||':'||v_local_date::text||':'||p_event_type,0));
  if p_event_type='flip' then
    if not exists(select 1 from public.user_interactions i where i.user_id=v_user and i.post_id=p_post_id and i.opened_at is not null) then raise exception 'card has not been opened'; end if;
    v_event_key:='flip:'||v_local_date::text||':'||p_post_id::text;
    select count(*)::integer into v_daily_count from public.experience_events e where e.user_id=v_user and e.event_type='flip' and (e.created_at at time zone v_timezone)::date=v_local_date;
    if v_daily_count<10 then v_points:=case when v_daily_count=0 then 10 else 2 end; if v_daily_count=0 then v_bonus:=case v_membership when 'plus' then 3 when 'pro' then 6 else 0 end; end if; v_points:=v_points+v_bonus; end if;
  else
    if not exists(select 1 from public.user_interactions i where i.user_id=v_user and i.post_id=p_post_id and i.rating between 1 and 5) then raise exception 'rating is missing'; end if;
    v_event_key:='rating:'||p_post_id::text;
    select count(*)::integer into v_daily_count from public.experience_events e where e.user_id=v_user and e.event_type='rating' and (e.created_at at time zone v_timezone)::date=v_local_date;
    if v_daily_count<5 then v_points:=2; end if;
  end if;
  if v_points>0 then
    insert into public.experience_events(user_id,event_key,event_type,post_id,points) values(v_user,v_event_key,p_event_type,p_post_id,v_points) on conflict(user_id,event_key) do nothing;
    get diagnostics v_inserted=row_count; if v_inserted=0 then v_points:=0; end if;
  end if;
  select coalesce(sum(points),0)::integer into v_total from public.experience_events where user_id=v_user;
  return jsonb_build_object('awarded',v_points,'total',v_total,'membershipTier',v_membership);
end;
$$;

create or replace function private.consume_membership_rate_limit(p_user_id uuid,p_action text,p_max_count integer,p_window_seconds integer,p_request_id uuid default null,p_code_hash text default null)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_start timestamptz; v_count integer; v_existing_hash text;
begin
  if p_action not in ('preview','redeem') or p_max_count<1 or p_window_seconds<1 then raise exception using message='invalid_rate_limit',errcode='22023'; end if;
  -- Let a client safely retry an already committed redemption without spending
  -- another attempt. The request ID is still bound to the same code hash.
  if p_action='redeem' and p_request_id is not null then
    select c.code_hash into v_existing_hash from public.redemption_records r join public.redeem_codes c on c.id=r.code_id where r.user_id=p_user_id and r.request_id=p_request_id;
    if found then
      if v_existing_hash is distinct from p_code_hash then raise exception using message='idempotency_key_reused',errcode='P0001'; end if;
      return true;
    end if;
  end if;
  delete from private.membership_rate_limits where user_id=p_user_id and bucket_start < pg_catalog.now()-interval '1 day';
  v_start:=pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from pg_catalog.now())/p_window_seconds)*p_window_seconds);
  insert into private.membership_rate_limits(user_id,action,bucket_start,count) values(p_user_id,p_action,v_start,1)
    on conflict(user_id,action,bucket_start) do update set count=private.membership_rate_limits.count+1 returning count into v_count;
  return v_count<=p_max_count;
end;
$$;
revoke all on function private.consume_membership_rate_limit(uuid,text,integer,integer,uuid,text) from public,anon,authenticated;
grant execute on function private.consume_membership_rate_limit(uuid,text,integer,integer,uuid,text) to service_role;

-- PostgREST only exposes the project's public schema to the service client.
-- Keep the implementation private and publish a narrowly granted RPC wrapper.
create or replace function public.consume_membership_rate_limit(p_user_id uuid,p_action text,p_max_count integer,p_window_seconds integer,p_request_id uuid default null,p_code_hash text default null)
returns boolean language sql security definer set search_path=''
as $$ select private.consume_membership_rate_limit(p_user_id,p_action,p_max_count,p_window_seconds,p_request_id,p_code_hash); $$;
revoke all on function public.consume_membership_rate_limit(uuid,text,integer,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.consume_membership_rate_limit(uuid,text,integer,integer,uuid,text) to service_role;

create or replace function public.preview_membership_code(p_user_id uuid,p_code_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_code public.redeem_codes%rowtype; v_profile public.profiles%rowtype; v_tier text; v_active public.user_membership_periods%rowtype; v_tail public.user_membership_periods%rowtype; v_start timestamptz; v_end timestamptz; v_conversion_days integer; v_old_quota integer; v_new_quota integer;
begin
  select * into v_code from public.redeem_codes where code_hash=p_code_hash;
  if not found then raise exception using message='redeem_code_invalid',errcode='P0001'; end if;
  if v_code.status='redeemed' then raise exception using message='redeem_code_used',errcode='P0001'; end if;
  if v_code.status='disabled' then raise exception using message='redeem_code_disabled',errcode='P0001'; end if;
  if v_code.expires_at is not null and v_code.expires_at<=now() then raise exception using message='redeem_code_expired',errcode='P0001'; end if;
  select * into v_profile from public.profiles where id=p_user_id;
  if not found then raise exception using message='profile_not_found',errcode='P0001'; end if;
  v_tier:=private.effective_membership_tier(p_user_id,now());
  select * into v_active from public.user_membership_periods where user_id=p_user_id and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now()) order by starts_at desc,created_at desc limit 1;
  select * into v_tail from public.user_membership_periods where user_id=p_user_id and revoked_at is null order by coalesce(ends_at,'infinity'::timestamptz) desc,starts_at desc limit 1;
  if v_active.id is not null and v_active.ends_at is null and (case v_code.tier when 'pro' then 2 else 1 end)<=(case v_active.tier when 'pro' then 2 else 1 end) then raise exception using message='permanent_membership_already_active',errcode='P0001'; end if;
  if v_active.id is not null and v_active.ends_at is null then v_start:=now(); v_end:=now()+make_interval(days=>v_code.duration_days);
  elsif v_active.id is not null and v_active.tier=v_code.tier then v_start:=v_active.starts_at; v_end:=v_active.ends_at+make_interval(days=>v_code.duration_days);
  elsif v_active.id is not null and (case v_code.tier when 'pro' then 2 else 1 end)>(case v_active.tier when 'pro' then 2 else 1 end) then
    select daily_flips into v_old_quota from public.membership_plans where tier=v_active.tier;
    select daily_flips into v_new_quota from public.membership_plans where tier=v_code.tier;
    v_conversion_days:=ceil(greatest(0,extract(epoch from(v_active.ends_at-now()))/86400)*v_old_quota::numeric/v_new_quota)::integer;
    v_start:=now(); v_end:=now()+make_interval(days=>v_conversion_days+v_code.duration_days);
  elsif v_tail.id is not null and v_tail.ends_at>now() and v_tail.tier=v_code.tier then v_start:=v_tail.starts_at; v_end:=v_tail.ends_at+make_interval(days=>v_code.duration_days);
  else v_start:=greatest(now(),coalesce(v_tail.ends_at,now())); v_end:=v_start+make_interval(days=>v_code.duration_days); end if;
  return pg_catalog.jsonb_build_object('tier',v_code.tier,'durationDays',v_code.duration_days,'currentTier',v_tier,'effectiveFrom',v_start,'expiresAt',v_end);
end;
$$;

create or replace function public.redeem_membership_code(p_user_id uuid,p_code_hash text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_prior public.redemption_records%rowtype; v_code public.redeem_codes%rowtype; v_profile public.profiles%rowtype;
  v_old_tier text; v_new_tier text; v_now timestamptz:=now(); v_active public.user_membership_periods%rowtype;
  v_tail public.user_membership_periods%rowtype; v_start timestamptz; v_end timestamptz; v_old_end timestamptz;
  v_shift interval:=interval '0'; v_conversion_days integer; v_old_quota integer; v_new_quota integer;
  v_record_id uuid; v_result jsonb; v_insert_period boolean:=true;
begin
  if p_request_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception using message='invalid_redeem_request',errcode='22023'; end if;
  -- Serialize all redemptions for one profile. This also makes a retried
  -- request idempotent under concurrent duplicate HTTP requests.
  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found then raise exception using message='profile_not_found',errcode='P0001'; end if;
  select r.* into v_prior
    from public.redemption_records r
    join public.redeem_codes c on c.id=r.code_id
   where r.user_id=p_user_id and r.request_id=p_request_id;
  if found then
    if not exists(select 1 from public.redemption_records r join public.redeem_codes c on c.id=r.code_id where r.user_id=p_user_id and r.request_id=p_request_id and c.code_hash=p_code_hash) then
      raise exception using message='idempotency_key_reused',errcode='P0001';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('idempotent',true);
  end if;
  select * into v_code from public.redeem_codes where code_hash=p_code_hash for update;
  if not found then raise exception using message='redeem_code_invalid',errcode='P0001'; end if;
  if v_code.status='redeemed' then raise exception using message='redeem_code_used',errcode='P0001'; end if;
  if v_code.status='disabled' then raise exception using message='redeem_code_disabled',errcode='P0001'; end if;
  if v_code.expires_at is not null and v_code.expires_at<=v_now then raise exception using message='redeem_code_expired',errcode='P0001'; end if;

  v_old_tier:=private.effective_membership_tier(p_user_id,v_now); v_new_tier:=v_code.tier;
  select * into v_active from public.user_membership_periods where user_id=p_user_id and revoked_at is null and starts_at<=v_now and (ends_at is null or ends_at>v_now) order by starts_at desc,created_at desc limit 1 for update;
  select * into v_tail from public.user_membership_periods where user_id=p_user_id and revoked_at is null order by coalesce(ends_at,'infinity'::timestamptz) desc,starts_at desc limit 1;

  if v_active.id is not null then
    if v_active.ends_at is null and (case v_new_tier when 'pro' then 2 else 1 end)<=(case v_active.tier when 'pro' then 2 else 1 end) then
      raise exception using message='permanent_membership_already_active',errcode='P0001';
    elsif v_active.ends_at is null then
      -- Legacy perpetual rights remain as the fallback after this temporary grant.
      v_start:=v_now; v_end:=v_now+make_interval(days=>v_code.duration_days);
    elsif v_new_tier=v_active.tier then
      v_start:=v_active.starts_at; v_old_end:=v_active.ends_at; v_end:=v_old_end+make_interval(days=>v_code.duration_days);
      v_shift:=v_end-v_old_end;
      update public.user_membership_periods set ends_at=v_end where id=v_active.id;
      update public.user_membership_periods set starts_at=starts_at+v_shift,ends_at=ends_at+v_shift where user_id=p_user_id and starts_at>=v_old_end and id<>v_active.id;
      v_insert_period:=false;
    elsif (case v_new_tier when 'pro' then 2 else 1 end)>(case v_active.tier when 'pro' then 2 else 1 end) then
      select daily_flips into v_old_quota from public.membership_plans where tier=v_active.tier;
      select daily_flips into v_new_quota from public.membership_plans where tier=v_new_tier;
      v_conversion_days:=ceil(greatest(0,extract(epoch from (v_active.ends_at-v_now))/86400)*v_old_quota::numeric/v_new_quota)::integer;
      v_start:=v_now; v_end:=v_now+make_interval(days=>v_conversion_days+v_code.duration_days); v_old_end:=v_active.ends_at; v_shift:=v_end-v_old_end;
      update public.user_membership_periods set ends_at=v_now where id=v_active.id;
      update public.user_membership_periods set starts_at=starts_at+v_shift,ends_at=ends_at+v_shift where user_id=p_user_id and starts_at>=v_old_end and id<>v_active.id;
    else
      v_start:=greatest(v_active.ends_at,coalesce(v_tail.ends_at,v_active.ends_at));
      if v_tail.id is not null and v_tail.tier=v_new_tier and v_tail.ends_at>v_now then
        update public.user_membership_periods set ends_at=ends_at+make_interval(days=>v_code.duration_days) where id=v_tail.id;
        v_start:=v_tail.starts_at; v_end:=v_tail.ends_at+make_interval(days=>v_code.duration_days);
        v_insert_period:=false;
      else v_start:=greatest(v_now,coalesce(v_tail.ends_at,v_now)); v_end:=v_start+make_interval(days=>v_code.duration_days); end if;
    end if;
  else
    if v_tail.id is not null and v_tail.ends_at is null then
      if (case v_new_tier when 'pro' then 2 else 1 end)<=(case v_tail.tier when 'pro' then 2 else 1 end) then raise exception using message='permanent_membership_already_active',errcode='P0001'; end if;
      v_start:=v_now; v_end:=v_now+make_interval(days=>v_code.duration_days);
    elsif v_tail.id is not null and v_tail.tier=v_new_tier and v_tail.ends_at>v_now then
      v_start:=v_tail.starts_at; v_end:=v_tail.ends_at+make_interval(days=>v_code.duration_days);
      update public.user_membership_periods set ends_at=v_end where id=v_tail.id;
      v_insert_period:=false;
    else
      v_start:=greatest(v_now,coalesce(v_tail.ends_at,v_now)); v_end:=v_start+make_interval(days=>v_code.duration_days);
    end if;
  end if;

  if v_insert_period then
    insert into public.user_membership_periods(user_id,tier,starts_at,ends_at,source,code_id) values(p_user_id,v_new_tier,v_start,v_end,'redeem',v_code.id);
  end if;
  update public.redeem_codes set status='redeemed',redeemed_at=v_now,redeemed_by=p_user_id where id=v_code.id;
  select id into v_record_id from public.redemption_records where user_id=p_user_id and request_id=p_request_id;
  v_result:=pg_catalog.jsonb_build_object('tier',v_new_tier,'durationDays',v_code.duration_days,'effectiveFrom',v_start,'expiresAt',v_end,'membershipTier',private.effective_membership_tier(p_user_id,v_now),'idempotent',false);
  insert into public.redemption_records(request_id,user_id,code_id,tier,duration_days,effective_from,expires_at,result)
    values(p_request_id,p_user_id,v_code.id,v_new_tier,v_code.duration_days,v_start,v_end,v_result) returning id into v_record_id;
  update public.profiles set membership_tier=private.effective_membership_tier(p_user_id,v_now),membership_expires_at=(select ends_at from public.user_membership_periods where user_id=p_user_id and revoked_at is null and starts_at<=v_now and (ends_at is null or ends_at>v_now) order by starts_at desc,created_at desc limit 1) where id=p_user_id;
  insert into public.membership_events(user_id,event_type,old_tier,new_tier,starts_at,ends_at,source,details)
    values(p_user_id,case when v_start>v_now then 'queued' else case when v_old_tier=v_new_tier then 'extended' else 'redeemed' end end,v_old_tier,case when v_start>v_now then v_new_tier else private.effective_membership_tier(p_user_id,v_now) end,v_start,v_end,'redeem',pg_catalog.jsonb_build_object('redemptionId',v_record_id,'codeSuffix',v_code.code_suffix,'durationDays',v_code.duration_days));
  return v_result;
end;
$$;

create or replace function public.sync_expired_memberships()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  with current_values as (
    select p.id,p.membership_tier old_tier,private.effective_membership_tier(p.id,now()) tier,
      (select m.ends_at from public.user_membership_periods m where m.user_id=p.id and m.revoked_at is null and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) order by m.starts_at desc,m.created_at desc limit 1) expires_at
    from public.profiles p where p.membership_tier<>'free' or exists(select 1 from public.user_membership_periods m where m.user_id=p.id)
  ), changed as (
    update public.profiles p set membership_tier=c.tier,membership_expires_at=c.expires_at
      from current_values c where p.id=c.id and (p.membership_tier is distinct from c.tier or p.membership_expires_at is distinct from c.expires_at)
      returning p.id,p.membership_tier,p.membership_expires_at
  ), events as (
    insert into public.membership_events(user_id,event_type,old_tier,new_tier,starts_at,ends_at,source,reason)
      select c.id,'expired',c.old_tier,x.membership_tier,now(),x.membership_expires_at,'expiry_sync','会员权益到期或切换到后续有效权益'
      from changed x join current_values c on c.id=x.id
      where c.old_tier is distinct from x.membership_tier
      returning id
  )
  select count(*)::integer into v_count from changed;
  return v_count;
end;
$$;

revoke all on function public.preview_membership_code(uuid,text) from public,anon,authenticated;
revoke all on function public.redeem_membership_code(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.sync_expired_memberships() from public,anon,authenticated;
grant execute on function public.preview_membership_code(uuid,text) to service_role;
grant execute on function public.redeem_membership_code(uuid,text,uuid) to service_role;
grant execute on function public.sync_expired_memberships() to service_role;

create or replace function public.admin_adjust_membership(p_user_id uuid,p_actor_id uuid,p_tier text,p_duration_days integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_old_tier text; v_start timestamptz:=now(); v_end timestamptz;
begin
  if p_tier not in ('free','plus','pro') or (p_tier<>'free' and (p_duration_days is null or p_duration_days not between 1 and 7300)) or (p_tier='free' and p_duration_days is not null) or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception using message='invalid_admin_membership_adjustment',errcode='22023'; end if;
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception using message='profile_not_found',errcode='P0001'; end if;
  v_old_tier:=private.effective_membership_tier(p_user_id,now());
  update public.user_membership_periods set revoked_at=now(),revoked_by=p_actor_id,revoke_reason=trim(p_reason) where user_id=p_user_id and revoked_at is null and (ends_at is null or ends_at>now());
  if p_tier<>'free' then
    v_end:=v_start+make_interval(days=>p_duration_days);
    insert into public.user_membership_periods(user_id,tier,starts_at,ends_at,source) values(p_user_id,p_tier,v_start,v_end,'admin');
  else v_end:=null; end if;
  update public.profiles set membership_tier=p_tier,membership_expires_at=v_end where id=p_user_id;
  insert into public.membership_events(user_id,actor_id,event_type,old_tier,new_tier,starts_at,ends_at,source,reason)
    values(p_user_id,p_actor_id,case when p_tier='free' then 'revoked' else 'granted' end,v_old_tier,p_tier,v_start,v_end,'admin',trim(p_reason));
  return pg_catalog.jsonb_build_object('userId',p_user_id,'tier',p_tier,'startsAt',v_start,'expiresAt',v_end);
end;
$$;
revoke all on function public.admin_adjust_membership(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_adjust_membership(uuid,uuid,text,integer,text) to service_role;

create or replace function public.reserve_redeem_batch_export(p_batch_id uuid,p_actor_id uuid,p_export_ref uuid,p_label text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_batch public.redeem_code_batches%rowtype; v_codes jsonb;
begin
  if p_export_ref is null or length(trim(coalesce(p_label,''))) not between 2 and 120 then raise exception using message='invalid_export_request',errcode='22023'; end if;
  select * into v_batch from public.redeem_code_batches where id=p_batch_id for update;
  if not found then raise exception using message='batch_not_found',errcode='P0001'; end if;
  if v_batch.export_ref is null then
    update public.redeem_code_batches set export_ref=p_export_ref,export_label=trim(p_label),exported_at=now(),exported_by=p_actor_id where id=p_batch_id returning * into v_batch;
  elsif v_batch.export_ref<>p_export_ref or v_batch.export_label<>trim(p_label) then
    raise exception using message='batch_already_distributed',errcode='P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code_ciphertext',c.code_ciphertext,'code_suffix',c.code_suffix) order by c.created_at),'[]'::jsonb)
    into v_codes from public.redeem_codes c where c.batch_id=p_batch_id and c.status='available';
  return jsonb_build_object('batchId',p_batch_id,'exportRef',v_batch.export_ref,'label',v_batch.export_label,'codes',v_codes);
end;
$$;
revoke all on function public.reserve_redeem_batch_export(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_redeem_batch_export(uuid,uuid,uuid,text) to service_role;

create or replace function public.admin_membership_batch_stats()
returns jsonb language sql security definer set search_path=''
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb)
  from (
    select b.id,b.name,b.tier,b.duration_days,b.code_count,b.export_ref,b.export_label,b.exported_at,b.created_at,
      count(c.id) filter(where c.status='available') as available_count,
      count(c.id) filter(where c.status='redeemed') as redeemed_count,
      count(c.id) filter(where c.status='disabled') as disabled_count
    from public.redeem_code_batches b left join public.redeem_codes c on c.batch_id=b.id
    group by b.id
    order by b.created_at desc
    limit 100
  ) s;
$$;
revoke all on function public.admin_membership_batch_stats() from public,anon,authenticated;
grant execute on function public.admin_membership_batch_stats() to service_role;

create or replace function public.admin_membership_dashboard_stats()
returns jsonb language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'freeUsers',(select count(*) from public.profiles where private.effective_membership_tier(id,now())='free'),
    'plusUsers',(select count(*) from public.profiles where private.effective_membership_tier(id,now())='plus'),
    'proUsers',(select count(*) from public.profiles where private.effective_membership_tier(id,now())='pro'),
    'generatedCodes',(select count(*) from public.redeem_codes),
    'redeemedCodes',(select count(*) from public.redeem_codes where status='redeemed'),
    'availableCodes',(select count(*) from public.redeem_codes where status='available'),
    'disabledCodes',(select count(*) from public.redeem_codes where status='disabled'),
    'verifiedSupportCents',(select coalesce(sum(amount_cents),0) from public.afdian_orders where payment_status='paid' and processing_status in ('verified','fulfilled')),
    'unverifiedOrders',(select count(*) from public.afdian_orders where processing_status in ('pending','needs_review'))
  );
$$;
revoke all on function public.admin_membership_dashboard_stats() from public,anon,authenticated;
grant execute on function public.admin_membership_dashboard_stats() to service_role;

-- The daily flip transaction remains the quota authority. It now resolves a
-- current/queued entitlement from the same membership ledger as redemption.
create or replace function private.daily_flip_state(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_timezone text; v_tier text; v_today date; v_base integer; v_bonus integer; v_opened integer; v_ids jsonb;
begin
  if auth.uid() is distinct from p_user_id then raise exception using message='user_scope_violation',errcode='42501'; end if;
  select coalesce(p.timezone,'Asia/Shanghai') into v_timezone from public.profiles p where p.id=p_user_id;
  if not found then raise exception using message='profile_not_found',errcode='P0001'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then v_timezone:='Asia/Shanghai'; end if;
  v_tier:=private.effective_membership_tier(p_user_id,now());
  select daily_flips into v_base from public.membership_plans where tier=v_tier and enabled;
  v_base:=coalesce(v_base,case v_tier when 'plus' then 9 when 'pro' then 13 else 5 end);
  v_today:=(pg_catalog.now() at time zone v_timezone)::date;
  select coalesce(d.bonus_total,0) into v_bonus from private.daily_flip_days d where d.user_id=p_user_id and d.local_date=v_today;
  v_bonus:=coalesce(v_bonus,0);
  select count(distinct i.post_id)::integer,coalesce(pg_catalog.jsonb_agg(distinct p.client_id order by p.client_id) filter(where p.client_id is not null),'[]'::jsonb)
    into v_opened,v_ids from public.user_interactions i join public.posts p on p.id=i.post_id where i.user_id=p_user_id and p.channel='community' and i.opened_at>=(v_today::timestamp at time zone v_timezone) and i.opened_at<((v_today+1)::timestamp at time zone v_timezone);
  -- Keep the exact keys consumed by the current Android and web clients.
  -- Aliases are additive; openedIds must remain stable or cached flip state
  -- would look empty after this migration.
  return pg_catalog.jsonb_build_object('localDate',v_today,'timezone',v_timezone,'membershipTier',v_tier,'baseAllowance',v_base,'bonus',v_bonus,'allowance',v_base+v_bonus,'openedCount',coalesce(v_opened,0),'openedIds',coalesce(v_ids,'[]'::jsonb),'used',coalesce(v_opened,0),'openedPostIds',coalesce(v_ids,'[]'::jsonb),'remaining',greatest(0,v_base+v_bonus-coalesce(v_opened,0)));
end;
$$;

create or replace function private.confirm_daily_flip(p_post_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_now timestamptz:=pg_catalog.clock_timestamp(); v_timezone text; v_tier text; v_today date; v_base integer; v_bonus integer; v_used integer; v_roll double precision; v_award integer:=0; v_rating_count integer:=0; v_rating_sum integer:=0; v_rarity_tier text; v_opened_at timestamptz; v_attempt private.daily_flip_attempts%rowtype; v_existing_key private.daily_flip_attempts%rowtype; v_result jsonb;
begin
  if v_user is null then raise exception using message='authentication_required',errcode='42501'; end if;
  if p_post_id is null or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 120 then raise exception using message='invalid_flip_request',errcode='22023'; end if;
  if not exists(select 1 from public.posts p where p.id=p_post_id and p.channel='community' and p.status='published') then raise exception using message='daily_card_unavailable',errcode='P0001'; end if;
  select coalesce(p.timezone,'Asia/Shanghai') into v_timezone from public.profiles p where p.id=v_user;
  if not found then raise exception using message='profile_not_found',errcode='P0001'; end if;
  v_tier:=private.effective_membership_tier(v_user,v_now);
  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then v_timezone:='Asia/Shanghai'; end if;
  select daily_flips into v_base from public.membership_plans where tier=v_tier and enabled;
  v_base:=coalesce(v_base,case v_tier when 'plus' then 9 when 'pro' then 13 else 5 end);
  v_today:=(v_now at time zone v_timezone)::date;
  select coalesce(sum(s.rating_count),0)::integer,coalesce(sum(s.rating_sum),0)::integer into v_rating_count,v_rating_sum from public.post_rating_stats s where s.post_id=p_post_id;
  v_rarity_tier:=case when v_rating_count<5 then 'pending' when v_rating_sum::numeric/v_rating_count>=4.8 and v_rating_count>=20 then 'SSS' when v_rating_sum::numeric/v_rating_count>=4.5 and v_rating_count>=10 then 'SS' when v_rating_sum::numeric/v_rating_count>=4.0 then 'S' else 'ordinary' end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text||':'||v_today::text,0));
  insert into private.daily_flip_days(user_id,local_date,bonus_total) values(v_user,v_today,0) on conflict(user_id,local_date) do nothing;
  select d.bonus_total into v_bonus from private.daily_flip_days d where d.user_id=v_user and d.local_date=v_today for update;
  select a.* into v_existing_key from private.daily_flip_attempts a where a.user_id=v_user and a.local_date=v_today and a.idempotency_key=p_idempotency_key;
  if found then if v_existing_key.post_id<>p_post_id then raise exception using message='idempotency_key_reused',errcode='P0001'; end if; return private.daily_flip_state(v_user)||pg_catalog.jsonb_build_object('postId',(select p.client_id from public.posts p where p.id=p_post_id),'bonusAwarded',v_existing_key.bonus_awarded,'openedAt',v_existing_key.opened_at,'idempotent',true); end if;
  select a.* into v_attempt from private.daily_flip_attempts a where a.user_id=v_user and a.local_date=v_today and a.post_id=p_post_id;
  if found then return private.daily_flip_state(v_user)||pg_catalog.jsonb_build_object('postId',(select p.client_id from public.posts p where p.id=p_post_id),'bonusAwarded',v_attempt.bonus_awarded,'openedAt',v_attempt.opened_at,'idempotent',true); end if;
  select i.opened_at into v_opened_at from public.user_interactions i where i.user_id=v_user and i.post_id=p_post_id and i.opened_at>=(v_today::timestamp at time zone v_timezone) and i.opened_at<((v_today+1)::timestamp at time zone v_timezone);
  if found then return private.daily_flip_state(v_user)||pg_catalog.jsonb_build_object('postId',(select p.client_id from public.posts p where p.id=p_post_id),'bonusAwarded',0,'openedAt',v_opened_at,'idempotent',true); end if;
  select count(distinct i.post_id)::integer into v_used from public.user_interactions i join public.posts p on p.id=i.post_id where i.user_id=v_user and p.channel='community' and i.opened_at>=(v_today::timestamp at time zone v_timezone) and i.opened_at<((v_today+1)::timestamp at time zone v_timezone);
  if v_used>=v_base+v_bonus then raise exception using message='daily_flip_limit_reached',errcode='P0001'; end if;
  if v_bonus<10 then v_roll:=pg_catalog.random(); v_award:=case when v_roll<0.001 then 10 when v_roll<0.016 then 5 when v_roll<0.066 then 3 when v_roll<0.166 then 2 else 0 end; v_award:=least(v_award,10-v_bonus); end if;
  update private.daily_flip_days set bonus_total=bonus_total+v_award,updated_at=v_now where user_id=v_user and local_date=v_today;
  insert into public.user_interactions(user_id,post_id,opened_at,rarity_tier) values(v_user,p_post_id,v_now,v_rarity_tier) on conflict(user_id,post_id) do update set opened_at=excluded.opened_at,rarity_tier=excluded.rarity_tier;
  insert into private.daily_flip_attempts(user_id,local_date,post_id,idempotency_key,bonus_awarded,opened_at) values(v_user,v_today,p_post_id,p_idempotency_key,v_award,v_now);
  return private.daily_flip_state(v_user)||pg_catalog.jsonb_build_object('postId',(select p.client_id from public.posts p where p.id=p_post_id),'bonusAwarded',v_award,'openedAt',v_now,'idempotent',false);
end;
$$;

-- User-scoped API access is through authenticated, filtered endpoints; raw code
-- inventory and decrypted codes are never exposed by PostgREST.
