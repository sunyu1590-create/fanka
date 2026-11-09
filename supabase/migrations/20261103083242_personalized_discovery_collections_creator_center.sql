-- Personal bookmark organization. Collection metadata is private to its owner.
create table public.bookmark_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 24),
  created_at timestamptz not null default now()
);
create unique index bookmark_collections_user_name_idx
  on public.bookmark_collections (user_id, lower(name));
create index bookmark_collections_user_created_idx
  on public.bookmark_collections (user_id, created_at);
alter table public.bookmark_collections enable row level security;
create policy bookmark_collections_owner_select on public.bookmark_collections
  for select to authenticated using (user_id = (select auth.uid()));
create policy bookmark_collections_owner_insert on public.bookmark_collections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy bookmark_collections_owner_update on public.bookmark_collections
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy bookmark_collections_owner_delete on public.bookmark_collections
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.bookmark_collections from public, anon;
grant select, insert, update, delete on public.bookmark_collections to authenticated;

alter table public.bookmarks
  add column collection_id uuid references public.bookmark_collections(id) on delete set null;
grant update (collection_id) on public.bookmarks to authenticated;
create index bookmarks_collection_idx on public.bookmarks (user_id, collection_id);

-- Server-owned weekly creator and exploration rewards.
create table public.creator_mission_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  mission_key text not null check (mission_key in ('explore_days', 'publish_post', 'curate_posts')),
  points integer not null default 20 check (points > 0),
  claimed_at timestamptz not null default now(),
  unique (user_id, period_start, mission_key)
);
create index creator_mission_claims_user_period_idx
  on public.creator_mission_claims (user_id, period_start desc);
alter table public.creator_mission_claims enable row level security;
create policy creator_mission_claims_owner_select on public.creator_mission_claims
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.creator_mission_claims from public, anon, authenticated;
grant select on public.creator_mission_claims to authenticated;

create or replace function public.my_creator_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  with authored as (
    select p.id, p.client_id, p.title, p.cover_text, p.image_url, p.created_at
    from public.posts p
    where p.author_id = v_user and p.status = 'published'
  ), metrics as (
    select a.*,
      coalesce((select sum(i.exposure_count)::integer from public.user_interactions i where i.post_id = a.id), 0) as views,
      coalesce((select count(*)::integer from public.user_interactions i where i.post_id = a.id and i.liked), 0) as likes,
      coalesce((select count(*)::integer from public.bookmarks b where b.post_id = a.id), 0) as saves,
      coalesce((select count(*)::integer from public.comments c where c.post_id = a.id and c.status = 'visible'), 0) as comments
    from authored a
  )
  select jsonb_build_object(
    'posts', count(*)::integer,
    'views', coalesce(sum(views), 0)::integer,
    'likes', coalesce(sum(likes), 0)::integer,
    'saves', coalesce(sum(saves), 0)::integer,
    'comments', coalesce(sum(comments), 0)::integer,
    'topPosts', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.client_id, 'title', t.title, 'cover', t.cover_text,
        'image', t.image_url, 'views', t.views, 'likes', t.likes, 'saves', t.saves, 'comments', t.comments)
        order by (t.likes + t.saves + t.comments) desc, t.created_at desc)
      from (select * from metrics order by (likes + saves + comments) desc, created_at desc limit 5) t
    ), '[]'::jsonb)
  ) into v_result from metrics;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;
revoke all on function public.my_creator_insights() from public, anon;
grant execute on function public.my_creator_insights() to authenticated;

create or replace function public.my_creator_missions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_week date;
  v_start timestamptz;
  v_explore integer;
  v_publish integer;
  v_curate integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select coalesce(p.timezone, 'Asia/Shanghai') into v_timezone from public.profiles p where p.id = v_user;
  v_timezone := coalesce(v_timezone, 'Asia/Shanghai');
  v_week := date_trunc('week', now() at time zone v_timezone)::date;
  v_start := v_week::timestamp at time zone v_timezone;
  select count(distinct (i.opened_at at time zone v_timezone)::date)::integer into v_explore
    from public.user_interactions i where i.user_id = v_user and i.opened_at >= v_start;
  select count(*)::integer into v_publish from public.posts p
    where p.author_id = v_user and p.status = 'published' and p.created_at >= v_start;
  select count(*)::integer into v_curate from public.bookmarks b where b.user_id = v_user and b.created_at >= v_start;
  return jsonb_build_object(
    'weekStart', v_week,
    'missions', jsonb_build_array(
      jsonb_build_object('key','explore_days','title','分三天探索','description','在本周的 3 个不同日期翻开卡片','progress',least(v_explore,3),'target',3,'claimed',exists(select 1 from public.creator_mission_claims c where c.user_id=v_user and c.period_start=v_week and c.mission_key='explore_days'),'points',20),
      jsonb_build_object('key','publish_post','title','发布一篇公开内容','description','本周发布 1 篇通过审核的公开内容','progress',least(v_publish,1),'target',1,'claimed',exists(select 1 from public.creator_mission_claims c where c.user_id=v_user and c.period_start=v_week and c.mission_key='publish_post'),'points',20),
      jsonb_build_object('key','curate_posts','title','整理灵感收藏','description','本周收藏 3 篇内容','progress',least(v_curate,3),'target',3,'claimed',exists(select 1 from public.creator_mission_claims c where c.user_id=v_user and c.period_start=v_week and c.mission_key='curate_posts'),'points',20)
    )
  );
end;
$$;
revoke all on function public.my_creator_missions() from public, anon;
grant execute on function public.my_creator_missions() to authenticated;

create or replace function public.claim_creator_mission(p_mission_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_week date;
  v_start timestamptz;
  v_progress integer := 0;
  v_target integer;
  v_inserted integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_mission_key not in ('explore_days','publish_post','curate_posts') then raise exception 'invalid mission'; end if;
  select coalesce(p.timezone, 'Asia/Shanghai') into v_timezone from public.profiles p where p.id=v_user;
  v_timezone := coalesce(v_timezone, 'Asia/Shanghai');
  v_week := date_trunc('week', now() at time zone v_timezone)::date;
  v_start := v_week::timestamp at time zone v_timezone;
  if p_mission_key='explore_days' then
    v_target:=3;
    select count(distinct (i.opened_at at time zone v_timezone)::date)::integer into v_progress from public.user_interactions i where i.user_id=v_user and i.opened_at>=v_start;
  elsif p_mission_key='publish_post' then
    v_target:=1;
    select count(*)::integer into v_progress from public.posts p where p.author_id=v_user and p.status='published' and p.created_at>=v_start;
  else
    v_target:=3;
    select count(*)::integer into v_progress from public.bookmarks b where b.user_id=v_user and b.created_at>=v_start;
  end if;
  if v_progress < v_target then raise exception 'mission not complete'; end if;
  insert into public.creator_mission_claims(user_id,period_start,mission_key,points)
    values(v_user,v_week,p_mission_key,20) on conflict(user_id,period_start,mission_key) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('claimed',v_inserted=1,'points',case when v_inserted=1 then 20 else 0 end,'missionKey',p_mission_key);
end;
$$;
revoke all on function public.claim_creator_mission(text) from public, anon;
grant execute on function public.claim_creator_mission(text) to authenticated;

-- Include mission rewards in EXP and level unlocks without allowing client-written points.
create or replace function public.my_experience_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id=auth.uid()),0)
      + coalesce((select sum(c.points)::integer from public.creator_mission_claims c where c.user_id=auth.uid()),0),
    'membershipTier', coalesce((select p.membership_tier from public.profiles p where p.id=auth.uid()),'free'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('type', e.event_type, 'points', e.points, 'createdAt', e.created_at) order by e.created_at desc)
      from (
        select event_type, points, created_at from public.experience_events where user_id=auth.uid()
        union all
        select 'mission'::text as event_type, points, claimed_at as created_at from public.creator_mission_claims where user_id=auth.uid()
        order by created_at desc limit 20
      ) e
    ),'[]'::jsonb)
  );
$$;
revoke all on function public.my_experience_summary() from public, anon;
grant execute on function public.my_experience_summary() to authenticated;

drop policy if exists experience_reward_claims_insert_own_unlocked on public.experience_reward_claims;
revoke insert on public.experience_reward_claims from anon, authenticated;
create or replace function public.claim_experience_reward(p_level smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_threshold integer;
  v_total integer;
  v_claimed_at timestamptz;
  v_inserted integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_level is null or p_level < 1 or p_level > 10 then raise exception 'invalid reward level'; end if;
  v_threshold := case p_level when 1 then 0 when 2 then 100 when 3 then 240 when 4 then 430 when 5 then 680 when 6 then 1000 when 7 then 1390 when 8 then 1850 when 9 then 2380 when 10 then 2980 end;
  select coalesce((select sum(e.points)::integer from public.experience_events e where e.user_id=v_user),0)
       + coalesce((select sum(c.points)::integer from public.creator_mission_claims c where c.user_id=v_user),0)
    into v_total;
  if v_total < v_threshold then raise exception 'experience threshold not reached'; end if;
  insert into public.experience_reward_claims(user_id,level) values(v_user,p_level)
    on conflict(user_id,level) do nothing returning claimed_at into v_claimed_at;
  get diagnostics v_inserted = row_count;
  if v_inserted=0 then select claimed_at into v_claimed_at from public.experience_reward_claims where user_id=v_user and level=p_level; end if;
  return jsonb_build_object('level',p_level,'claimed',v_inserted=1,'claimedAt',v_claimed_at,'total',v_total);
end;
$$;
revoke all on function public.claim_experience_reward(smallint) from public, anon;
grant execute on function public.claim_experience_reward(smallint) to authenticated;
