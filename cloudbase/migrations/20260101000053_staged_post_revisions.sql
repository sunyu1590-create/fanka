-- Keep edits to live content private until an administrator approves them.
create table public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index post_revisions_pending_idx on public.post_revisions(created_at) where status = 'pending';
alter table public.post_revisions enable row level security;
revoke all on public.post_revisions from public, anon;
grant select, insert, update, delete on public.post_revisions to authenticated;
create policy post_revisions_read on public.post_revisions for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy post_revisions_insert on public.post_revisions for insert to authenticated
  with check (
    author_id = (select auth.uid()) and status = 'pending'
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()) and p.status = 'published')
  );
create policy post_revisions_update on public.post_revisions for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (
    (author_id = (select auth.uid()) and status in ('pending', 'rejected')
      and exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()) and p.status = 'published'))
    or (select public.is_admin())
  );
create policy post_revisions_delete on public.post_revisions for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- Give authenticated administrators the same child-row access needed to apply
-- a review, while leaving author policies and all public read rules intact.
create policy post_media_admin_manage on public.post_media for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy post_topics_admin_manage on public.post_topics for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy post_polls_admin_manage on public.post_polls for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy post_poll_options_admin_manage on public.post_poll_options for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Apply the reviewed revision in one database transaction. The function runs as
-- the signed-in administrator (SECURITY INVOKER) and rechecks poll invariants.
create or replace function public.apply_post_revision(p_post_id uuid, p_review_note text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  revision public.post_revisions%rowtype;
  current_post public.posts%rowtype;
  target_tag_id bigint;
  target_series_id uuid;
  media_paths text[];
  topic_names text[];
  current_poll public.post_polls%rowtype;
  current_options jsonb;
  current_votes bigint;
  target_poll jsonb;
  target_question text;
  target_options text[];
  target_poll_id uuid;
begin
  if not public.is_admin() then raise exception '需要管理员权限'; end if;
  select * into revision from public.post_revisions where post_id = p_post_id and status = 'pending' for update;
  if not found then raise exception '待审核修改不存在'; end if;
  select * into current_post from public.posts where id = p_post_id for update;
  if not found or current_post.status <> 'published' or current_post.author_id <> revision.author_id then
    raise exception '原内容已不可用，无法应用修改';
  end if;
  if jsonb_typeof(revision.payload->'title') is distinct from 'string' or char_length(btrim(revision.payload->>'title')) not between 1 and 80
    or jsonb_typeof(revision.payload->'body') is distinct from 'string' or char_length(btrim(revision.payload->>'body')) not between 1 and 5000 then
    raise exception '待审核正文数据无效';
  end if;
  select id into target_tag_id from public.interest_tags where name = revision.payload->>'tag' and active;
  if target_tag_id is null then raise exception '分类已失效'; end if;
  target_series_id := nullif(revision.payload->>'seriesId', '')::uuid;
  if target_series_id is not null and not exists (select 1 from public.post_series where id = target_series_id and creator_id = revision.author_id) then
    raise exception '作品系列已失效';
  end if;
  if jsonb_typeof(revision.payload->'mediaPaths') is distinct from 'array' then raise exception '图片列表无效'; end if;
  select coalesce(array_agg(value order by ordinality), '{}') into media_paths
  from jsonb_array_elements_text(revision.payload->'mediaPaths') with ordinality as paths(value, ordinality);
  if cardinality(media_paths) > 9 or cardinality(media_paths) <> (select count(distinct value) from unnest(media_paths) value)
    or exists (select 1 from unnest(media_paths) value where value !~ ('^' || revision.author_id::text || '/[^/]{1,280}$')) then
    raise exception '图片列表无效';
  end if;
  if jsonb_typeof(revision.payload->'topics') is distinct from 'array' then raise exception '话题列表无效'; end if;
  select coalesce(array_agg(value), '{}') into topic_names from jsonb_array_elements_text(revision.payload->'topics') as topics(value);
  if cardinality(topic_names) > 5 or cardinality(topic_names) <> (select count(distinct value) from unnest(topic_names) value)
    or exists (select 1 from unnest(topic_names) n left join public.interest_tags t on t.name = n and t.active where t.id is null) then
    raise exception '话题列表无效';
  end if;
  if coalesce(revision.payload->>'coverUrl', '') <> '' and revision.payload->>'coverUrl' !~ '^https?://' then raise exception '封面地址无效'; end if;

  target_poll := revision.payload->'poll';
  select * into current_poll from public.post_polls where post_id = p_post_id;
  if found then
    select coalesce(jsonb_agg(label order by position), '[]'::jsonb), coalesce(sum(vote_count), 0)
      into current_options, current_votes from public.post_poll_options where poll_id = current_poll.id;
    if current_votes > 0 and target_poll is distinct from jsonb_build_object('question', current_poll.question, 'options', current_options) then
      raise exception '投票已有人参与，无法应用对投票的修改';
    end if;
  else
    current_votes := 0;
  end if;
  if current_votes = 0 then
    if target_poll is null or target_poll = 'null'::jsonb then
      delete from public.post_polls where post_id = p_post_id;
    else
      target_question := btrim(target_poll->>'question');
      select array_agg(btrim(value) order by ordinality) into target_options
      from jsonb_array_elements_text(target_poll->'options') with ordinality as options(value, ordinality)
      where btrim(value) <> '';
      if target_question is null or char_length(target_question) not between 1 and 180 or coalesce(cardinality(target_options), 0) not between 2 and 4
        or exists (select 1 from unnest(target_options) value where char_length(value) > 80)
        or cardinality(target_options) <> (select count(distinct value) from unnest(target_options) value) then
        raise exception '投票内容无效';
      end if;
      if current_poll.id is not null then
        update public.post_polls set question = target_question where id = current_poll.id returning id into target_poll_id;
        delete from public.post_poll_options where post_poll_options.poll_id = target_poll_id;
      else
        insert into public.post_polls(post_id, question) values (p_post_id, target_question) returning id into target_poll_id;
      end if;
      insert into public.post_poll_options(poll_id, label, position)
      select target_poll_id, value, (ordinality - 1)::smallint from unnest(target_options) with ordinality as options(value, ordinality);
    end if;
  end if;

  delete from public.post_media where post_id = p_post_id;
  insert into public.post_media(post_id, storage_path, sort_order)
  select p_post_id, value, (ordinality - 1)::int from unnest(media_paths) with ordinality as paths(value, ordinality);
  delete from public.post_topics where post_id = p_post_id;
  insert into public.post_topics(post_id, topic_id)
  select p_post_id, t.id from public.interest_tags t where t.name = any(topic_names) and t.active;
  update public.posts set
    title = btrim(revision.payload->>'title'), body = btrim(revision.payload->>'body'), tag_id = target_tag_id,
    series_id = target_series_id, image_url = nullif(revision.payload->>'coverUrl', ''), status = 'published',
    moderation_review_note = p_review_note, moderation_reviewed_at = now(), moderation_reviewed_by = auth.uid(), updated_at = now()
  where id = p_post_id;
  update public.post_revisions set status = 'approved', review_note = p_review_note, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
  where id = revision.id;
  return jsonb_build_object('id', p_post_id, 'status', 'published', 'revision_applied', true);
end;
$$;
revoke all on function public.apply_post_revision(uuid, text) from public, anon;
grant execute on function public.apply_post_revision(uuid, text) to authenticated;
