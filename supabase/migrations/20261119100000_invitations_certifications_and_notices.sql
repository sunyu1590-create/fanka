-- Invitations, verification badges, per-user daily attachment quotas, and
-- the official message inbox. All privileged writes are made by server routes.

alter table public.membership_plans
  add column daily_attachment_allowance integer not null default 20
    check (daily_attachment_allowance between 0 and 1000);

update public.membership_plans
set daily_attachment_allowance = case tier when 'plus' then 23 when 'pro' then 26 else 20 end;

alter table public.membership_plans
  drop constraint if exists membership_plans_daily_attachment_allowance_check;
alter table public.membership_plans
  add constraint membership_plans_daily_attachment_allowance_check
  check (daily_attachment_allowance between 0 and 1000);

alter table public.user_memberships
  drop constraint if exists user_memberships_source_check;
alter table public.user_memberships
  add constraint user_memberships_source_check
  check (source in ('legacy','admin','redeem','afdian','invite'));

alter table public.membership_events
  drop constraint if exists membership_events_event_type_check;
alter table public.membership_events
  add constraint membership_events_event_type_check
  check (event_type in ('legacy_import','admin_grant','admin_change','admin_revoke','code_redeemed','membership_expired','pending_membership_started','batch_created','batch_paused','batch_resumed','code_disabled','afdian_order_recorded','afdian_order_verified','afdian_order_rejected','invite_reward'));

create table public.profile_badge_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  label text not null check (char_length(label) between 1 and 24),
  description text not null default '' check (char_length(description) <= 120),
  color text not null default '#78613B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profile_badge_types_active_order_idx on public.profile_badge_types(active, sort_order, label);

insert into public.profile_badge_types(slug,label,description,color,sort_order)
values
  ('invited-member','受邀入驻','由黑卡邀请加入的创作者','#78613B',10),
  ('creator-certified','创作认证','经黑卡认证的创作者','#347A67',20),
  ('official-certified','官方认证','黑卡官方账号或官方代表','#9B7133',30)
on conflict (slug) do nothing;

create table public.user_badge_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.profile_badge_types(id) on delete restrict,
  source text not null check (source in ('invite_code','certification_code','admin')),
  source_code_id uuid,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500)
);
create unique index user_badge_awards_active_unique_idx
  on public.user_badge_awards(user_id,badge_id) where revoked_at is null;
create unique index user_badge_awards_source_code_unique_idx
  on public.user_badge_awards(source_code_id) where source_code_id is not null;
create index user_badge_awards_user_active_idx on public.user_badge_awards(user_id,granted_at desc) where revoked_at is null;

create table public.access_code_batches (
  id uuid primary key default gen_random_uuid(),
  code_kind text not null check (code_kind in ('invitation','certification')),
  label text not null check (char_length(label) between 1 and 100),
  badge_id uuid not null references public.profile_badge_types(id) on delete restrict,
  reward_tier text,
  reward_days integer not null default 0 check (reward_days between 0 and 3650),
  quantity integer not null check (quantity between 1 and 500),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((code_kind='invitation' and reward_tier='pro' and reward_days between 1 and 3650)
      or (code_kind='certification' and reward_tier is null and reward_days=0))
);
create index access_code_batches_kind_created_idx on public.access_code_batches(code_kind,created_at desc);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.access_code_batches(id) on delete restrict,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'unused' check (status in ('unused','redeemed','disabled')),
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status='redeemed') = (redeemed_at is not null))
);
create index access_codes_batch_status_idx on public.access_codes(batch_id,status);
create index access_codes_redeemed_by_idx on public.access_codes(redeemed_by,redeemed_at desc) where redeemed_by is not null;

create table public.daily_attachment_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_day date not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,usage_day)
);

create table public.official_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 3000),
  image_url text,
  action_label text check (action_label is null or char_length(action_label) between 1 and 24),
  action_url text check (action_url is null or char_length(action_url) <= 2048),
  audience text not null default 'all' check (audience in ('all','free','plus','pro')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now()
);
create index official_notices_published_idx on public.official_notices(published_at desc);

create table public.official_notice_recipients (
  notice_id uuid not null references public.official_notices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key(notice_id,user_id)
);
create index official_notice_recipients_inbox_idx on public.official_notice_recipients(user_id,delivered_at desc);

alter table public.profile_badge_types enable row level security;
alter table public.user_badge_awards enable row level security;
alter table public.access_code_batches enable row level security;
alter table public.access_codes enable row level security;
alter table public.daily_attachment_usage enable row level security;
alter table public.official_notices enable row level security;
alter table public.official_notice_recipients enable row level security;

revoke all on public.profile_badge_types,public.user_badge_awards,public.access_code_batches,public.access_codes,
  public.daily_attachment_usage,public.official_notices,public.official_notice_recipients from anon,authenticated;
grant select on public.profile_badge_types,public.user_badge_awards to anon,authenticated;
grant all on public.profile_badge_types,public.user_badge_awards,public.access_code_batches,public.access_codes,
  public.daily_attachment_usage,public.official_notices,public.official_notice_recipients to service_role;

create policy profile_badges_active_read on public.profile_badge_types for select to anon,authenticated using (active);
create policy profile_badges_admin_read on public.profile_badge_types for select to authenticated using ((select public.is_admin()));
create policy user_badge_awards_active_read on public.user_badge_awards for select to anon,authenticated
  using (revoked_at is null and exists(select 1 from public.profile_badge_types b where b.id=user_badge_awards.badge_id and b.active));

create or replace function public.redeem_access_code(p_code_hash text,p_user_id uuid,p_signup boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.access_codes%rowtype; b public.access_code_batches%rowtype; badge public.profile_badge_types%rowtype;
  v_start timestamptz; v_end timestamptz; v_tier text;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid access code'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then raise exception 'profile not found'; end if;
  select * into c from public.access_codes where code_hash=p_code_hash for update;
  if not found or c.status<>'unused' then raise exception 'access code is unavailable'; end if;
  select * into b from public.access_code_batches where id=c.batch_id for update;
  if not found or not b.active or (b.expires_at is not null and b.expires_at<=now()) then raise exception 'access code is unavailable'; end if;
  if b.code_kind='invitation' and not p_signup then raise exception 'invitation code can only be used during registration'; end if;
  if b.code_kind='certification' and p_signup then raise exception 'certification code must be redeemed after registration'; end if;
  if b.code_kind='invitation' and not exists(select 1 from public.profile_badge_types where id=b.badge_id and slug='invited-member') then
    raise exception 'invitation badge is invalid';
  end if;
  select * into badge from public.profile_badge_types where id=b.badge_id and active;
  if not found then raise exception 'badge is unavailable'; end if;
  if exists(select 1 from public.user_badge_awards a where a.user_id=p_user_id and a.badge_id=b.badge_id and a.revoked_at is null) then
    raise exception 'account already has this certification';
  end if;
  update public.access_codes set status='redeemed',redeemed_by=p_user_id,redeemed_at=now() where id=c.id;
  insert into public.user_badge_awards(user_id,badge_id,source,source_code_id,granted_by)
    values(p_user_id,b.badge_id,case b.code_kind when 'invitation' then 'invite_code' else 'certification_code' end,c.id,b.created_by);
  v_tier:=null;
  if b.code_kind='invitation' then
    select tier,expires_at into v_tier,v_end from public.user_memberships where user_id=p_user_id for update;
    if v_tier in ('plus','pro') and (v_end is null or v_end>now()) then
      v_start:=coalesce((select starts_at from public.user_memberships where user_id=p_user_id),now());
      if v_end is null then v_end:=now()+make_interval(days=>b.reward_days); else v_end:=greatest(v_end,now())+make_interval(days=>b.reward_days); end if;
    else
      v_start:=now(); v_end:=now()+make_interval(days=>b.reward_days);
    end if;
    insert into public.user_memberships(user_id,tier,starts_at,expires_at,pending_tier,pending_days,source,updated_by,updated_at)
      values(p_user_id,'pro',v_start,v_end,null,0,'invite',b.created_by,now())
      on conflict(user_id) do update set tier='pro',starts_at=excluded.starts_at,expires_at=excluded.expires_at,
        pending_tier=null,pending_days=0,source='invite',updated_by=excluded.updated_by,updated_at=now();
    update public.profiles set membership_tier='pro' where id=p_user_id;
    insert into public.membership_events(user_id,actor_id,event_type,tier,source,details)
      values(p_user_id,b.created_by,'invite_reward','pro','invite',jsonb_build_object('days',b.reward_days,'expiresAt',v_end,'batchId',b.id,'codeId',c.id));
    v_tier:='pro';
  end if;
  return jsonb_build_object('kind',b.code_kind,'batchLabel',b.label,'badge',jsonb_build_object('id',badge.id,'slug',badge.slug,'label',badge.label,'color',badge.color),
    'tier',v_tier,'rewardDays',b.reward_days,'expiresAt',v_end);
end;
$$;
revoke all on function public.redeem_access_code(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.redeem_access_code(text,uuid,boolean) to service_role;

create or replace function public.sync_daily_attachment_usage(p_user_id uuid,p_day date,p_observed_count integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_used integer;
begin
  if p_observed_count<0 or p_observed_count>10000 then raise exception 'invalid observed count'; end if;
  insert into public.daily_attachment_usage(user_id,usage_day,used_count)
    values(p_user_id,p_day,p_observed_count)
  on conflict(user_id,usage_day) do update set used_count=greatest(public.daily_attachment_usage.used_count,excluded.used_count),updated_at=now()
  returning used_count into v_used;
  return v_used;
end;
$$;

create or replace function public.reserve_daily_attachment_slot(p_user_id uuid,p_day date,p_limit integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_used integer;
begin
  if p_limit<0 or p_limit>1000 then raise exception 'invalid daily attachment limit'; end if;
  insert into public.daily_attachment_usage(user_id,usage_day,used_count)
    values(p_user_id,p_day,1)
  on conflict(user_id,usage_day) do update set used_count=public.daily_attachment_usage.used_count+1,updated_at=now()
    where public.daily_attachment_usage.used_count<p_limit
  returning used_count into v_used;
  if v_used is null then raise exception 'daily_attachment_limit_reached'; end if;
  return v_used;
end;
$$;

create or replace function public.release_daily_attachment_slot(p_user_id uuid,p_day date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_used integer;
begin
  update public.daily_attachment_usage set used_count=greatest(used_count-1,0),updated_at=now()
    where user_id=p_user_id and usage_day=p_day returning used_count into v_used;
  if v_used=0 then delete from public.daily_attachment_usage where user_id=p_user_id and usage_day=p_day; end if;
  return coalesce(v_used,0);
end;
$$;
revoke all on function public.sync_daily_attachment_usage(uuid,date,integer) from public,anon,authenticated;
revoke all on function public.reserve_daily_attachment_slot(uuid,date,integer) from public,anon,authenticated;
revoke all on function public.release_daily_attachment_slot(uuid,date) from public,anon,authenticated;
grant execute on function public.sync_daily_attachment_usage(uuid,date,integer) to service_role;
grant execute on function public.reserve_daily_attachment_slot(uuid,date,integer) to service_role;
grant execute on function public.release_daily_attachment_slot(uuid,date) to service_role;

comment on table public.profile_badge_types is 'Administrator-configured public profile verification badges.';
comment on table public.access_code_batches is 'Separate invitation and certification code batches; raw codes are never stored.';
comment on table public.official_notices is 'Structured card messages shown in the official inbox.';
comment on column public.membership_plans.daily_attachment_allowance is 'Per-user daily attachment quota.';
