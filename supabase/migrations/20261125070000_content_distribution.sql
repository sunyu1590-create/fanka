-- 内容分发基础设施：统一互动事件、热度、榜单缓存、搜索统计、分发配置
-- 幂等：可重复执行，不删除任何既有业务数据。

begin;

-- 1) 统一互动事件账本（点赞 / 收藏 / 分享 / 有效阅读 / 读完 / 合集收藏）
create table if not exists public.content_events (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('post', 'series')),
  entity_id uuid not null,
  user_id uuid,
  kind text not null check (kind in ('like', 'bookmark', 'share', 'read', 'complete', 'follow')),
  weight numeric not null default 1,
  surface text not null default 'web',
  occurred_at timestamptz not null default now(),
  dedupe_key text
);
create unique index if not exists content_events_dedupe_idx on public.content_events (dedupe_key);
create index if not exists content_events_entity_idx on public.content_events (entity_type, entity_id, occurred_at desc);
create index if not exists content_events_time_idx on public.content_events (occurred_at desc);
create index if not exists content_events_user_idx on public.content_events (user_id, occurred_at desc);

alter table public.content_events enable row level security;
drop policy if exists content_events_admin_read on public.content_events;
create policy content_events_admin_read on public.content_events
  for select using (public.is_admin() or public.has_staff_permission('content.review'));

-- 2) 热度结果缓存
create table if not exists public.content_hot (
  entity_type text not null,
  entity_id uuid not null,
  score_24h numeric not null default 0,
  score_72h numeric not null default 0,
  score_7d numeric not null default 0,
  score_long numeric not null default 0,
  likes_7d integer not null default 0,
  bookmarks_7d integer not null default 0,
  shares_7d integer not null default 0,
  reads_7d integer not null default 0,
  unique_readers_7d integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

-- 3) 榜单快照
create table if not exists public.ranking_snapshots (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  version integer not null default 1
);

-- 4) 搜索行为与聚合
create table if not exists public.search_events (
  id bigserial primary key,
  term text not null,
  display_term text not null default '',
  user_id uuid,
  result_count integer not null default 0,
  clicked_type text,
  clicked_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists search_events_time_idx on public.search_events (created_at desc);
create index if not exists search_events_term_idx on public.search_events (term, created_at desc);

create table if not exists public.search_terms (
  term text primary key,
  display_term text not null default '',
  search_count integer not null default 0,
  user_count integer not null default 0,
  zero_result_count integer not null default 0,
  click_count integer not null default 0,
  last_searched_at timestamptz not null default now()
);
create index if not exists search_terms_rank_idx on public.search_terms (search_count desc, last_searched_at desc);

alter table public.search_terms enable row level security;
drop policy if exists search_terms_admin_read on public.search_terms;
create policy search_terms_admin_read on public.search_terms
  for select using (public.is_admin() or public.has_staff_permission('content.review'));

-- 原子记录一次搜索：标准化关键词 + 聚合计数
create or replace function public.heika_record_search(
  p_term text,
  p_display text,
  p_user uuid,
  p_results integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term text := lower(btrim(coalesce(p_term, '')));
  v_display text := btrim(coalesce(nullif(p_display, ''), p_term, ''));
begin
  if length(v_term) < 1 then return; end if;
  insert into public.search_events (term, display_term, user_id, result_count)
  values (left(v_term, 60), left(v_display, 60), p_user, greatest(coalesce(p_results, 0), 0));
  insert into public.search_terms (term, display_term, search_count, user_count, zero_result_count, last_searched_at)
  values (left(v_term, 60), left(v_display, 60), 1, case when p_user is null then 0 else 1 end, case when coalesce(p_results, 0) = 0 then 1 else 0 end, now())
  on conflict (term) do update set
    search_count = public.search_terms.search_count + 1,
    user_count = public.search_terms.user_count + case when p_user is null then 0 else 1 end,
    zero_result_count = public.search_terms.zero_result_count + case when coalesce(p_results, 0) = 0 then 1 else 0 end,
    display_term = case when public.search_terms.display_term = '' then excluded.display_term else public.search_terms.display_term end,
    last_searched_at = now();
end;
$$;

-- 5) 分发配置（单行，带版本历史）
create table if not exists public.distribution_config (
  id integer primary key default 1 check (id = 1),
  config jsonb not null,
  version integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.distribution_config_history (
  id bigserial primary key,
  version integer not null,
  config jsonb not null,
  updated_by uuid,
  created_at timestamptz not null default now()
);

insert into public.distribution_config (id, config, version)
values (1, '{
  "weights": {"like": 2, "bookmark": 5, "share": 3, "read": 0.1, "complete": 0.6, "follow": 4},
  "decayHours": 72,
  "windows": {"recent": 72, "rising": 24, "long": 720},
  "ranking": {"size": 20, "ttlMinutes": 10, "longTtlMinutes": 180},
  "recommend": {"interest": 0.4, "hot": 0.2, "fresh": 0.15, "collection": 0.15, "explore": 0.1, "maxPerAuthor": 2, "maxPerCategory": 3, "freshHours": 72},
  "search": {"minUsersForHot": 3, "ttlMinutes": 20},
  "series": {"minChapters": 1, "featuredLimit": 6, "trendingLimit": 12}
}'::jsonb, 1)
on conflict (id) do nothing;

-- 6) 管理员人工精选合集（与自然热度严格区分）
create table if not exists public.series_curation (
  series_id uuid primary key references public.post_series(id) on delete cascade,
  featured boolean not null default true,
  featured_rank integer not null default 100,
  note text,
  curated_by uuid,
  curated_at timestamptz not null default now()
);

-- 7) 合集逐篇阅读记录（用于真实阅读进度，而不是"点开即读完"）
create table if not exists public.collection_read_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id uuid not null references public.post_series(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  progress integer not null default 100 check (progress between 0 and 100),
  dwell_seconds integer not null default 0 check (dwell_seconds >= 0),
  read_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists collection_read_items_series_idx on public.collection_read_items (user_id, series_id, read_at desc);

alter table public.collection_read_items enable row level security;
drop policy if exists collection_read_items_own on public.collection_read_items;
create policy collection_read_items_own on public.collection_read_items
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 8) 推荐曝光记录（用于真实分发比例与点击率，不做用户级公开）
create table if not exists public.content_impressions (
  id bigserial primary key,
  entity_type text not null,
  entity_id uuid not null,
  user_id uuid,
  surface text not null default 'web',
  pool text,
  created_at timestamptz not null default now()
);
create index if not exists content_impressions_time_idx on public.content_impressions (created_at desc);
create index if not exists content_impressions_surface_idx on public.content_impressions (surface, created_at desc);

alter table public.content_impressions enable row level security;
drop policy if exists content_impressions_admin_read on public.content_impressions;
create policy content_impressions_admin_read on public.content_impressions
  for select using (public.is_admin() or public.has_staff_permission('content.review'));

-- 9) 管理员操作审计
create table if not exists public.admin_action_logs (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_action_logs_time_idx on public.admin_action_logs (created_at desc);

-- 10) 合集真实内容更新时间：只有作品层面的有效变化才刷新
alter table public.post_series add column if not exists content_updated_at timestamptz;
update public.post_series s
set content_updated_at = coalesce((
  select max(p.updated_at) from public.posts p where p.series_id = s.id and p.status = 'published'
), s.updated_at)
where s.content_updated_at is null;
alter table public.post_series alter column content_updated_at set default now();
alter table public.post_series alter column content_updated_at set not null;
create index if not exists post_series_content_updated_idx on public.post_series (content_updated_at desc);

create or replace function public.heika_touch_series_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE') then
    if old.series_id is not null then
      update public.post_series set content_updated_at = now() where id = old.series_id;
    end if;
    return old;
  end if;
  if new.series_id is not null and (new.status = 'published' or old.status = 'published') then
    update public.post_series set content_updated_at = now() where id = new.series_id;
  end if;
  if tg_op = 'UPDATE' and old.series_id is not null and old.series_id is distinct from new.series_id then
    update public.post_series set content_updated_at = now() where id = old.series_id;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_touch_series_content on public.posts;
-- 只认正文/状态/排序/归属变化；反复改标题或封面不会刷新合集"最近更新"。
create trigger posts_touch_series_content
after insert or update of status, series_id, series_order, body or delete on public.posts
for each row execute function public.heika_touch_series_content();

-- 11) 既有互动回填为事件（只补一次，不重复）
insert into public.content_events (entity_type, entity_id, user_id, kind, surface, occurred_at, dedupe_key)
select 'post', ui.post_id, ui.user_id, 'like', 'backfill', coalesce(ui.liked_at, ui.viewed_at, now()), 'like:' || ui.post_id || ':' || ui.user_id
from public.user_interactions ui
where ui.liked = true
on conflict (dedupe_key) do nothing;

insert into public.content_events (entity_type, entity_id, user_id, kind, surface, occurred_at, dedupe_key)
select 'post', b.post_id, b.user_id, 'bookmark', 'backfill', b.created_at, 'bookmark:' || b.post_id || ':' || b.user_id
from public.bookmarks b
on conflict (dedupe_key) do nothing;

insert into public.content_events (entity_type, entity_id, user_id, kind, surface, occurred_at)
select 'post', e.post_id, e.user_id, 'share', 'backfill', e.created_at
from public.post_share_events e
where not exists (
  select 1 from public.content_events c
  where c.entity_type = 'post' and c.entity_id = e.post_id and c.kind = 'share' and c.surface = 'backfill' and c.occurred_at = e.created_at
);

insert into public.content_events (entity_type, entity_id, user_id, kind, surface, occurred_at, dedupe_key)
select 'series', f.series_id, f.user_id, 'follow', 'backfill', f.created_at, 'follow:' || f.series_id || ':' || f.user_id
from public.collection_follows f
on conflict (dedupe_key) do nothing;

-- 12) 互动写入自动维护事件（删除/取消同步回收，避免取消点赞仍计入热度）
create or replace function public.heika_sync_like_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE') then
    delete from public.content_events where dedupe_key = 'like:' || old.post_id || ':' || old.user_id;
    return old;
  end if;
  if new.liked then
    insert into public.content_events (entity_type, entity_id, user_id, kind, occurred_at, dedupe_key)
    values ('post', new.post_id, new.user_id, 'like', coalesce(new.liked_at, now()), 'like:' || new.post_id || ':' || new.user_id)
    on conflict (dedupe_key) do update set occurred_at = excluded.occurred_at;
  else
    delete from public.content_events where dedupe_key = 'like:' || new.post_id || ':' || new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_interactions_sync_content_event on public.user_interactions;
create trigger user_interactions_sync_content_event
after insert or update of liked, liked_at, post_id or delete on public.user_interactions
for each row execute function public.heika_sync_like_event();

create or replace function public.heika_sync_bookmark_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE') then
    delete from public.content_events where dedupe_key = 'bookmark:' || old.post_id || ':' || old.user_id;
    return old;
  end if;
  insert into public.content_events (entity_type, entity_id, user_id, kind, occurred_at, dedupe_key)
  values ('post', new.post_id, new.user_id, 'bookmark', new.created_at, 'bookmark:' || new.post_id || ':' || new.user_id)
  on conflict (dedupe_key) do update set occurred_at = excluded.occurred_at;
  return new;
end;
$$;

drop trigger if exists bookmarks_sync_content_event on public.bookmarks;
create trigger bookmarks_sync_content_event
after insert or delete on public.bookmarks
for each row execute function public.heika_sync_bookmark_event();

create or replace function public.heika_sync_follow_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE') then
    delete from public.content_events where dedupe_key = 'follow:' || old.series_id || ':' || old.user_id;
    return old;
  end if;
  insert into public.content_events (entity_type, entity_id, user_id, kind, occurred_at, dedupe_key)
  values ('series', new.series_id, new.user_id, 'follow', new.created_at, 'follow:' || new.series_id || ':' || new.user_id)
  on conflict (dedupe_key) do update set occurred_at = excluded.occurred_at;
  return new;
end;
$$;

drop trigger if exists collection_follows_sync_content_event on public.collection_follows;
create trigger collection_follows_sync_content_event
after insert or delete on public.collection_follows
for each row execute function public.heika_sync_follow_event();

-- 13) 内容删除后清理事件与热度，避免幽灵条目进入榜单
create or replace function public.heika_clear_content_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_table_name = 'posts') then
    delete from public.content_events where entity_type = 'post' and entity_id = old.id;
    delete from public.content_hot where entity_type = 'post' and entity_id = old.id;
    delete from public.content_impressions where entity_type = 'post' and entity_id = old.id;
    delete from public.collection_read_items where post_id = old.id;
  else
    delete from public.content_events where entity_type = 'series' and entity_id = old.id;
    delete from public.content_hot where entity_type = 'series' and entity_id = old.id;
    delete from public.content_impressions where entity_type = 'series' and entity_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists posts_clear_content_events on public.posts;
create trigger posts_clear_content_events
after delete on public.posts
for each row execute function public.heika_clear_content_events();

drop trigger if exists post_series_clear_content_events on public.post_series;
create trigger post_series_clear_content_events
after delete on public.post_series
for each row execute function public.heika_clear_content_events();

-- 搜索记录只允许服务端写入，避免公开接口刷热搜
revoke all on function public.heika_record_search(text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.heika_record_search(text, text, uuid, integer) to service_role;

commit;
