-- Creator graph, authored series, and time-limited topic co-creation.
create table public.creator_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  constraint creator_follows_no_self check (follower_id <> creator_id)
);
create index creator_follows_creator_idx on public.creator_follows(creator_id, created_at desc);
alter table public.creator_follows enable row level security;
create policy creator_follows_read on public.creator_follows for select to anon, authenticated using (true);
create policy creator_follows_insert on public.creator_follows for insert to authenticated with check ((select auth.uid()) = follower_id and follower_id <> creator_id);
create policy creator_follows_delete on public.creator_follows for delete to authenticated using ((select auth.uid()) = follower_id);
grant select on public.creator_follows to anon, authenticated;
grant insert, delete on public.creator_follows to authenticated;

create table public.post_series (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 48),
  description text not null default '' check (char_length(description) <= 240),
  created_at timestamptz not null default now(),
  unique (creator_id, title)
);
create index post_series_creator_idx on public.post_series(creator_id, created_at desc);
alter table public.post_series enable row level security;
create policy post_series_read on public.post_series for select to anon, authenticated using (true);
create policy post_series_insert on public.post_series for insert to authenticated with check ((select auth.uid()) = creator_id);
create policy post_series_update on public.post_series for update to authenticated using ((select auth.uid()) = creator_id) with check ((select auth.uid()) = creator_id);
create policy post_series_delete on public.post_series for delete to authenticated using ((select auth.uid()) = creator_id);
grant select on public.post_series to anon, authenticated;
grant insert, update, delete on public.post_series to authenticated;
alter table public.posts add column series_id uuid references public.post_series(id) on delete set null;
create index posts_series_published_idx on public.posts(series_id, created_at desc) where status = 'published';

create table public.topic_events (
  id uuid primary key default gen_random_uuid(),
  topic_id bigint not null references public.interest_tags(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 4 and 80),
  description text not null check (char_length(btrim(description)) between 8 and 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index topic_events_active_idx on public.topic_events(starts_at, ends_at);
alter table public.topic_events enable row level security;
create policy topic_events_read on public.topic_events for select to anon, authenticated using ((starts_at <= now() and ends_at > now()) or created_by = (select auth.uid()) or public.is_admin());
create policy topic_events_admin_insert on public.topic_events for insert to authenticated with check (public.is_admin());
create policy topic_events_admin_update on public.topic_events for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy topic_events_admin_delete on public.topic_events for delete to authenticated using (public.is_admin());
grant select on public.topic_events to anon, authenticated;
grant insert, update, delete on public.topic_events to authenticated;

create table public.topic_event_participants (
  event_id uuid not null references public.topic_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index topic_event_participants_user_idx on public.topic_event_participants(user_id, joined_at desc);
alter table public.topic_event_participants enable row level security;
create policy topic_event_participants_read on public.topic_event_participants for select to anon, authenticated using (true);
create policy topic_event_participants_join on public.topic_event_participants for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.topic_events e where e.id = event_id and e.starts_at <= now() and e.ends_at > now()
  )
);
create policy topic_event_participants_leave on public.topic_event_participants for delete to authenticated using ((select auth.uid()) = user_id);
grant select on public.topic_event_participants to anon, authenticated;
grant insert, delete on public.topic_event_participants to authenticated;

insert into public.topic_events(topic_id,title,description,starts_at,ends_at)
select id, '本月共创 · 给生活留一点空白', '分享一个让日常慢下来的小方法：一段散步、一张照片，或一个留给自己的小时。带上 #生活 一起完成本月主题。', now(), now() + interval '30 days'
from public.interest_tags where name = '生活' and active
and not exists (select 1 from public.topic_events where title = '本月共创 · 给生活留一点空白');
