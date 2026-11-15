-- Add a manual review state for user-submitted content. No automated image
-- moderation provider is configured, so new submissions stay private until an
-- administrator approves them.
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status in ('draft', 'pending_review', 'published', 'hidden'));

alter table public.posts
  add column if not exists moderation_reviewed_at timestamptz,
  add column if not exists moderation_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderation_review_note text;

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (
    (author_id = (select auth.uid()) and not is_demo and status in ('draft', 'pending_review'))
    or (select public.is_admin())
  );

drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (
    (author_id = (select auth.uid()) and status in ('draft', 'pending_review'))
    or (select public.is_admin())
  );

-- Draft and pending-review authors may attach official topics, but public topic
-- counts remain restricted to published content by get_topic_stats().
drop policy if exists post_topics_insert on public.post_topics;
create policy post_topics_insert on public.post_topics for insert to authenticated
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
      and p.status in ('draft', 'pending_review', 'published')
  ) and exists (select 1 from public.interest_tags t where t.id = topic_id and t.active));

create or replace function public.replace_post_topics(p_post_id uuid, p_topic_ids bigint[])
returns void language plpgsql security invoker set search_path = public as $$
declare
  topic_ids bigint[] := coalesce(p_topic_ids, '{}'::bigint[]);
begin
  if cardinality(topic_ids) > 5 then raise exception '最多选择 5 个话题'; end if;
  if cardinality(topic_ids) <> (select count(distinct x) from unnest(topic_ids) as x) then
    raise exception '话题不能重复';
  end if;
  if not exists (
    select 1 from public.posts p where p.id = p_post_id
      and p.author_id = (select auth.uid())
      and p.status in ('draft', 'pending_review', 'published')
  ) then raise exception '无权编辑此内容'; end if;
  if exists (
    select 1 from unnest(topic_ids) x
    left join public.interest_tags t on t.id = x
    where t.id is null or not t.active
  ) then raise exception '话题无效'; end if;
  delete from public.post_topics where post_id = p_post_id;
  insert into public.post_topics(post_id, topic_id)
  select p_post_id, x from unnest(topic_ids) x;
end;
$$;
grant execute on function public.replace_post_topics(uuid, bigint[]) to authenticated;

alter table public.reports
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

create unique index if not exists reports_open_post_reporter_uidx
  on public.reports(reporter_id, post_id) where status = 'open' and post_id is not null;
create unique index if not exists reports_open_comment_reporter_uidx
  on public.reports(reporter_id, comment_id) where status = 'open' and comment_id is not null;
create index if not exists reports_queue_idx on public.reports(status, created_at desc);
create index if not exists posts_pending_review_idx on public.posts(created_at desc) where status = 'pending_review';
