-- Daily goals award server-verified EXP.
create table public.daily_mission_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission_date date not null,
  mission_key text not null check (mission_key in ('flip_two','rate_one','save_one')),
  points integer not null default 5 check (points = 5),
  claimed_at timestamptz not null default now(),
  unique(user_id, mission_date, mission_key)
);
create index daily_mission_claims_user_date_idx on public.daily_mission_claims(user_id, mission_date desc);
alter table public.daily_mission_claims enable row level security;
create policy daily_mission_claims_read_own on public.daily_mission_claims
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.daily_mission_claims to authenticated;
revoke insert, update, delete on public.daily_mission_claims from public, anon, authenticated;

create or replace function public.my_daily_missions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_date date;
  v_start timestamptz;
  v_flip integer;
  v_rate integer;
  v_save integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select coalesce(p.timezone,'Asia/Shanghai') into v_timezone from public.profiles p where p.id=v_user;
  v_timezone := coalesce(v_timezone,'Asia/Shanghai');
  v_date := (now() at time zone v_timezone)::date;
  v_start := v_date::timestamp at time zone v_timezone;
  select count(*)::integer into v_flip from public.user_interactions i where i.user_id=v_user and i.opened_at>=v_start;
  select count(*)::integer into v_rate from public.experience_events e where e.user_id=v_user and e.event_type='rating' and e.created_at>=v_start;
  select count(*)::integer into v_save from public.bookmarks b where b.user_id=v_user and b.created_at>=v_start;
  return jsonb_build_object(
    'date',v_date,
    'missions',jsonb_build_array(
      jsonb_build_object('key','flip_two','title','翻开两张卡','description','今天打开两张内容卡片','progress',least(v_flip,2),'target',2,'points',5,'claimed',exists(select 1 from public.daily_mission_claims c where c.user_id=v_user and c.mission_date=v_date and c.mission_key='flip_two')),
      jsonb_build_object('key','rate_one','title','留下一个评分','description','给一篇喜欢的内容留下评分','progress',least(v_rate,1),'target',1,'points',5,'claimed',exists(select 1 from public.daily_mission_claims c where c.user_id=v_user and c.mission_date=v_date and c.mission_key='rate_one')),
      jsonb_build_object('key','save_one','title','收藏一份灵感','description','把一篇内容收藏起来，留待以后回看','progress',least(v_save,1),'target',1,'points',5,'claimed',exists(select 1 from public.daily_mission_claims c where c.user_id=v_user and c.mission_date=v_date and c.mission_key='save_one'))
    )
  );
end;
$$;
revoke all on function public.my_daily_missions() from public, anon;
grant execute on function public.my_daily_missions() to authenticated;

create or replace function public.claim_daily_mission(p_mission_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_date date;
  v_start timestamptz;
  v_progress integer := 0;
  v_target integer;
  v_inserted integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_mission_key not in ('flip_two','rate_one','save_one') then raise exception 'invalid daily mission'; end if;
  select coalesce(p.timezone,'Asia/Shanghai') into v_timezone from public.profiles p where p.id=v_user;
  v_timezone := coalesce(v_timezone,'Asia/Shanghai');
  v_date := (now() at time zone v_timezone)::date;
  v_start := v_date::timestamp at time zone v_timezone;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_date::text || ':daily-missions',0));
  if p_mission_key='flip_two' then
    v_target:=2;
    select count(*)::integer into v_progress from public.user_interactions i where i.user_id=v_user and i.opened_at>=v_start;
  elsif p_mission_key='rate_one' then
    v_target:=1;
    select count(*)::integer into v_progress from public.experience_events e where e.user_id=v_user and e.event_type='rating' and e.created_at>=v_start;
  else
    v_target:=1;
    select count(*)::integer into v_progress from public.bookmarks b where b.user_id=v_user and b.created_at>=v_start;
  end if;
  if v_progress<v_target then raise exception 'mission not complete'; end if;
  insert into public.daily_mission_claims(user_id,mission_date,mission_key,points) values(v_user,v_date,p_mission_key,5)
    on conflict(user_id,mission_date,mission_key) do nothing;
  get diagnostics v_inserted=row_count;
  return jsonb_build_object('claimed',v_inserted=1,'points',case when v_inserted=1 then 5 else 0 end,'missionKey',p_mission_key);
end;
$$;
revoke all on function public.claim_daily_mission(text) from public, anon;
grant execute on function public.claim_daily_mission(text) to authenticated;

-- Include daily rewards in progression totals and level unlock checks.
create or replace function public.my_experience_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id=auth.uid()),0)
      + coalesce((select sum(c.points)::integer from public.creator_mission_claims c where c.user_id=auth.uid()),0)
      + coalesce((select sum(d.points)::integer from public.daily_mission_claims d where d.user_id=auth.uid()),0),
    'membershipTier',coalesce((select p.membership_tier from public.profiles p where p.id=auth.uid()),'free'),
    'claimedLevels',coalesce((select jsonb_agg(c.level order by c.level) from public.experience_reward_claims c where c.user_id=auth.uid()),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('type',e.event_type,'points',e.points,'createdAt',e.created_at) order by e.created_at desc) from (
      select event_type,points,created_at from public.experience_events where user_id=auth.uid()
      union all select 'mission'::text,points,claimed_at from public.creator_mission_claims where user_id=auth.uid()
      union all select 'daily_mission'::text,points,claimed_at from public.daily_mission_claims where user_id=auth.uid()
      order by created_at desc limit 20
    ) e),'[]'::jsonb)
  );
$$;
revoke all on function public.my_experience_summary() from public, anon;
grant execute on function public.my_experience_summary() to authenticated;

create or replace function public.claim_experience_reward(p_level smallint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_threshold integer; v_total integer; v_claimed_at timestamptz; v_inserted integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_level is null or p_level<1 or p_level>10 then raise exception 'invalid reward level'; end if;
  v_threshold:=case p_level when 1 then 0 when 2 then 100 when 3 then 240 when 4 then 430 when 5 then 680 when 6 then 1000 when 7 then 1390 when 8 then 1850 when 9 then 2380 when 10 then 2980 end;
  select coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id=v_user),0)
       + coalesce((select sum(c.points)::integer from public.creator_mission_claims c where c.user_id=v_user),0)
       + coalesce((select sum(d.points)::integer from public.daily_mission_claims d where d.user_id=v_user),0) into v_total;
  if v_total<v_threshold then raise exception 'experience threshold not reached'; end if;
  insert into public.experience_reward_claims(user_id,level) values(v_user,p_level) on conflict(user_id,level) do nothing returning claimed_at into v_claimed_at;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then select claimed_at into v_claimed_at from public.experience_reward_claims where user_id=v_user and level=p_level; end if;
  return jsonb_build_object('level',p_level,'claimed',v_inserted=1,'claimedAt',v_claimed_at,'total',v_total);
end;
$$;
revoke all on function public.claim_experience_reward(smallint) from public, anon;
grant execute on function public.claim_experience_reward(smallint) to authenticated;

-- Shareable, collaborative bookmark collections.
alter table public.bookmark_collections add column is_public boolean not null default false;
alter table public.bookmark_collections add column allow_collaboration boolean not null default false;
alter table public.bookmark_collections add column share_code text;
grant all on public.bookmark_collections,public.bookmarks to service_role;
create unique index bookmark_collections_share_code_idx on public.bookmark_collections(share_code) where share_code is not null;
create table public.bookmark_collection_collaborators (
  collection_id uuid not null references public.bookmark_collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(collection_id,user_id)
);
create index bookmark_collection_collaborators_user_idx on public.bookmark_collection_collaborators(user_id,added_at desc);
alter table public.bookmark_collection_collaborators enable row level security;
revoke all on public.bookmark_collection_collaborators from public, anon, authenticated;
grant all on public.bookmark_collection_collaborators to service_role;

drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks for all to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()) and (collection_id is null or exists(
    select 1 from public.bookmark_collections c where c.id=bookmarks.collection_id and (
      c.user_id=bookmarks.user_id or exists(select 1 from public.bookmark_collection_collaborators m where m.collection_id=c.id and m.user_id=bookmarks.user_id)
    )
  )));

-- Double exploration rooms are private and accessible only through the authenticated API.
create table public.co_explore_rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid references public.profiles(id) on delete set null,
  prompt text not null default '今天最想和朋友分享哪一份灵感？',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '48 hours'),
  check(guest_id is null or guest_id<>host_id)
);
create index co_explore_rooms_host_created_idx on public.co_explore_rooms(host_id,created_at desc);
create table public.co_explore_picks (
  room_id uuid not null references public.co_explore_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  note text not null default '' check(char_length(note)<=180),
  created_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
alter table public.co_explore_rooms enable row level security;
alter table public.co_explore_picks enable row level security;
revoke all on public.co_explore_rooms,public.co_explore_picks from public,anon,authenticated;
grant all on public.co_explore_rooms,public.co_explore_picks to service_role;

-- Persistent activity notices for followed creators and comment conversations.
create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check(notification_type in ('creator_post','comment','reply')),
  entity_id uuid not null,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id,notification_type,entity_id)
);
create index app_notifications_recipient_created_idx on public.app_notifications(recipient_id,created_at desc);
create index app_notifications_unread_idx on public.app_notifications(recipient_id,created_at desc) where read_at is null;
alter table public.app_notifications enable row level security;
create policy app_notifications_read_own on public.app_notifications for select to authenticated using(recipient_id=(select auth.uid()));
create policy app_notifications_update_own on public.app_notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
grant select on public.app_notifications to authenticated;
grant update(read_at) on public.app_notifications to authenticated;
grant all on public.app_notifications to service_role;

create or replace function public.notify_followers_on_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='published' and new.author_id is not null and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.app_notifications(recipient_id,actor_id,notification_type,entity_id,post_id,title)
    select f.follower_id,new.author_id,'creator_post',new.id,new.id,'你关注的创作者发布了新内容'
    from public.creator_follows f where f.creator_id=new.author_id and f.follower_id<>new.author_id
    on conflict(recipient_id,notification_type,entity_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_followers_on_publish() from public,anon,authenticated;
create trigger posts_notify_followers_insert after insert on public.posts for each row execute function public.notify_followers_on_publish();
create trigger posts_notify_followers_publish after update of status on public.posts for each row execute function public.notify_followers_on_publish();

create or replace function public.notify_comment_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_parent_author uuid;
begin
  select p.author_id into v_owner from public.posts p where p.id=new.post_id;
  if new.parent_id is null then
    if v_owner is not null and v_owner<>new.author_id then
      insert into public.app_notifications(recipient_id,actor_id,notification_type,entity_id,post_id,comment_id,title)
      values(v_owner,new.author_id,'comment',new.id,new.post_id,new.id,'有人评论了你的内容') on conflict do nothing;
    end if;
  else
    select c.author_id into v_parent_author from public.comments c where c.id=new.parent_id;
    if v_parent_author is not null and v_parent_author<>new.author_id then
      insert into public.app_notifications(recipient_id,actor_id,notification_type,entity_id,post_id,comment_id,title)
      values(v_parent_author,new.author_id,'reply',new.id,new.post_id,new.id,'有人回复了你的评论') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_comment_conversation() from public,anon,authenticated;
create trigger comments_notify_conversation after insert on public.comments for each row when(new.status='visible') execute function public.notify_comment_conversation();
