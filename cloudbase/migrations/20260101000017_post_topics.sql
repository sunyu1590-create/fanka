-- Reuse the curated interest_tags catalog instead of creating user-generated tags.
create table public.post_topics (
  post_id uuid not null references public.posts(id) on delete cascade,
  topic_id bigint not null references public.interest_tags(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (post_id, topic_id)
);
create index post_topics_topic_post_idx on public.post_topics(topic_id, post_id);

-- Backfill the existing primary category as the first official topic.
insert into public.post_topics(post_id, topic_id)
select p.id, p.tag_id from public.posts p
join public.interest_tags t on t.id = p.tag_id and t.active
on conflict do nothing;

alter table public.post_topics enable row level security;
create policy post_topics_read on public.post_topics for select to anon, authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (p.status = 'published' or p.author_id = auth.uid() or public.is_admin())
  ));
create policy post_topics_insert on public.post_topics for insert to authenticated
  with check (exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = auth.uid() and p.status in ('draft', 'published')
  ) and exists (select 1 from public.interest_tags t where t.id = topic_id and t.active));
create policy post_topics_delete on public.post_topics for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));
grant select on public.post_topics to anon, authenticated;
grant insert, delete on public.post_topics to authenticated;

-- Replace a post's selected topics atomically, with ownership and catalog checks.
create function public.replace_post_topics(p_post_id uuid, p_topic_ids bigint[])
returns void language plpgsql security invoker set search_path = public as $$
declare
  topic_ids bigint[] := coalesce(p_topic_ids, '{}'::bigint[]);
begin
  if cardinality(topic_ids) > 5 then raise exception '最多选择 5 个话题'; end if;
  if cardinality(topic_ids) <> (select count(distinct x) from unnest(topic_ids) as x) then
    raise exception '话题不能重复';
  end if;
  if not exists (select 1 from public.posts p where p.id = p_post_id and p.author_id = auth.uid() and p.status in ('draft','published')) then
    raise exception '无权编辑此内容';
  end if;
  if exists (select 1 from unnest(topic_ids) x left join public.interest_tags t on t.id = x where t.id is null or not t.active) then
    raise exception '话题无效';
  end if;
  delete from public.post_topics where post_id = p_post_id;
  insert into public.post_topics(post_id, topic_id)
  select p_post_id, x from unnest(topic_ids) x;
end;
$$;
grant execute on function public.replace_post_topics(uuid, bigint[]) to authenticated;

-- Aggregate counts only; identities stay protected by RLS and are never returned.
create function public.get_topic_stats()
returns table(topic_id bigint, post_count bigint, participant_count bigint)
language sql stable security invoker set search_path = public as $$
  select t.id, count(distinct p.id), count(distinct p.author_id)
  from public.interest_tags t
  left join public.post_topics pt on pt.topic_id = t.id
  left join public.posts p on p.id = pt.post_id and p.status = 'published'
  where t.active
  group by t.id
$$;
grant execute on function public.get_topic_stats() to anon, authenticated;
