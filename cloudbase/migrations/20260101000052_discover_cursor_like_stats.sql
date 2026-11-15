-- Keep public like counts aggregate-only so voters remain private behind RLS.
create table public.post_like_stats (
  post_id uuid primary key references public.posts(id) on delete cascade,
  like_count integer not null default 0 check (like_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.post_like_stats enable row level security;
create policy post_like_stats_published_read on public.post_like_stats
  for select to anon, authenticated using (
    exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
  );
grant select on public.post_like_stats to anon, authenticated;
revoke insert, update, delete on public.post_like_stats from public, anon, authenticated;

insert into public.post_like_stats (post_id, like_count)
select i.post_id, count(*)::integer
from public.user_interactions i
where i.liked
group by i.post_id;

create index user_interactions_liked_post_idx
  on public.user_interactions (post_id) where liked;

create or replace function public.sync_post_like_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.liked then
      insert into public.post_like_stats (post_id, like_count)
      values (new.post_id, 1)
      on conflict (post_id) do update
        set like_count = public.post_like_stats.like_count + 1,
            updated_at = now();
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.liked then
      update public.post_like_stats
      set like_count = greatest(0, like_count - 1), updated_at = now()
      where post_id = old.post_id;
    end if;
    return old;
  end if;

  if old.liked and (not new.liked or old.post_id is distinct from new.post_id) then
    update public.post_like_stats
    set like_count = greatest(0, like_count - 1), updated_at = now()
    where post_id = old.post_id;
  end if;

  if new.liked and (not old.liked or old.post_id is distinct from new.post_id) then
    insert into public.post_like_stats (post_id, like_count)
    values (new.post_id, 1)
    on conflict (post_id) do update
      set like_count = public.post_like_stats.like_count + 1,
          updated_at = now();
  end if;
  return new;
end;
$$;
revoke all on function public.sync_post_like_stats() from public, anon, authenticated;

create trigger user_interactions_like_stats
after insert or update of liked, post_id or delete on public.user_interactions
for each row execute function public.sync_post_like_stats();

create index posts_discover_cursor_idx
  on public.posts (created_at desc, id desc) where status = 'published';

-- Cursor paging keeps exclusions and topic filters inside the database while
-- returning only one stable, chronologically ordered batch at a time.
create or replace function public.get_discover_cursor(
  p_limit integer,
  p_tag bigint default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with feed_limit as (
    select least(greatest(coalesce(p_limit, 24), 1), 24) as value
  ), visible_posts as materialized (
    select p.id, p.created_at
    from public.posts p
    where p.status = 'published'
      and (p_tag is null or p.tag_id = p_tag)
      and not exists (
        select 1 from public.user_recommendation_filters f
        where f.user_id = auth.uid() and f.filter_type = 'author' and f.target_author_id = p.author_id
      )
      and not exists (
        select 1 from public.post_topics pt
        join public.user_recommendation_filters f on f.target_topic_id = pt.topic_id
        where pt.post_id = p.id and f.user_id = auth.uid() and f.filter_type = 'topic'
      )
      and not exists (
        select 1 from public.user_interactions i
        where i.post_id = p.id and i.user_id = auth.uid() and i.skipped_at is not null
      )
  ), eligible_posts as (
    select id, created_at from visible_posts
    where p_cursor_created_at is null
       or (p_cursor_id is not null and (created_at, id) < (p_cursor_created_at, p_cursor_id))
  ), candidates as (
    select e.id, e.created_at
    from eligible_posts e
    order by e.created_at desc, e.id desc
    limit (select value + 1 from feed_limit)
  ), page_rows as (
    select c.id, c.created_at
    from candidates c
    order by c.created_at desc, c.id desc
    limit (select value from feed_limit)
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by created_at desc, id desc) from page_rows), '[]'::jsonb),
    'has_more', (select count(*) > (select value from feed_limit) from candidates),
    'total', case when p_cursor_created_at is null then (select count(*) from visible_posts) else null end
  );
$$;
revoke all on function public.get_discover_cursor(integer, bigint, timestamptz, uuid) from public;
grant execute on function public.get_discover_cursor(integer, bigint, timestamptz, uuid) to anon, authenticated;
