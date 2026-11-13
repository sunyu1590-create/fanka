-- Keep resource type IDs stable while allowing staff to rename or disable them.
-- Historical posts retain their type and empty scenarios until an author edits them.
alter table public.posts
  add column if not exists usage_scenarios text[] not null default '{}';

alter table public.posts drop constraint if exists posts_usage_scenarios_check;
alter table public.posts add constraint posts_usage_scenarios_check
  check (
    cardinality(usage_scenarios) <= 6
    and usage_scenarios <@ array['learning','programming','writing','office','creation','life']::text[]
  );

create index if not exists posts_ai_usage_scenarios_gin_idx
  on public.posts using gin (usage_scenarios)
  where channel = 'ai' and status = 'published';

create table if not exists public.ai_resource_types (
  resource_type text primary key,
  label text not null check (char_length(btrim(label)) between 1 and 24),
  description text not null check (char_length(description) <= 120),
  enabled boolean not null default true,
  sort_order smallint not null default 0 check (sort_order between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.ai_resource_types(resource_type,label,description,sort_order) values
  ('agent','Agent','智能体与自动化任务。',10),
  ('skill','Skills','技能插件与能力扩展。',20),
  ('prompt','Prompt','提示词与实用模板。',30),
  ('ai_tool','AI 工具','应用与效率工具。',40),
  ('knowledge_article','AI 知识','模型知识与使用技巧。',50),
  ('tutorial','案例实践','真实场景与操作教程。',60)
on conflict (resource_type) do nothing;

alter table public.ai_resource_types enable row level security;
drop policy if exists ai_resource_types_read on public.ai_resource_types;
create policy ai_resource_types_read on public.ai_resource_types for select to anon, authenticated
  using (enabled or (select public.has_staff_permission('ai.review')));
drop policy if exists ai_resource_types_admin_update on public.ai_resource_types;
create policy ai_resource_types_admin_update on public.ai_resource_types for update to authenticated
  using ((select public.has_staff_permission('ai.review')))
  with check ((select public.has_staff_permission('ai.review')));
grant select on public.ai_resource_types to anon, authenticated;
grant update (label, description, enabled, sort_order, updated_at, updated_by) on public.ai_resource_types to authenticated;

-- Include scenario metadata in published resource history, without changing the
-- existing review transaction or approval rules.
create or replace function heika_private.capture_ai_resource_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if new.channel <> 'ai' or new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' and old.channel = new.channel
    and old.title is not distinct from new.title and old.body is not distinct from new.body
    and old.tag_id is not distinct from new.tag_id and old.content_type is not distinct from new.content_type
    and old.resource_data is not distinct from new.resource_data and old.usage_scenarios is not distinct from new.usage_scenarios then
    return new;
  end if;
  select coalesce(max(nullif(regexp_replace(version_label, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    into next_version from public.ai_resource_versions where post_id = new.id;
  insert into public.ai_resource_versions(post_id, version_label, payload, changelog, created_by)
  values (new.id, 'v' || next_version::text,
    jsonb_build_object('title', new.title, 'body', new.body, 'contentType', new.content_type,
      'resourceData', new.resource_data, 'usageScenarios', new.usage_scenarios, 'categoryId', new.tag_id),
    coalesce(new.resource_data->>'changelog', case when next_version = 1 then '首次发布' else '审核通过的更新' end), new.author_id);
  return new;
end
$$;
revoke all on function heika_private.capture_ai_resource_version() from public, anon, authenticated;
drop trigger if exists capture_ai_resource_version on public.posts;
create trigger capture_ai_resource_version after insert or update of status, title, body, tag_id, content_type, resource_data, usage_scenarios on public.posts
  for each row execute function heika_private.capture_ai_resource_version();

-- Review AI revisions atomically, preserving classification and scenario state.
create or replace function public.apply_ai_post_revision(p_post_id uuid, p_review_note text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare revision public.post_revisions%rowtype; current_post public.posts%rowtype; target_tag_id bigint; target_type text; target_data jsonb; target_scenarios text[];
  topic_names text[];
begin
  if not public.has_staff_permission('ai.review') then raise exception '需要 AI 内容审核权限'; end if;
  select * into revision from public.post_revisions where post_id = p_post_id and status = 'pending' for update;
  if not found then raise exception '待审核修改不存在'; end if;
  select * into current_post from public.posts where id = p_post_id for update;
  if not found or current_post.channel <> 'ai' or current_post.status <> 'published' or current_post.author_id <> revision.author_id then
    raise exception 'AI 资源已不可用，无法应用修改';
  end if;
  if char_length(btrim(revision.payload->>'title')) not between 1 and 80 or char_length(btrim(revision.payload->>'body')) not between 1 and 5000 then
    raise exception '待审核内容无效';
  end if;
  target_type := revision.payload->>'contentType';
  if target_type not in ('knowledge_article','agent','skill','prompt','ai_tool','tutorial') then raise exception 'AI 内容类型无效'; end if;
  if not exists(select 1 from public.ai_resource_types where resource_type = target_type and enabled) then raise exception 'AI 资源类型已停用'; end if;
  target_data := coalesce(revision.payload->'resourceData','{}'::jsonb);
  if jsonb_typeof(target_data) <> 'object' then raise exception 'AI 资源字段无效'; end if;
  select id into target_tag_id from public.interest_tags where name = revision.payload->>'tag' and channel = 'ai' and kind = 'category' and active and merged_into_id is null;
  if target_tag_id is null then raise exception 'AI 分类已失效'; end if;
  if jsonb_typeof(revision.payload->'mediaPaths') is distinct from 'array' then raise exception '媒体列表无效'; end if;
  if jsonb_array_length(revision.payload->'mediaPaths') > 9 or exists(select 1 from jsonb_array_elements_text(revision.payload->'mediaPaths') p where p !~ ('^' || revision.author_id::text || '/[^/]{1,280}$')) then raise exception '媒体路径无效'; end if;
  if jsonb_typeof(revision.payload->'topics') is distinct from 'array' then raise exception '标签列表无效'; end if;
  select coalesce(array_agg(value), '{}') into topic_names from jsonb_array_elements_text(revision.payload->'topics') as topics(value);
  if cardinality(topic_names) > 5 or cardinality(topic_names) <> (select count(distinct value) from unnest(topic_names) value)
    or exists(select 1 from unnest(topic_names) n left join public.interest_tags t on t.name = n and t.channel = 'ai' and t.kind = 'tag' and t.active and t.moderation_status = 'approved' where t.id is null) then raise exception 'AI 标签无效'; end if;
  if jsonb_typeof(coalesce(revision.payload->'usageScenarios','[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(revision.payload->'usageScenarios','[]'::jsonb)) > 6
    or exists(select 1 from jsonb_array_elements_text(coalesce(revision.payload->'usageScenarios','[]'::jsonb)) as scenarios(value) where value not in ('learning','programming','writing','office','creation','life')) then raise exception 'AI 使用场景无效'; end if;
  select coalesce(array_agg(distinct value), '{}') into target_scenarios from jsonb_array_elements_text(coalesce(revision.payload->'usageScenarios','[]'::jsonb)) as scenarios(value);
  perform set_config('heika.apply_review_post_id', p_post_id::text, true);
  update public.posts set title = btrim(revision.payload->>'title'), body = btrim(revision.payload->>'body'), tag_id = target_tag_id,
    content_type = target_type, resource_data = target_data, usage_scenarios = target_scenarios, image_url = nullif(revision.payload->>'coverUrl',''),
    moderation_review_note = p_review_note, moderation_reviewed_at = now(), moderation_reviewed_by = auth.uid(), updated_at = now()
    where id = p_post_id;
  delete from public.post_media where post_id = p_post_id;
  insert into public.post_media(post_id, storage_path, sort_order)
    select p_post_id, value, (ordinality - 1)::integer from jsonb_array_elements_text(revision.payload->'mediaPaths') with ordinality as paths(value, ordinality);
  delete from public.post_topics where post_id = p_post_id;
  insert into public.post_topics(post_id, topic_id)
    select p_post_id, t.id from public.interest_tags t where t.name = any(topic_names) and t.channel = 'ai' and t.kind = 'tag' and t.active and t.moderation_status = 'approved';
  update public.post_revisions set status = 'approved', review_note = p_review_note, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now() where id = revision.id;
  return jsonb_build_object('id', p_post_id, 'status', 'published', 'revision_applied', true);
end
$$;
revoke all on function public.apply_ai_post_revision(uuid, text) from public, anon;
grant execute on function public.apply_ai_post_revision(uuid, text) to authenticated;
