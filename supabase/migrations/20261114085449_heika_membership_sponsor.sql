-- HEIKA membership support: additive schema only. Existing profiles, EXP, and
-- card history remain intact. All entitlement writes are performed by RPCs.

create schema if not exists membership_private;
revoke all on schema membership_private from public, anon, authenticated;

-- Keep the exact implementations that this migration replaces so the guarded
-- rollback can restore them without depending on copied SQL from old releases.
create table if not exists membership_private.rollback_function_defs (
  signature text primary key,
  definition text not null
);
insert into membership_private.rollback_function_defs(signature,definition)
select signatures.signature,pg_get_functiondef(p.oid)
from unnest(array[
  'public.set_membership_tier(uuid,text)',
  'public.confirm_daily_flip(uuid,text)',
  'public.get_daily_flip_state()',
  'public.get_daily_deck()',
  'public.open_daily_card(integer)',
  'public.open_daily_card_with_result(integer)',
  'public.record_experience_event(text,uuid)',
  'public.my_experience_summary()'
]) as signatures(signature)
join pg_proc p on p.oid=to_regprocedure(signatures.signature)
on conflict(signature) do nothing;
do $$ begin
  if (select count(*) from membership_private.rollback_function_defs where signature=any(array[
    'public.set_membership_tier(uuid,text)',
    'public.get_daily_deck()',
    'public.open_daily_card(integer)',
    'public.record_experience_event(text,uuid)',
    'public.my_experience_summary()'
  ]))<>5 then
    raise exception 'membership migration could not snapshot all functions required for rollback';
  end if;
end $$;

create table public.membership_plans (
  tier text primary key check (tier in ('free','plus','pro')),
  name text not null,
  daily_flip_allowance integer not null check (daily_flip_allowance between 1 and 13),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'CNY' check (currency ~ '^[A-Z]{3}$'),
  duration_days integer check (duration_days is null or duration_days between 1 and 3650),
  benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  active boolean not null default true,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.membership_plans(tier,name,daily_flip_allowance,price_cents,currency,duration_days,benefits,sort_order)
values
  ('free','Free',5,0,'CNY',null,'["每日 5 次翻卡","基础内容浏览","社区互动","基础收藏功能"]'::jsonb,1),
  ('plus','Plus',9,1200,'CNY',30,'["每日 9 次翻卡","包含 Free 权益","更多探索机会","支持独立开发"]'::jsonb,2),
  ('pro','Pro',13,1600,'CNY',30,'["每日 13 次翻卡","包含 Plus 权益","更充足的探索额度","支持黑卡持续维护"]'::jsonb,3)
on conflict (tier) do nothing;

create table public.user_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free','plus','pro')),
  starts_at timestamptz,
  expires_at timestamptz,
  pending_tier text check (pending_tier is null or pending_tier in ('plus','pro')),
  pending_days integer not null default 0 check (pending_days between 0 and 36500),
  source text not null default 'legacy' check (source in ('legacy','admin','redeem','afdian')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((pending_tier is null and pending_days = 0) or (pending_tier is not null and pending_days > 0))
);

-- Existing paid/admin tiers are preserved as non-expiring legacy grants.
insert into public.user_memberships(user_id,tier,source,starts_at)
select p.id,p.membership_tier,'legacy',p.created_at
from public.profiles p
where p.membership_tier in ('plus','pro')
on conflict (user_id) do nothing;

create table public.redeem_code_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 100),
  tier text not null references public.membership_plans(tier) check (tier in ('plus','pro')),
  duration_days integer not null check (duration_days between 1 and 3650),
  quantity integer not null check (quantity between 1 and 500),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.redeem_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.redeem_code_batches(id) on delete restrict,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  tier text not null references public.membership_plans(tier) check (tier in ('plus','pro')),
  duration_days integer not null check (duration_days between 1 and 3650),
  status text not null default 'unused' check (status in ('unused','redeemed','disabled')),
  expires_at timestamptz,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'redeemed') = (redeemed_at is not null))
);
create index redeem_codes_batch_status_idx on public.redeem_codes(batch_id,status);
create index redeem_codes_status_created_idx on public.redeem_codes(status,created_at desc);
create index redeem_codes_redeemed_by_idx on public.redeem_codes(redeemed_by,redeemed_at desc) where redeemed_by is not null;

create table public.membership_redemption_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_day date not null,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key(user_id,attempt_day)
);

create table public.membership_redemption_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_id uuid not null references public.redeem_codes(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index membership_redemption_previews_expiry_idx on public.membership_redemption_previews(expires_at) where confirmed_at is null;

create table public.membership_redemptions (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid not null unique references public.membership_redemption_previews(id),
  code_id uuid not null unique references public.redeem_codes(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null references public.membership_plans(tier),
  duration_days integer not null,
  activation_state text not null check (activation_state in ('active','queued')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index membership_redemptions_user_time_idx on public.membership_redemptions(user_id,created_at desc);
create index membership_redemptions_created_idx on public.membership_redemptions(created_at desc);

create table public.membership_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('legacy_import','admin_grant','admin_change','admin_revoke','code_redeemed','membership_expired','pending_membership_started','batch_created','batch_paused','batch_resumed','code_disabled','afdian_order_recorded','afdian_order_verified','afdian_order_rejected')),
  tier text not null check (tier in ('free','plus','pro')),
  source text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index membership_events_user_time_idx on public.membership_events(user_id,created_at desc);
insert into public.membership_events(user_id,event_type,tier,source,details)
select p.id,'legacy_import',p.membership_tier,'legacy',jsonb_build_object('source','profiles.membership_tier')
from public.profiles p where p.membership_tier in ('plus','pro')
  and not exists(select 1 from public.membership_events e where e.user_id=p.id and e.event_type='legacy_import');

create table public.afdian_orders (
  id uuid primary key default gen_random_uuid(),
  provider_order_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  tier text not null references public.membership_plans(tier) check (tier in ('plus','pro')),
  duration_days integer not null check (duration_days between 1 and 3650),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'CNY' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','verified','invalid','refunded')),
  provider_user_ref text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  processed_at timestamptz,
  failure_reason text,
  safe_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index afdian_orders_status_time_idx on public.afdian_orders(status,created_at desc);

alter table public.membership_plans enable row level security;
alter table public.user_memberships enable row level security;
alter table public.redeem_code_batches enable row level security;
alter table public.redeem_codes enable row level security;
alter table public.membership_redemption_attempts enable row level security;
alter table public.membership_redemption_previews enable row level security;
alter table public.membership_redemptions enable row level security;
alter table public.membership_events enable row level security;
alter table public.afdian_orders enable row level security;

revoke all on public.membership_plans,public.user_memberships,public.redeem_code_batches,public.redeem_codes,
  public.membership_redemption_attempts,public.membership_redemption_previews,public.membership_redemptions,
  public.membership_events,public.afdian_orders
  from anon,authenticated;
grant select on public.membership_plans to anon,authenticated;
grant update (name,price_cents,currency,duration_days,benefits,sort_order,updated_at)
  on public.membership_plans to authenticated;
grant select on public.user_memberships,public.redeem_code_batches,public.redeem_codes,
  public.membership_redemptions,public.membership_events,public.afdian_orders to authenticated;

create policy membership_plans_active_read on public.membership_plans for select to anon,authenticated using (active);
create policy membership_plans_admin_read on public.membership_plans for select to authenticated using ((select public.is_admin()));
create policy membership_plans_admin_update on public.membership_plans for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy user_memberships_own_read on public.user_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy redeem_batches_admin_read on public.redeem_code_batches for select to authenticated using ((select public.is_admin()));
create policy redeem_codes_admin_read on public.redeem_codes for select to authenticated using ((select public.is_admin()));
create policy membership_redemptions_own_read on public.membership_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy membership_events_own_read on public.membership_events for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy afdian_orders_admin_read on public.afdian_orders for select to authenticated using ((select public.is_admin()));

create or replace function membership_private.sync_user(p_user_id uuid,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.user_memberships%rowtype; v_tier text; v_changed boolean := false;
begin
  select coalesce(p.membership_tier,'free') into v_tier from public.profiles p where p.id=p_user_id;
  if not found then raise exception 'profile missing'; end if;
  select * into m from public.user_memberships um where um.user_id=p_user_id for update;
  if not found then
    return jsonb_build_object('tier',v_tier,'startsAt',null,'expiresAt',null,'pendingTier',null,'pendingDays',0,'source','legacy');
  end if;
  if m.tier <> 'free' and m.expires_at is not null and m.expires_at <= now() then
    if m.pending_tier is not null and m.pending_days > 0 then
      update public.user_memberships set tier=m.pending_tier,starts_at=now(),expires_at=now()+make_interval(days=>m.pending_days),
        pending_tier=null,pending_days=0,source='redeem',updated_at=now(),updated_by=null where user_id=p_user_id returning * into m;
      update public.profiles set membership_tier=m.tier where id=p_user_id;
      insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
      values(p_user_id,p_actor_id,'pending_membership_started',m.tier,'redeem',jsonb_build_object('expiresAt',m.expires_at));
    else
      update public.user_memberships set tier='free',starts_at=null,expires_at=null,source='legacy',updated_at=now(),updated_by=null where user_id=p_user_id returning * into m;
      update public.profiles set membership_tier='free' where id=p_user_id;
      insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
      values(p_user_id,p_actor_id,'membership_expired','free','system',jsonb_build_object('previousTier',v_tier));
    end if;
    v_changed := true;
  end if;
  return jsonb_build_object('tier',m.tier,'startsAt',m.starts_at,'expiresAt',m.expires_at,
    'pendingTier',m.pending_tier,'pendingDays',m.pending_days,'source',m.source,'changed',v_changed);
end;
$$;
revoke all on function membership_private.sync_user(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_my_membership_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v_state jsonb; v_quota jsonb; v_tier text; v_plan public.membership_plans%rowtype;
begin
  if uid is null then raise exception 'authentication required'; end if;
  v_state:=membership_private.sync_user(uid,null);
  v_tier:=coalesce(v_state->>'tier','free');
  select * into v_plan from public.membership_plans p where p.tier=v_tier and p.active;
  if not found then select * into v_plan from public.membership_plans p where p.tier='free'; end if;
  v_quota:=private.daily_flip_state(uid);
  return v_state || jsonb_build_object('dailyFlipAllowance',coalesce((v_quota->>'allowance')::integer,v_plan.daily_flip_allowance),
    'baseDailyFlipAllowance',coalesce((v_quota->>'baseAllowance')::integer,v_plan.daily_flip_allowance),
    'dailyFlipsUsed',coalesce((v_quota->>'openedCount')::integer,0),'dailyLuckyBonus',coalesce((v_quota->>'bonus')::integer,0),
    'plan',jsonb_build_object('tier',v_plan.tier,'name',v_plan.name,'priceCents',v_plan.price_cents,'currency',v_plan.currency,
      'durationDays',v_plan.duration_days,'benefits',v_plan.benefits));
end;
$$;
revoke all on function public.get_my_membership_status() from public,anon;
grant execute on function public.get_my_membership_status() to authenticated;

create or replace function public.admin_set_membership(p_user_id uuid,p_tier text,p_days integer,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v_expiry timestamptz;
begin
  if uid is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if p_tier not in ('free','plus','pro') then raise exception 'invalid membership tier'; end if;
  if p_tier='free' and p_days is not null then raise exception 'free membership has no duration'; end if;
  if p_tier<>'free' and p_days is not null and p_days not between 1 and 3650 then raise exception 'invalid membership duration'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'membership reason must be 3-500 characters'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then raise exception 'profile not found'; end if;
  if p_days is not null then v_expiry:=now()+make_interval(days=>p_days); end if;
  insert into public.user_memberships(user_id,tier,starts_at,expires_at,pending_tier,pending_days,source,updated_by,updated_at)
  values(p_user_id,p_tier,case when p_tier='free' then null else now() end,v_expiry,null,0,'admin',uid,now())
  on conflict(user_id) do update set tier=excluded.tier,starts_at=excluded.starts_at,expires_at=excluded.expires_at,
    pending_tier=null,pending_days=0,source='admin',updated_by=uid,updated_at=now();
  update public.profiles set membership_tier=p_tier where id=p_user_id;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
  values(p_user_id,uid,case when p_tier='free' then 'admin_revoke' when p_days is null then 'admin_grant' else 'admin_change' end,
    p_tier,'admin',jsonb_build_object('days',p_days,'expiresAt',v_expiry,'reason',btrim(p_reason)));
  return jsonb_build_object('userId',p_user_id,'tier',p_tier,'startsAt',case when p_tier='free' then null else now() end,
    'expiresAt',v_expiry,'source','admin');
end;
$$;
revoke all on function public.admin_set_membership(uuid,text,integer,text) from public,anon;
grant execute on function public.admin_set_membership(uuid,text,integer,text) to authenticated;

create or replace function public.admin_record_afdian_order(p_order_id text,p_user_id uuid,p_tier text,p_days integer,p_amount_cents integer,p_provider_user_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v_id uuid; v_plan public.membership_plans%rowtype;
begin
  if uid is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if char_length(btrim(coalesce(p_order_id,''))) not between 4 and 120 then raise exception 'invalid Afdian order id'; end if;
  if char_length(coalesce(p_provider_user_ref,''))>120 then raise exception 'invalid Afdian user reference'; end if;
  if p_tier not in ('plus','pro') or p_days not between 1 and 3650 or p_amount_cents<0 then raise exception 'invalid order details'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then raise exception 'profile not found'; end if;
  select * into v_plan from public.membership_plans p where p.tier=p_tier and p.active;
  if not found then raise exception 'membership plan is unavailable'; end if;
  if v_plan.duration_days is null or p_days<>v_plan.duration_days then raise exception 'order duration does not match the current plan'; end if;
  insert into public.afdian_orders(provider_order_id,user_id,tier,duration_days,amount_cents,currency,provider_user_ref,status)
    values(btrim(p_order_id),p_user_id,p_tier,p_days,p_amount_cents,v_plan.currency,nullif(btrim(coalesce(p_provider_user_ref,'')),''),'pending') returning id into v_id;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
    values(p_user_id,uid,'afdian_order_recorded',p_tier,'afdian',jsonb_build_object('orderId',v_id,'providerOrderId',btrim(p_order_id),'amountCents',p_amount_cents));
  return jsonb_build_object('id',v_id,'status','pending');
end;
$$;
revoke all on function public.admin_record_afdian_order(text,uuid,text,integer,integer,text) from public,anon;
grant execute on function public.admin_record_afdian_order(text,uuid,text,integer,integer,text) to authenticated;

create or replace function public.admin_verify_afdian_order(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); o public.afdian_orders%rowtype; m public.user_memberships%rowtype; v_plan public.membership_plans%rowtype;
  v_start timestamptz; v_end timestamptz; v_state text:='active'; v_pending_days integer:=0;
begin
  if uid is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'verification reason must be 3-500 characters'; end if;
  select * into o from public.afdian_orders a where a.id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status='verified' then return jsonb_build_object('status','verified','tier',o.tier,'userId',o.user_id,'expiresAt',(select um.expires_at from public.user_memberships um where um.user_id=o.user_id)); end if;
  if o.status<>'pending' then raise exception 'order is not pending'; end if;
  select * into v_plan from public.membership_plans p where p.tier=o.tier and p.active;
  if not found or o.currency<>v_plan.currency or o.amount_cents<>v_plan.price_cents or o.duration_days<>v_plan.duration_days then raise exception 'order details do not match the current plan'; end if;
  perform membership_private.sync_user(o.user_id,uid);
  select * into m from public.user_memberships um where um.user_id=o.user_id for update;
  if not found then insert into public.user_memberships(user_id,tier,source) values(o.user_id,'free','legacy') returning * into m; end if;
  if m.tier<>'free' and m.expires_at is null then raise exception 'permanent membership is already active'; end if;
  if m.tier='pro' and o.tier='plus' then
    v_pending_days:=case when m.pending_tier='plus' then m.pending_days else 0 end;
    v_start:=greatest(coalesce(m.expires_at,now()),now())+make_interval(days=>v_pending_days);
    v_end:=v_start+make_interval(days=>o.duration_days);
    update public.user_memberships set pending_tier='plus',pending_days=v_pending_days+o.duration_days,source='afdian',updated_at=now(),updated_by=uid where user_id=o.user_id;
    v_state:='queued';
  else
    if m.tier='free' then v_start:=now(); v_end:=v_start+make_interval(days=>o.duration_days);
    elsif m.tier=o.tier then v_start:=greatest(coalesce(m.expires_at,now()),now()); v_end:=v_start+make_interval(days=>o.duration_days);
    else v_start:=now(); v_end:=greatest(coalesce(m.expires_at,now()),now())+make_interval(days=>o.duration_days); end if;
    update public.user_memberships set tier=o.tier,starts_at=case when m.tier='free' or m.tier<>o.tier then now() else m.starts_at end,
      expires_at=v_end,source='afdian',updated_by=uid,updated_at=now() where user_id=o.user_id;
    update public.profiles set membership_tier=o.tier where id=o.user_id;
  end if;
  update public.afdian_orders set status='verified',verified_by=uid,verified_at=now(),processed_at=now(),failure_reason=null,updated_at=now() where id=o.id;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
    values(o.user_id,uid,'afdian_order_verified',o.tier,'afdian',jsonb_build_object('orderId',o.id,'providerOrderId',o.provider_order_id,'amountCents',o.amount_cents,
      'durationDays',o.duration_days,'activationState',v_state,'startsAt',v_start,'expiresAt',v_end,'reason',btrim(p_reason)));
  return jsonb_build_object('status','verified','tier',case when v_state='queued' then m.tier else o.tier end,'activationState',v_state,'startsAt',v_start,'expiresAt',v_end);
end;
$$;
revoke all on function public.admin_verify_afdian_order(uuid,text) from public,anon;
grant execute on function public.admin_verify_afdian_order(uuid,text) to authenticated;

create or replace function public.admin_reject_afdian_order(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); o public.afdian_orders%rowtype;
begin
  if uid is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'rejection reason must be 3-500 characters'; end if;
  select * into o from public.afdian_orders a where a.id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status<>'pending' then raise exception 'only pending orders can be marked invalid'; end if;
  update public.afdian_orders set status='invalid',failure_reason=btrim(p_reason),verified_by=uid,verified_at=now(),updated_at=now() where id=o.id;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
    values(o.user_id,uid,'afdian_order_rejected',o.tier,'afdian',jsonb_build_object('orderId',o.id,'providerOrderId',o.provider_order_id,'reason',btrim(p_reason)));
  return jsonb_build_object('status','invalid','orderId',o.id);
end;
$$;
revoke all on function public.admin_reject_afdian_order(uuid,text) from public,anon;
grant execute on function public.admin_reject_afdian_order(uuid,text) to authenticated;

create or replace function public.set_membership_tier(p_profile_id uuid,p_membership_tier text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if p_membership_tier not in ('free','plus','pro') then raise exception 'invalid membership tier'; end if;
  perform public.admin_set_membership(p_profile_id,p_membership_tier,null,'旧版管理员会员设置');
  return p_membership_tier;
end;
$$;
revoke all on function public.set_membership_tier(uuid,text) from public,anon;
grant execute on function public.set_membership_tier(uuid,text) to authenticated;

create or replace function membership_private.take_redemption_attempt(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count smallint;
begin
  insert into public.membership_redemption_attempts(user_id,attempt_day,attempts)
  values(p_user_id,(now() at time zone 'UTC')::date,1)
  on conflict(user_id,attempt_day) do update set attempts=public.membership_redemption_attempts.attempts+1,updated_at=now()
    where public.membership_redemption_attempts.attempts<10
  returning attempts into v_count;
  if v_count is null then raise exception 'redemption rate limit exceeded'; end if;
end;
$$;
revoke all on function membership_private.take_redemption_attempt(uuid) from public,anon,authenticated;

create or replace function public.preview_membership_code(p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); c public.redeem_codes%rowtype; b public.redeem_code_batches%rowtype; p public.membership_plans%rowtype; preview_id uuid;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_code_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','invalid'); end if;
  perform membership_private.take_redemption_attempt(uid);
  select * into c from public.redeem_codes rc where rc.code_hash=p_code_hash;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if c.status='redeemed' then return jsonb_build_object('status','already_redeemed'); end if;
  if c.status='disabled' then return jsonb_build_object('status','disabled'); end if;
  select * into b from public.redeem_code_batches rb where rb.id=c.batch_id for share;
  if not found or not b.active then return jsonb_build_object('status','disabled'); end if;
  if c.expires_at is not null and c.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
  if b.expires_at is not null and b.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
  select * into p from public.membership_plans mp where mp.tier=c.tier and mp.active;
  if not found then return jsonb_build_object('status','disabled'); end if;
  insert into public.membership_redemption_previews(user_id,code_id) values(uid,c.id) returning id into preview_id;
  return jsonb_build_object('status','valid','previewToken',preview_id,'tier',c.tier,'planName',p.name,
    'dailyFlipAllowance',p.daily_flip_allowance,'durationDays',c.duration_days,'priceCents',p.price_cents,
    'expiresAt',c.expires_at);
end;
$$;
revoke all on function public.preview_membership_code(text) from public,anon;
grant execute on function public.preview_membership_code(text) to authenticated;

create or replace function public.confirm_membership_redemption(p_preview_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); pr public.membership_redemption_previews%rowtype; c public.redeem_codes%rowtype;
  b public.redeem_code_batches%rowtype; m public.user_memberships%rowtype; v_profile_tier text; v_state jsonb;
  v_start timestamptz; v_end timestamptz; v_grant_start timestamptz; v_pending_days integer; v_state_name text;
  v_daily integer; existing public.membership_redemptions%rowtype;
begin
  if uid is null then raise exception 'authentication required'; end if;
  select * into pr from public.membership_redemption_previews x where x.id=p_preview_id and x.user_id=uid for update;
  if not found then return jsonb_build_object('status','preview_expired'); end if;
  if pr.confirmed_at is not null then
    select * into existing from public.membership_redemptions r where r.preview_id=pr.id;
    if found then return jsonb_build_object('status','redeemed','tier',existing.tier,'activationState',existing.activation_state,
      'startsAt',existing.starts_at,'expiresAt',existing.expires_at); end if;
    return jsonb_build_object('status','preview_expired');
  end if;
  if pr.expires_at<=now() then return jsonb_build_object('status','preview_expired'); end if;
  select * into c from public.redeem_codes rc where rc.id=pr.code_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if c.status='redeemed' then return jsonb_build_object('status','already_redeemed'); end if;
  if c.status='disabled' then return jsonb_build_object('status','disabled'); end if;
  select * into b from public.redeem_code_batches rb where rb.id=c.batch_id for share;
  if not found or not b.active then return jsonb_build_object('status','disabled'); end if;
  if c.expires_at is not null and c.expires_at<=now() or b.expires_at is not null and b.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
  v_state:=membership_private.sync_user(uid,null);
  v_profile_tier:=coalesce(v_state->>'tier','free');
  select * into m from public.user_memberships um where um.user_id=uid for update;
  if not found then
    insert into public.user_memberships(user_id,tier,source) values(uid,v_profile_tier,'legacy') returning * into m;
  end if;
  if m.tier<>'free' and m.expires_at is null then return jsonb_build_object('status','permanent_membership'); end if;
  v_daily:=c.duration_days;
  if m.tier='pro' and c.tier='plus' then
    v_pending_days:=case when m.pending_tier='plus' then m.pending_days else 0 end;
    v_start:=case when m.expires_at is null then null else m.expires_at+make_interval(days=>v_pending_days) end;
    v_end:=case when v_start is null then null else v_start+make_interval(days=>v_daily) end;
    update public.user_memberships set pending_tier='plus',pending_days=v_pending_days+v_daily,updated_at=now() where user_id=uid;
    v_state_name:='queued'; v_grant_start:=v_start;
  else
    if m.tier='free' then
      v_grant_start:=now();
      v_end:=v_grant_start+make_interval(days=>v_daily);
    elsif m.tier=c.tier then
      v_grant_start:=greatest(coalesce(m.expires_at,now()),now());
      v_end:=v_grant_start+make_interval(days=>v_daily);
    else
      -- Upgrades take effect immediately while preserving the unused current term.
      v_grant_start:=now();
      v_end:=greatest(coalesce(m.expires_at,now()),now())+make_interval(days=>v_daily);
    end if;
    update public.user_memberships set tier=c.tier,starts_at=case when m.tier='free' or c.tier<>m.tier then now() else m.starts_at end,
      expires_at=v_end,source='redeem',updated_at=now(),updated_by=null where user_id=uid;
    update public.profiles set membership_tier=c.tier where id=uid;
    v_state_name:='active'; v_start:=v_grant_start;
  end if;
  update public.redeem_codes set status='redeemed',redeemed_by=uid,redeemed_at=now() where id=c.id and status='unused';
  if not found then return jsonb_build_object('status','already_redeemed'); end if;
  insert into public.membership_redemptions(preview_id,code_id,user_id,tier,duration_days,activation_state,starts_at,expires_at)
    values(pr.id,c.id,uid,c.tier,c.duration_days,v_state_name,v_grant_start,v_end);
  update public.membership_redemption_previews set confirmed_at=now() where id=pr.id;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
    values(uid,null,'code_redeemed',c.tier,'redeem',jsonb_build_object('redemptionId',p_preview_id,'batchId',c.batch_id,
      'durationDays',c.duration_days,'activationState',v_state_name,'startsAt',v_grant_start,'expiresAt',v_end));
  select daily_flip_allowance into v_daily from public.membership_plans where tier=case when v_state_name='queued' then m.tier else c.tier end;
  return jsonb_build_object('status','redeemed','tier',case when v_state_name='queued' then m.tier else c.tier end,
    'redeemedTier',c.tier,'activationState',v_state_name,'startsAt',v_grant_start,'expiresAt',v_end,
    'dailyFlipAllowance',v_daily,'pendingTier',case when v_state_name='queued' then c.tier else null end);
end;
$$;
revoke all on function public.confirm_membership_redemption(uuid) from public,anon;
grant execute on function public.confirm_membership_redemption(uuid) to authenticated;

create or replace function public.admin_create_membership_batch(p_tier text,p_days integer,p_label text,p_expires_at timestamptz,p_code_hashes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v_batch uuid; v_count integer;
begin
  if uid is null or not public.is_admin() then raise exception 'admin access required'; end if;
  if p_tier not in ('plus','pro') then raise exception 'invalid membership tier'; end if;
  if p_days not between 1 and 3650 then raise exception 'invalid membership duration'; end if;
  if char_length(btrim(coalesce(p_label,''))) not between 1 and 100 then raise exception 'batch label must be 1-100 characters'; end if;
  if p_code_hashes is null or jsonb_typeof(p_code_hashes) is distinct from 'array' then raise exception 'code hashes must be an array'; end if;
  if jsonb_array_length(p_code_hashes) not between 1 and 500 then raise exception 'batch size must be 1-500'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_code_hashes) x(value) where value !~ '^[a-f0-9]{64}$') then raise exception 'invalid code hash'; end if;
  if (select count(distinct value) from jsonb_array_elements_text(p_code_hashes) x(value))<>jsonb_array_length(p_code_hashes) then raise exception 'duplicate code hash'; end if;
  insert into public.redeem_code_batches(label,tier,duration_days,quantity,expires_at,created_by)
    values(btrim(p_label),p_tier,p_days,jsonb_array_length(p_code_hashes),p_expires_at,uid) returning id into v_batch;
  insert into public.redeem_codes(batch_id,code_hash,tier,duration_days,expires_at)
    select v_batch,value,p_tier,p_days,p_expires_at from jsonb_array_elements_text(p_code_hashes) x(value);
  get diagnostics v_count=row_count;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
    values(uid,uid,'batch_created',p_tier,'admin',jsonb_build_object('batchId',v_batch,'quantity',v_count,'days',p_days));
  return jsonb_build_object('batchId',v_batch,'quantity',v_count);
end;
$$;
revoke all on function public.admin_create_membership_batch(text,integer,text,timestamptz,jsonb) from public,anon;
grant execute on function public.admin_create_membership_batch(text,integer,text,timestamptz,jsonb) to authenticated;

create or replace function public.admin_set_membership_batch_active(p_batch_id uuid,p_active boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin access required'; end if;
  update public.redeem_code_batches set active=p_active,updated_at=now() where id=p_batch_id;
  if not found then raise exception 'batch not found'; end if;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
    select auth.uid(),auth.uid(),case when p_active then 'batch_resumed' else 'batch_paused' end,b.tier,'admin',jsonb_build_object('batchId',b.id,'label',b.label)
      from public.redeem_code_batches b where b.id=p_batch_id;
  return p_active;
end;
$$;
revoke all on function public.admin_set_membership_batch_active(uuid,boolean) from public,anon;
grant execute on function public.admin_set_membership_batch_active(uuid,boolean) to authenticated;

create or replace function public.admin_disable_membership_code(p_code_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin access required'; end if;
  update public.redeem_codes set status='disabled' where id=p_code_id and status='unused';
  if not found then raise exception 'code is not available to disable'; end if;
  insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
    select auth.uid(),auth.uid(),'code_disabled',c.tier,'admin',jsonb_build_object('codeId',c.id,'batchId',c.batch_id) from public.redeem_codes c where c.id=p_code_id;
  return true;
end;
$$;
revoke all on function public.admin_disable_membership_code(uuid) from public,anon;
grant execute on function public.admin_disable_membership_code(uuid) to authenticated;

create or replace function public.admin_membership_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v jsonb;
begin
  if uid is null or not public.is_admin() then raise exception 'admin access required'; end if;
  with effective as (
    select case when m.user_id is null then coalesce(p.membership_tier,'free')
      when m.tier='free' then 'free'
      when m.expires_at is null or m.expires_at>now() then m.tier
      when m.pending_tier is not null and m.pending_days>0 then m.pending_tier
      else 'free' end as tier
    from public.profiles p left join public.user_memberships m on m.user_id=p.id
  )
  select jsonb_build_object(
    'free',count(*) filter(where e.tier='free'),
    'plus',count(*) filter(where e.tier='plus'),
    'pro',count(*) filter(where e.tier='pro'),
    'active',count(*) filter(where e.tier in ('plus','pro')),
    'redemptionsThisMonth',(select count(*) from public.membership_redemptions r where r.created_at>=date_trunc('month',now())),
    'unusedCodes',(select count(*) from public.redeem_codes c join public.redeem_code_batches b on b.id=c.batch_id where c.status='unused' and b.active and (b.expires_at is null or b.expires_at>now()) and (c.expires_at is null or c.expires_at>now())),
    'verifiedOrders',(select count(*) from public.afdian_orders o where o.status='verified'),
    'verifiedAmountCents',(select coalesce(sum(o.amount_cents),0) from public.afdian_orders o where o.status='verified'),
    'exceptionOrders',(select count(*) from public.afdian_orders o where o.status in ('invalid','refunded') or o.failure_reason is not null)
  ) into v from effective e;
  return v;
end;
$$;
revoke all on function public.admin_membership_summary() from public,anon;
grant execute on function public.admin_membership_summary() to authenticated;

create or replace function public.admin_membership_batches()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v_batches jsonb;
begin
  if uid is null or not public.is_admin() then raise exception 'admin access required'; end if;
  select coalesce(jsonb_agg(to_jsonb(batch_row) order by batch_row.created_at desc),'[]'::jsonb) into v_batches
  from (
    select b.id,b.label,b.tier,b.duration_days,b.quantity,b.expires_at,b.active,b.created_at,
      (select count(*) from public.redeem_codes c where c.batch_id=b.id and c.status='unused')::integer as unused,
      (select count(*) from public.redeem_codes c where c.batch_id=b.id and c.status='redeemed')::integer as redeemed,
      (select count(*) from public.redeem_codes c where c.batch_id=b.id and c.status='disabled')::integer as disabled,
      (select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'status',recent.status) order by recent.created_at desc),'[]'::jsonb)
        from (select c.id,c.status,c.created_at from public.redeem_codes c where c.batch_id=b.id order by c.created_at desc limit 60) recent) as codes
    from public.redeem_code_batches b order by b.created_at desc limit 20
  ) batch_row;
  return v_batches;
end;
$$;
revoke all on function public.admin_membership_batches() from public,anon;
grant execute on function public.admin_membership_batches() to authenticated;

create or replace function public.record_experience_event(p_event_type text,p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=auth.uid(); v_timezone text; v_membership text:='free'; v_local_date date; v_points integer:=0; v_bonus integer:=0;
  v_event_key text; v_daily_count integer; v_inserted integer; v_total integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  perform membership_private.sync_user(v_user,null);
  if p_event_type not in ('flip','rating') then raise exception 'invalid experience event'; end if;
  if not exists(select 1 from public.posts p where p.id=p_post_id and p.status='published' and p.author_id is distinct from v_user) then raise exception 'post is not eligible for experience'; end if;
  select coalesce(p.timezone,'Asia/Shanghai'),coalesce(p.membership_tier,'free') into v_timezone,v_membership from public.profiles p where p.id=v_user;
  v_local_date:=(now() at time zone v_timezone)::date;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':'||v_local_date::text||':'||p_event_type,0));
  if p_event_type='flip' then
    if not exists(select 1 from public.user_interactions i where i.user_id=v_user and i.post_id=p_post_id and i.opened_at is not null) then raise exception 'card has not been opened'; end if;
    v_event_key:='flip:'||v_local_date::text||':'||p_post_id::text;
    select count(*)::integer into v_daily_count from public.experience_events e where e.user_id=v_user and e.event_type='flip' and (e.created_at at time zone v_timezone)::date=v_local_date;
    if v_daily_count<10 then
      v_points:=case when v_daily_count=0 then 10 else 2 end;
      if v_daily_count=0 then v_bonus:=case v_membership when 'plus' then 3 when 'pro' then 6 else 0 end; end if;
      v_points:=v_points+v_bonus;
    end if;
  else
    if not exists(select 1 from public.user_interactions i where i.user_id=v_user and i.post_id=p_post_id and i.rating between 1 and 5) then raise exception 'rating is missing'; end if;
    v_event_key:='rating:'||p_post_id::text;
    select count(*)::integer into v_daily_count from public.experience_events e where e.user_id=v_user and e.event_type='rating' and (e.created_at at time zone v_timezone)::date=v_local_date;
    if v_daily_count<5 then v_points:=2; end if;
  end if;
  if v_points>0 then
    insert into public.experience_events(user_id,event_key,event_type,post_id,points) values(v_user,v_event_key,p_event_type,p_post_id,v_points) on conflict(user_id,event_key) do nothing;
    get diagnostics v_inserted=row_count;
    if v_inserted=0 then v_points:=0; end if;
  end if;
  select coalesce(sum(e.points),0)::integer into v_total from public.experience_events e where e.user_id=v_user;
  return jsonb_build_object('awarded',v_points,'total',v_total,'membershipTier',v_membership);
end;
$$;
revoke all on function public.record_experience_event(text,uuid) from public,anon;
grant execute on function public.record_experience_event(text,uuid) to authenticated;

create or replace function public.get_daily_flip_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v_state jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;
  perform membership_private.sync_user(uid,null);
  v_state:=private.daily_flip_state(uid);
  return v_state;
end;
$$;
revoke all on function public.get_daily_flip_state() from public,anon;
grant execute on function public.get_daily_flip_state() to authenticated;

create or replace function public.confirm_daily_flip(p_post_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); v_result jsonb; v_experience jsonb; v_quota jsonb; v_author uuid; v_now timestamptz;
begin
  if uid is null then raise exception using message='authentication_required',errcode='42501'; end if;
  if p_post_id is null or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 120 then
    raise exception using message='invalid_flip_request',errcode='22023';
  end if;
  perform membership_private.sync_user(uid,null);
  v_result:=private.confirm_daily_flip(p_post_id,p_idempotency_key);
  v_now:=coalesce((v_result->>'openedAt')::timestamptz,now());
  update public.daily_cards c set opened_at=coalesce(c.opened_at,v_now)
    from public.daily_decks d
   where c.deck_id=d.id and d.user_id=uid and d.local_date=(v_result->>'localDate')::date
     and c.post_id=p_post_id;
  if coalesce((v_result->>'idempotent')::boolean,false)=false then
    select p.author_id into v_author from public.posts p where p.id=p_post_id;
    if v_author is distinct from uid then
      v_experience:=public.record_experience_event('flip',p_post_id);
    end if;
  end if;
  v_quota:=jsonb_build_object('used',coalesce((v_result->>'openedCount')::integer,0),
    'base',coalesce((v_result->>'baseAllowance')::integer,5),'bonus',coalesce((v_result->>'bonus')::integer,0),
    'allowance',coalesce((v_result->>'allowance')::integer,5),'remaining',coalesce((v_result->>'remaining')::integer,0),
    'grantedBonus',coalesce((v_result->>'bonusAwarded')::integer,0));
  return v_result || jsonb_build_object('quota',v_quota,'experience',v_experience);
end;
$$;
revoke all on function public.confirm_daily_flip(uuid,text) from public,anon;
grant execute on function public.confirm_daily_flip(uuid,text) to authenticated;

create or replace function public.get_daily_deck()
returns table(deck_id uuid,local_date date,slot integer,post_id uuid,opened_at timestamptz,swapped_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); tz text; today date; did uuid; chosen uuid[]:=array[]::uuid[]; candidate uuid; slot_no integer;
  first_slot integer; target_slots integer; interests bigint[]; cfg public.recommendation_settings%rowtype; v_state jsonb; v_existing_opened integer:=0;
begin
  if uid is null then raise exception 'authentication required'; end if;
  perform membership_private.sync_user(uid,null);
  select p.timezone into tz from public.profiles p where p.id=uid;
  if tz is null then raise exception 'profile missing'; end if;
  today:=(now() at time zone tz)::date;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||today::text,0));
  v_state:=private.daily_flip_state(uid);
  target_slots:=least(23,coalesce((v_state->>'allowance')::integer,5));
  select d.id into did from public.daily_decks d where d.user_id=uid and d.local_date=today;
  if did is null then
    insert into public.daily_decks(user_id,local_date,timezone) values(uid,today,tz) returning id into did;
  end if;
  select coalesce(array_agg(c.post_id order by c.slot),array[]::uuid[]),coalesce(max(c.slot),0)+1,
    count(*) filter(where c.opened_at is not null)::integer
    into chosen,first_slot,v_existing_opened from public.daily_cards c where c.deck_id=did;
  target_slots:=greatest(target_slots,v_existing_opened);
  select array_agg(tag_id) into interests from public.user_interests where user_id=uid;
  select * into cfg from public.recommendation_settings where id=1;
  for slot_no in first_slot..target_slots loop
    candidate:=null;
    if slot_no<=cfg.interest_slots then
      select p.id into candidate from public.posts p where p.status='published' and p.channel='community' and p.tag_id=any(coalesce(interests,array[]::bigint[])) and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1;
    elsif slot_no<=cfg.interest_slots+cfg.adjacent_slots then
      select p.id into candidate from public.posts p where p.status='published' and p.channel='community' and not(p.tag_id=any(coalesce(interests,array[]::bigint[]))) and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1;
    elsif slot_no<=cfg.interest_slots+cfg.adjacent_slots+cfg.curated_slots then
      select p.id into candidate from public.posts p join public.curated_posts c on c.post_id=p.id where p.status='published' and p.channel='community' and not(p.id=any(chosen)) order by c.priority desc,md5(uid::text||today::text||p.id::text) limit 1;
    end if;
    if candidate is null then select p.id into candidate from public.posts p where p.status='published' and p.channel='community' and not(p.id=any(chosen)) order by md5(uid::text||today::text||p.id::text) limit 1; end if;
    if candidate is null then exit; end if;
    insert into public.daily_cards(deck_id,slot,post_id) values(did,slot_no,candidate);
    chosen:=array_append(chosen,candidate);
  end loop;
  return query select d.id,d.local_date,c.slot,c.post_id,c.opened_at,d.swapped_at from public.daily_decks d
    join public.daily_cards c on c.deck_id=d.id where d.id=did order by c.slot;
end;
$$;
revoke all on function public.get_daily_deck() from public,anon;
grant execute on function public.get_daily_deck() to authenticated;

create or replace function public.open_daily_card(card_slot integer)
returns table(deck_id uuid,local_date date,slot integer,post_id uuid,opened_at timestamptz,swapped_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); tz text; today date; did uuid; v_post_id uuid; v_result jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if card_slot not between 1 and 23 then raise exception 'invalid slot'; end if;
  perform public.get_daily_deck();
  select p.timezone into tz from public.profiles p where p.id=uid;
  today:=(now() at time zone coalesce(tz,'Asia/Shanghai'))::date;
  select d.id into did from public.daily_decks d where d.user_id=uid and d.local_date=today;
  select c.post_id into v_post_id from public.daily_cards c where c.deck_id=did and c.slot=card_slot for update;
  if v_post_id is null then raise exception 'invalid slot'; end if;
  v_result:=public.confirm_daily_flip(v_post_id,'deck:'||v_post_id::text);
  update public.daily_cards c set opened_at=coalesce(c.opened_at,(v_result->>'openedAt')::timestamptz) where c.deck_id=did and c.slot=card_slot;
  return query select d.id,d.local_date,c.slot,c.post_id,c.opened_at,d.swapped_at from public.daily_decks d
    join public.daily_cards c on c.deck_id=d.id where d.id=did order by c.slot;
end;
$$;
revoke all on function public.open_daily_card(integer) from public,anon;
grant execute on function public.open_daily_card(integer) to authenticated;

create or replace function public.open_daily_card_with_result(p_card_slot integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); tz text; today date; did uuid; v_post_id uuid; v_result jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_card_slot not between 1 and 23 then raise exception 'invalid slot'; end if;
  perform public.get_daily_deck();
  select p.timezone into tz from public.profiles p where p.id=uid;
  today:=(now() at time zone coalesce(tz,'Asia/Shanghai'))::date;
  select d.id into did from public.daily_decks d where d.user_id=uid and d.local_date=today;
  select c.post_id into v_post_id from public.daily_cards c where c.deck_id=did and c.slot=p_card_slot for update;
  if v_post_id is null then raise exception 'invalid slot'; end if;
  v_result:=public.confirm_daily_flip(v_post_id,'deck:'||v_post_id::text);
  return jsonb_build_object(
    'deck',(select coalesce(jsonb_agg(to_jsonb(x) order by x.slot),'[]'::jsonb) from public.get_daily_deck() x),
    'experience',v_result->'experience','quota',v_result->'quota');
end;
$$;
revoke all on function public.open_daily_card_with_result(integer) from public,anon;
grant execute on function public.open_daily_card_with_result(integer) to authenticated;

create or replace function public.my_experience_summary()
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare uid uuid:=auth.uid(); v_state jsonb; v_tz text; v_date date; v_base integer:=5; v_used integer:=0; v_bonus integer:=0;
begin
  if uid is null then raise exception 'authentication required'; end if;
  v_state:=public.get_my_membership_status();
  v_base:=coalesce((v_state->>'baseDailyFlipAllowance')::integer,5);
  v_used:=coalesce((v_state->>'dailyFlipsUsed')::integer,0);
  v_bonus:=coalesce((v_state->>'dailyLuckyBonus')::integer,0);
  return jsonb_build_object(
    'total',coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id=uid),0)
      +coalesce((select sum(c.points)::integer from public.creator_mission_claims c where c.user_id=uid),0)
      +coalesce((select sum(d.points)::integer from public.daily_mission_claims d where d.user_id=uid),0),
    'membershipTier',coalesce(v_state->>'tier','free'),
    'dailyFlipAllowance',coalesce(v_base,5)+coalesce(v_bonus,0),
    'baseDailyFlipAllowance',coalesce(v_base,5),'dailyLuckyBonus',coalesce(v_bonus,0),'dailyFlipsUsed',coalesce(v_used,0),
    'claimedLevels',coalesce((select jsonb_agg(c.level order by c.level) from public.experience_reward_claims c where c.user_id=uid),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('type',e.event_type,'points',e.points,'createdAt',e.created_at) order by e.created_at desc)
      from (select event_type,points,created_at from public.experience_events where user_id=uid
        union all select 'mission'::text,points,claimed_at from public.creator_mission_claims where user_id=uid
        union all select 'daily_mission'::text,points,claimed_at from public.daily_mission_claims where user_id=uid
        order by created_at desc limit 20) e),'[]'::jsonb));
end;
$$;
revoke all on function public.my_experience_summary() from public,anon;
grant execute on function public.my_experience_summary() to authenticated;

-- The previous deck only constrained a day's candidates to five. Membership
-- can add up to 13 base flips and the existing lucky bonus adds at most 10.
alter table public.daily_cards drop constraint if exists daily_cards_slot_check;
alter table public.daily_cards add constraint daily_cards_slot_check check (slot between 1 and 23);
