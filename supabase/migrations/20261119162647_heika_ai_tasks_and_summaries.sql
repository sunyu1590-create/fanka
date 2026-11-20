-- Persistent AI task queues, current summaries, auditable token events, and model settings.
-- The application server checks admin identity before using service_role operations.

create table if not exists public.ai_task_batches (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (task_type in ('summary_all', 'summary_incremental', 'review_pending')),
  status text not null default 'queued' check (status in ('queued', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  created_by uuid references public.profiles(id) on delete set null,
  config_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(config_snapshot) = 'object'),
  total_count integer not null default 0 check (total_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  current_post_id uuid references public.posts(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_task_batches drop constraint if exists ai_task_batches_task_type_check;
alter table public.ai_task_batches add constraint ai_task_batches_task_type_check
  check (task_type in ('summary_all', 'summary_incremental', 'review_pending', 'classification'));
create index if not exists ai_task_batches_status_created_idx on public.ai_task_batches(status, created_at);
create unique index if not exists ai_task_batches_one_active_type_idx on public.ai_task_batches(
  (case when task_type in ('summary_all', 'summary_incremental') then 'summary' else task_type end)
) where status in ('queued', 'running', 'paused');

create table if not exists public.ai_task_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ai_task_batches(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  content_hash text not null default '',
  taxonomy_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(taxonomy_snapshot) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'review', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  result_history jsonb not null default '[]'::jsonb check (jsonb_typeof(result_history) = 'array'),
  error_message text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  elapsed_ms integer not null default 0 check (elapsed_ms >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, post_id)
);
create index if not exists ai_task_items_queue_idx on public.ai_task_items(batch_id, status, created_at);
create index if not exists ai_task_items_review_idx on public.ai_task_items(status, updated_at desc) where status = 'review';

create table if not exists public.ai_post_summaries (
  post_id uuid primary key references public.posts(id) on delete cascade,
  content_hash text not null,
  summary text not null check (char_length(summary) between 1 and 600),
  model text not null,
  task_item_id uuid references public.ai_task_items(id) on delete set null,
  generated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  task_id uuid references public.ai_task_batches(id) on delete set null,
  task_item_id uuid references public.ai_task_items(id) on delete set null,
  purpose text not null check (purpose in ('review', 'summary', 'classification', 'polish', 'markdown', 'title', 'other')),
  model text not null,
  status text not null check (status in ('success', 'failure')),
  elapsed_ms integer not null default 0 check (elapsed_ms >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  output_tokens_per_second numeric(14, 4) check (output_tokens_per_second is null or output_tokens_per_second >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  cache_hit_tokens integer check (cache_hit_tokens is null or cache_hit_tokens >= 0),
  estimated_cost numeric(14, 8),
  currency text,
  price_version text,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_created_idx on public.ai_usage_events(created_at desc);
create index if not exists ai_usage_events_purpose_created_idx on public.ai_usage_events(purpose, created_at desc);

create table if not exists public.ai_model_configs (
  purpose text primary key check (purpose in ('review', 'summary', 'classification', 'polish', 'markdown', 'title', 'other')),
  model text not null check (char_length(model) between 1 and 80),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ai_model_configs(purpose, model) values
  ('review', 'deepseek-chat'), ('summary', 'deepseek-chat'), ('classification', 'deepseek-chat'),
  ('polish', 'deepseek-chat'), ('markdown', 'deepseek-chat'), ('title', 'deepseek-chat'), ('other', 'deepseek-chat')
on conflict (purpose) do nothing;

create table if not exists public.ai_model_prices (
  model text not null check (char_length(model) between 1 and 80),
  version text not null,
  currency text not null check (currency in ('CNY', 'USD')),
  input_per_million numeric(14, 6) not null check (input_per_million >= 0),
  cache_hit_input_per_million numeric(14, 6) check (cache_hit_input_per_million is null or cache_hit_input_per_million >= 0),
  output_per_million numeric(14, 6) not null check (output_per_million >= 0),
  valid_from timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(model, version)
);

create table if not exists public.ai_model_config_history (
  id bigint generated always as identity primary key,
  purpose text not null,
  model text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists ai_model_config_history_changed_idx on public.ai_model_config_history(changed_at desc);

create table if not exists public.ai_review_decisions (
  id bigint generated always as identity primary key,
  task_item_id uuid not null references public.ai_task_items(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  decision text not null check (decision in ('published', 'hidden')),
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
create index if not exists ai_review_decisions_item_idx on public.ai_review_decisions(task_item_id, created_at desc);

alter table public.ai_task_batches enable row level security;
alter table public.ai_task_items enable row level security;
alter table public.ai_post_summaries enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_model_configs enable row level security;
alter table public.ai_model_prices enable row level security;
alter table public.ai_model_config_history enable row level security;
alter table public.ai_review_decisions enable row level security;

revoke all on public.ai_task_batches, public.ai_task_items, public.ai_post_summaries, public.ai_usage_events, public.ai_model_configs, public.ai_model_prices, public.ai_model_config_history, public.ai_review_decisions from public, anon;
grant select on public.ai_task_batches, public.ai_task_items, public.ai_usage_events, public.ai_model_configs, public.ai_model_prices, public.ai_model_config_history, public.ai_review_decisions to authenticated;
grant select on public.ai_post_summaries to anon, authenticated;
grant insert, update, delete on public.ai_model_prices to authenticated;

create policy ai_task_batches_admin_read on public.ai_task_batches for select to authenticated using ((select public.is_admin()));
create policy ai_task_items_admin_read on public.ai_task_items for select to authenticated using ((select public.is_admin()));
create policy ai_summaries_read_published on public.ai_post_summaries for select to anon, authenticated using (
  exists (select 1 from public.posts p where p.id = post_id and (p.status = 'published' or p.author_id = (select auth.uid()) or (select public.is_admin())))
);
create policy ai_usage_admin_read on public.ai_usage_events for select to authenticated using ((select public.is_admin()));
create policy ai_model_configs_admin_read on public.ai_model_configs for select to authenticated using ((select public.is_admin()));
create policy ai_model_prices_admin_all on public.ai_model_prices for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy ai_model_config_history_admin_read on public.ai_model_config_history for select to authenticated using ((select public.is_admin()));
create policy ai_review_decisions_admin_read on public.ai_review_decisions for select to authenticated using ((select public.is_admin()));

revoke insert, update, delete, truncate, references, trigger on public.ai_task_batches from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_task_items from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_post_summaries from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_usage_events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_model_configs from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_model_config_history from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_review_decisions from anon, authenticated;

create or replace function public.enqueue_ai_summary_items(p_batch_id uuid, p_include_existing boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer;
begin
  insert into public.ai_task_items(batch_id, post_id, content_hash)
  select p_batch_id, p.id, md5(coalesce(p.title, '') || E'\n' || coalesce(p.body, ''))
  from public.posts p
  left join public.ai_post_summaries s on s.post_id = p.id
  where p.status = 'published' and p.is_demo = false
    and (p_include_existing or s.post_id is null or s.content_hash is distinct from md5(coalesce(p.title, '') || E'\n' || coalesce(p.body, '')))
  on conflict (batch_id, post_id) do nothing;
  get diagnostics inserted_count = row_count;
  update public.ai_task_batches set total_count = inserted_count, status = case when inserted_count = 0 then 'completed' else 'queued' end,
    completed_at = case when inserted_count = 0 then now() else null end, updated_at = now()
  where id = p_batch_id;
  return inserted_count;
end;
$$;

create or replace function public.enqueue_ai_review_items(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer;
begin
  insert into public.ai_task_items(batch_id, post_id, content_hash)
  select p_batch_id, p.id, md5(coalesce(p.title, '') || E'\n' || coalesce(p.body, ''))
  from public.posts p
  where p.status = 'pending_review' and p.is_demo = false and p.channel in ('community', 'ai')
  on conflict (batch_id, post_id) do nothing;
  get diagnostics inserted_count = row_count;
  update public.ai_task_batches set total_count = inserted_count, status = case when inserted_count = 0 then 'completed' else 'queued' end,
    completed_at = case when inserted_count = 0 then now() else null end, updated_at = now()
  where id = p_batch_id;
  return inserted_count;
end;
$$;

-- Automatically enqueue taxonomy suggestions after a post has been saved. The
-- worker may only select from the existing approved catalog, and application
-- later compares this snapshot to avoid overwriting human edits.
create or replace function public.enqueue_ai_classification_for_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare post_row public.posts%rowtype; batch_id uuid; item_id uuid; model_name text; topic_ids bigint[];
begin
  perform pg_advisory_xact_lock(hashtextextended('heika-ai-classification-batch', 0));
  select * into post_row from public.posts p
  where p.id = p_post_id and p.status in ('pending_review', 'published') and p.is_demo = false and p.channel in ('community', 'ai');
  if not found then return jsonb_build_object('queued', false, 'reason', 'post_not_eligible'); end if;

  select coalesce(array_agg(pt.topic_id order by pt.topic_id), '{}'::bigint[]) into topic_ids
  from public.post_topics pt where pt.post_id = post_row.id;
  select b.id into batch_id from public.ai_task_batches b
  where b.task_type = 'classification' and b.status in ('queued', 'running', 'paused')
  for update;
  if batch_id is null then
    select c.model into model_name from public.ai_model_configs c where c.purpose = 'classification';
    insert into public.ai_task_batches(task_type, status, config_snapshot)
    values ('classification', 'running', jsonb_build_object('model', coalesce(model_name, 'deepseek-chat')))
    returning id into batch_id;
  end if;
  insert into public.ai_task_items(batch_id, post_id, content_hash, taxonomy_snapshot)
  values (batch_id, post_row.id, md5(coalesce(post_row.title, '') || E'\n' || coalesce(post_row.body, '')),
    jsonb_build_object('tagId', post_row.tag_id, 'topicIds', to_jsonb(topic_ids)))
  on conflict (batch_id, post_id) do nothing
  returning id into item_id;
  if item_id is not null then
    update public.ai_task_batches set total_count = total_count + 1, completed_at = null, updated_at = now()
    where id = batch_id;
  end if;
  return jsonb_build_object('queued', item_id is not null, 'batchId', batch_id, 'itemId', item_id);
end;
$$;

create or replace function public.claim_ai_task_item(p_batch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare batch_row public.ai_task_batches%rowtype; item_row public.ai_task_items%rowtype; post_row record;
begin
  for batch_row in
    select * from public.ai_task_batches b
    where b.status = 'running' and (p_batch_id is null or b.id = p_batch_id)
    order by b.created_at
    for update skip locked
  loop
    update public.ai_task_items i set status = 'pending', updated_at = now(), error_message = '工作进程中断，已恢复待处理'
    where i.batch_id = batch_row.id and i.status = 'processing' and i.updated_at < now() - interval '2 minutes';
    if exists (select 1 from public.ai_task_items i where i.batch_id = batch_row.id and i.status = 'processing') then continue; end if;
    select * into item_row from public.ai_task_items i
    where i.batch_id = batch_row.id and i.status in ('pending', 'failed') and i.attempts < 3
    order by i.created_at for update skip locked limit 1;
    if not found then
      update public.ai_task_batches set status = 'completed', completed_at = now(), current_post_id = null, updated_at = now()
      where id = batch_row.id and not exists (select 1 from public.ai_task_items i where i.batch_id = batch_row.id and i.status in ('pending', 'processing'));
      continue;
    end if;
    select p.id, p.title, p.body, p.channel, p.status into post_row from public.posts p where p.id = item_row.post_id;
    if not found then
      update public.ai_task_items set status = 'skipped', completed_at = now(), updated_at = now(), error_message = '作品已删除或不可用' where id = item_row.id;
      continue;
    end if;
    item_row.content_hash := md5(coalesce(post_row.title, '') || E'\n' || coalesce(post_row.body, ''));
    update public.ai_task_items set status = 'processing', content_hash = item_row.content_hash,
      attempts = attempts + 1, started_at = now(), updated_at = now(), error_message = null
    where id = item_row.id returning * into item_row;
    update public.ai_task_batches set current_post_id = post_row.id, started_at = coalesce(started_at, now()), updated_at = now() where id = batch_row.id;
    return jsonb_build_object('batchId', batch_row.id, 'itemId', item_row.id, 'postId', post_row.id, 'title', post_row.title,
      'body', post_row.body, 'channel', post_row.channel, 'postStatus', post_row.status, 'taskType', batch_row.task_type,
      'contentHash', item_row.content_hash, 'taxonomySnapshot', item_row.taxonomy_snapshot, 'config', batch_row.config_snapshot);
  end loop;
  return null;
end;
$$;

create or replace function public.finish_ai_task_item(
  p_item_id uuid, p_status text, p_result jsonb default null, p_error text default null,
  p_model text default 'deepseek-chat', p_input_tokens integer default 0, p_output_tokens integer default 0,
  p_elapsed_ms integer default 0, p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_row public.ai_task_items%rowtype; batch_row public.ai_task_batches%rowtype; purpose_value text;
  post_row public.posts%rowtype; expected_tag_id bigint; expected_topic_ids bigint[]; current_topic_ids bigint[];
  category_id bigint; suggested_ids bigint[]; merged_ids bigint[]; allowed_count integer;
begin
  if p_status not in ('completed', 'review', 'failed', 'skipped') then raise exception 'invalid AI task item status'; end if;
  select * into item_row from public.ai_task_items where id = p_item_id for update;
  if not found or item_row.status <> 'processing' then return; end if;
  select * into batch_row from public.ai_task_batches where id = item_row.batch_id for update;
  if batch_row.status = 'cancelled' then
    p_status := 'skipped';
    p_result := jsonb_build_object('reason', '批量任务已中止，本次在途结果未应用到作品');
    p_error := '批量任务已中止';
  end if;
  if batch_row.task_type in ('summary_all', 'summary_incremental') then
    purpose_value := 'summary';
    if p_status = 'completed' and coalesce(p_result->>'summary', '') <> '' and item_row.post_id is not null then
      insert into public.ai_post_summaries(post_id, content_hash, summary, model, task_item_id, generated_at)
      values (item_row.post_id, item_row.content_hash, p_result->>'summary', p_model, item_row.id, now())
      on conflict (post_id) do update set content_hash = excluded.content_hash, summary = excluded.summary,
        model = excluded.model, task_item_id = excluded.task_item_id, generated_at = excluded.generated_at;
    end if;
  elsif batch_row.task_type = 'classification' then
    purpose_value := 'classification';
    if p_status = 'completed' and item_row.post_id is not null then
      select * into post_row from public.posts p where p.id = item_row.post_id for update;
      if not found or post_row.status not in ('pending_review', 'published')
        or md5(coalesce(post_row.title, '') || E'\n' || coalesce(post_row.body, '')) is distinct from item_row.content_hash then
        p_status := 'skipped';
        p_result := coalesce(p_result, '{}'::jsonb) || jsonb_build_object('applied', false, 'applyReason', '作品内容或状态已变化，保留现有分类');
      else
        expected_tag_id := nullif(item_row.taxonomy_snapshot->>'tagId', '')::bigint;
        select coalesce(array_agg(value::bigint order by value::bigint), '{}'::bigint[]) into expected_topic_ids
        from jsonb_array_elements_text(coalesce(item_row.taxonomy_snapshot->'topicIds', '[]'::jsonb)) as value;
        select coalesce(array_agg(pt.topic_id order by pt.topic_id), '{}'::bigint[]) into current_topic_ids
        from public.post_topics pt where pt.post_id = post_row.id;
        if post_row.tag_id is distinct from expected_tag_id or current_topic_ids is distinct from expected_topic_ids then
          p_status := 'skipped';
          p_result := coalesce(p_result, '{}'::jsonb) || jsonb_build_object('applied', false, 'applyReason', '人工已调整分类或标签，保留人工结果');
        else
          category_id := nullif(p_result->>'categoryId', '')::bigint;
          select coalesce(array_agg(value::bigint order by value::bigint), '{}'::bigint[]) into suggested_ids
          from jsonb_array_elements_text(coalesce(p_result->'tagIds', '[]'::jsonb)) as value;
          if category_id is null or jsonb_typeof(p_result->'tagIds') <> 'array' or cardinality(suggested_ids) > 5
            or cardinality(suggested_ids) <> (select count(distinct value) from unnest(suggested_ids) as value) then
            p_status := 'failed';
            p_error := 'AI 分类结果未通过服务端格式校验';
            p_result := coalesce(p_result, '{}'::jsonb) || jsonb_build_object('applied', false, 'applyReason', p_error);
          else
            select count(*) into allowed_count from public.interest_tags t
            where t.id = category_id and t.channel = post_row.channel and t.kind = 'category'
              and t.active and t.moderation_status = 'approved' and t.merged_into_id is null;
            if allowed_count <> 1 then
              p_status := 'failed';
              p_error := 'AI 返回了当前频道中不可用的分类';
              p_result := p_result || jsonb_build_object('applied', false, 'applyReason', p_error);
            else
              select count(*) into allowed_count from public.interest_tags t
              where t.id = any(suggested_ids) and t.channel = post_row.channel and t.kind = 'tag'
                and t.active and t.moderation_status = 'approved' and t.merged_into_id is null;
              if allowed_count <> cardinality(suggested_ids) then
                p_status := 'failed';
                p_error := 'AI 返回了未审核或已停用的标签';
                p_result := p_result || jsonb_build_object('applied', false, 'applyReason', p_error);
              else
                select coalesce(array_agg(id order by first_seen), '{}'::bigint[]) into merged_ids from (
                  select id, min(first_seen) as first_seen from (
                    select value as id, ordinality as first_seen from unnest(current_topic_ids || suggested_ids) with ordinality as current(value, ordinality)
                  ) ordered_topics group by id
                ) unique_topics where first_seen <= 5;
                update public.posts set tag_id = category_id, updated_at = now() where id = post_row.id;
                delete from public.post_topics where post_id = post_row.id;
                insert into public.post_topics(post_id, topic_id) select post_row.id, unnest(merged_ids);
                p_result := p_result || jsonb_build_object('applied', true, 'applyReason', '仅使用已审核目录；原有人工标签已保留');
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
  else
    purpose_value := 'review';
    if p_status = 'completed' and p_result->>'decision' = 'approve' and item_row.post_id is not null then
      update public.posts set status = 'published', moderation_review_note = 'AI 审核自动通过：低风险判断；仍保留管理员人工控制', moderation_reviewed_at = now(), updated_at = now()
      where id = item_row.post_id and status = 'pending_review'
        and md5(coalesce(title, '') || E'\n' || coalesce(body, '')) is not distinct from item_row.content_hash;
      if found then
        insert into public.moderation_audit_logs(actor_id, action, target_type, target_id, reason, details)
        values (null, 'ai_review_auto_approved', 'post', item_row.post_id::text, 'AI 判断为明确低风险并自动进入发布流程', jsonb_build_object('task_id', batch_row.id, 'task_item_id', item_row.id, 'model', p_model));
      else
        p_status := 'skipped';
        p_result := coalesce(p_result, '{}'::jsonb) || jsonb_build_object('decision', 'review', 'reason', '作品内容或审核状态已变化，未自动通过');
      end if;
    end if;
  end if;
  update public.ai_task_items set status = p_status,
    result_history = case when result is not null and p_result is not null
      then result_history || jsonb_build_array(jsonb_build_object('result', result, 'model', batch_row.config_snapshot->>'model', 'status', status, 'recorded_at', now()))
      else result_history end,
    result = coalesce(p_result, result), error_message = p_error,
    input_tokens = greatest(0, p_input_tokens), output_tokens = greatest(0, p_output_tokens), elapsed_ms = greatest(0, p_elapsed_ms),
    completed_at = now(), updated_at = now() where id = p_item_id returning * into item_row;
  update public.ai_task_batches b set
    completed_count = (select count(*)::integer from public.ai_task_items i where i.batch_id = b.id and i.status in ('completed', 'skipped')),
    review_count = (select count(*)::integer from public.ai_task_items i where i.batch_id = b.id and i.status = 'review'),
    failed_count = (select count(*)::integer from public.ai_task_items i where i.batch_id = b.id and i.status = 'failed'),
    current_post_id = null, updated_at = now()
  where b.id = batch_row.id;
  if not exists (select 1 from public.ai_task_items i where i.batch_id = batch_row.id and i.status in ('pending', 'processing')) then
    update public.ai_task_batches set status = 'completed', completed_at = now(), updated_at = now()
    where id = batch_row.id and status = 'running';
  end if;
end;
$$;

create or replace function public.apply_ai_review_decision(
  p_batch_id uuid, p_item_id uuid, p_actor_id uuid, p_decision text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare item_row public.ai_task_items%rowtype; batch_row public.ai_task_batches%rowtype; updated_post public.posts%rowtype;
begin
  if p_decision not in ('published', 'hidden') or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'invalid review decision';
  end if;
  select * into item_row from public.ai_task_items where id = p_item_id and batch_id = p_batch_id for update;
  if not found or item_row.status <> 'review' or item_row.post_id is null then raise exception 'review item already handled'; end if;
  select * into batch_row from public.ai_task_batches where id = p_batch_id for update;
  if not found or batch_row.task_type <> 'review_pending' then raise exception 'review batch unavailable'; end if;
  update public.posts set status = p_decision, moderation_review_note = btrim(p_reason), moderation_reviewed_by = p_actor_id,
    moderation_reviewed_at = now(), updated_at = now()
  where id = item_row.post_id and status = 'pending_review'
  returning * into updated_post;
  if not found then raise exception 'post status changed'; end if;
  insert into public.ai_review_decisions(task_item_id, post_id, actor_id, decision, reason)
  values (item_row.id, item_row.post_id, p_actor_id, p_decision, btrim(p_reason));
  insert into public.moderation_audit_logs(actor_id, action, target_type, target_id, reason, details)
  values (p_actor_id, case when p_decision = 'published' then 'ai_review_manual_approved' else 'ai_review_manual_rejected' end,
    'post', item_row.post_id::text, btrim(p_reason), jsonb_build_object('task_id', p_batch_id, 'task_item_id', item_row.id));
  update public.ai_task_items set status = 'completed',
    result = coalesce(result, '{}'::jsonb) || jsonb_build_object('manualDecision', p_decision, 'manualReason', btrim(p_reason)),
    completed_at = now(), updated_at = now()
  where id = item_row.id;
  update public.ai_task_batches b set
    completed_count = (select count(*)::integer from public.ai_task_items i where i.batch_id = b.id and i.status in ('completed', 'skipped')),
    review_count = (select count(*)::integer from public.ai_task_items i where i.batch_id = b.id and i.status = 'review'),
    failed_count = (select count(*)::integer from public.ai_task_items i where i.batch_id = b.id and i.status = 'failed'),
    current_post_id = null,
    status = case when b.status in ('queued', 'running', 'paused') and not exists (
      select 1 from public.ai_task_items i where i.batch_id = b.id and i.status in ('pending', 'processing')
    ) then 'completed' else b.status end,
    completed_at = case when b.status in ('queued', 'running', 'paused') and not exists (
      select 1 from public.ai_task_items i where i.batch_id = b.id and i.status in ('pending', 'processing')
    ) then now() else b.completed_at end,
    updated_at = now()
  where b.id = p_batch_id;
  return jsonb_build_object('postId', item_row.post_id, 'status', updated_post.status);
end;
$$;

revoke all on function public.enqueue_ai_summary_items(uuid, boolean) from public, anon, authenticated;
revoke all on function public.enqueue_ai_review_items(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_ai_classification_for_post(uuid) from public, anon, authenticated;
revoke all on function public.claim_ai_task_item(uuid) from public, anon, authenticated;
revoke all on function public.finish_ai_task_item(uuid, text, jsonb, text, text, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.enqueue_ai_summary_items(uuid, boolean) to service_role;
grant execute on function public.enqueue_ai_review_items(uuid) to service_role;
grant execute on function public.enqueue_ai_classification_for_post(uuid) to service_role;
grant execute on function public.claim_ai_task_item(uuid) to service_role;
grant execute on function public.finish_ai_task_item(uuid, text, jsonb, text, text, integer, integer, integer, text) to service_role;
revoke all on function public.apply_ai_review_decision(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_ai_review_decision(uuid, uuid, uuid, text, text) to service_role;

create or replace function public.get_ai_estimated_costs(p_from timestamptz default null, p_until timestamptz default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with selected as materialized (
    select estimated_cost, currency from public.ai_usage_events
    where (p_from is null or created_at >= p_from) and (p_until is null or created_at < p_until)
  )
  select case
    when exists(select 1 from selected where estimated_cost is null) then null
    else coalesce((select jsonb_object_agg(currency, amount) from (
      select currency, sum(estimated_cost)::numeric as amount from selected group by currency
    ) by_currency), '{}'::jsonb)
  end;
$$;
revoke all on function public.get_ai_estimated_costs(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.get_ai_resource_summary()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with bounds as (
    select date_trunc('day', now()) as today, date_trunc('day', now()) - interval '1 day' as yesterday,
      date_trunc('day', now()) - interval '6 days' as week_start, date_trunc('day', now()) - interval '29 days' as month_start
  ), daily as (
    select date_trunc('day', e.created_at) as day, sum(e.total_tokens)::bigint as tokens,
      public.get_ai_estimated_costs(date_trunc('day', e.created_at), date_trunc('day', e.created_at) + interval '1 day') as costs,
      count(*)::bigint as requests
    from public.ai_usage_events e, bounds b where e.created_at >= b.month_start
    group by date_trunc('day', e.created_at)
  ), purpose as (
    select e.purpose, sum(e.input_tokens)::bigint as input_tokens, sum(e.output_tokens)::bigint as output_tokens,
      sum(e.total_tokens)::bigint as total_tokens, count(*)::bigint as requests
    from public.ai_usage_events e group by e.purpose
  ), model as (
    select e.model, sum(e.total_tokens)::bigint as total_tokens, count(*)::bigint as requests
    from public.ai_usage_events e group by e.model
  ), recent as (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) as rows from (
      select request_id, task_id, task_item_id, purpose, model, status, elapsed_ms, input_tokens, output_tokens,
        output_tokens_per_second, total_tokens, cache_hit_tokens, estimated_cost, currency, price_version, error_code, created_at
      from public.ai_usage_events order by created_at desc limit 50
    ) r
  )
  select jsonb_build_object(
    'periods', jsonb_build_object(
      'today', jsonb_build_object('tokens', coalesce(sum(e.total_tokens) filter (where e.created_at >= b.today), 0), 'costs', public.get_ai_estimated_costs(b.today, b.today + interval '1 day'), 'requests', count(e.id) filter (where e.created_at >= b.today)),
      'yesterday', jsonb_build_object('tokens', coalesce(sum(e.total_tokens) filter (where e.created_at >= b.yesterday and e.created_at < b.today), 0), 'costs', public.get_ai_estimated_costs(b.yesterday, b.today), 'requests', count(e.id) filter (where e.created_at >= b.yesterday and e.created_at < b.today)),
      'sevenDays', jsonb_build_object('tokens', coalesce(sum(e.total_tokens) filter (where e.created_at >= b.week_start), 0), 'costs', public.get_ai_estimated_costs(b.week_start, null), 'requests', count(e.id) filter (where e.created_at >= b.week_start)),
      'thirtyDays', jsonb_build_object('tokens', coalesce(sum(e.total_tokens) filter (where e.created_at >= b.month_start), 0), 'costs', public.get_ai_estimated_costs(b.month_start, null), 'requests', count(e.id) filter (where e.created_at >= b.month_start)),
      'allTime', jsonb_build_object('tokens', coalesce(sum(e.total_tokens), 0), 'costs', public.get_ai_estimated_costs(null, null), 'requests', count(e.id), 'success', count(e.id) filter (where e.status = 'success'), 'failure', count(e.id) filter (where e.status = 'failure'))
    ),
    'daily', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'::jsonb) from daily d),
    'purpose', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from purpose p),
    'model', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from model m),
    'recent', (select rows from recent),
    'pricingConfigured', exists(select 1 from public.ai_usage_events where estimated_cost is not null)
  )
  from bounds b left join public.ai_usage_events e on true
  group by b.today, b.yesterday, b.week_start, b.month_start;
$$;
revoke all on function public.get_ai_resource_summary() from public, anon, authenticated;
grant execute on function public.get_ai_resource_summary() to service_role;

create or replace function public.get_ai_task_usage(p_batch_ids uuid[])
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with selected as materialized (
    select e.task_id, e.input_tokens, e.output_tokens, e.total_tokens, e.estimated_cost, e.currency
    from public.ai_usage_events e where e.task_id = any(coalesce(p_batch_ids, '{}'::uuid[]))
  ), totals as (
    select task_id, sum(input_tokens)::bigint as input_tokens, sum(output_tokens)::bigint as output_tokens,
      sum(total_tokens)::bigint as total_tokens, count(*)::bigint as requests,
      bool_or(estimated_cost is null) as cost_incomplete
    from selected group by task_id
  ), costs as (
    select task_id, jsonb_object_agg(currency, amount) as cost_map from (
      select task_id, currency, sum(estimated_cost)::numeric as amount from selected
      where estimated_cost is not null and currency is not null group by task_id, currency
    ) grouped group by task_id
  )
  select coalesce(jsonb_object_agg(t.task_id::text, jsonb_build_object(
    'inputTokens', t.input_tokens, 'outputTokens', t.output_tokens, 'totalTokens', t.total_tokens,
    'requests', t.requests, 'costs', case when t.cost_incomplete then null else coalesce(c.cost_map, '{}'::jsonb) end
  )), '{}'::jsonb)
  from totals t left join costs c on c.task_id = t.task_id;
$$;
revoke all on function public.get_ai_task_usage(uuid[]) from public, anon, authenticated;
grant execute on function public.get_ai_task_usage(uuid[]) to service_role;
