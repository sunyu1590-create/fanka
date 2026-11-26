-- AI 作品版本更新：自动审核（无人工介入）
--
-- 背景：已发布的 AI 作品修改后写入 post_revisions(status=pending)，原流程依赖管理员
-- 在后台逐条通过，实际造成版本长期积压。本迁移引入独立的任务表与状态机：
--   queued → running → approved / rejected / error / superseded
-- 审核通过由数据库函数原子地应用新版本（同一 posts 行，统计与互动数据天然继承）；
-- 审核异常进入重试，绝不放行、也不判定为违规。
--
-- 幂等与并发：
--   * (revision_id, payload_hash) 唯一：同一份内容重复提交不会重复审核、重复计费。
--   * claim 使用 for update skip locked，多 worker 不会抢同一任务。
--   * 应用前校验 revision 内容哈希与线上内容哈希，旧任务不会覆盖新版本。

create table if not exists public.ai_revision_reviews (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  revision_id uuid not null references public.post_revisions(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'approved', 'rejected', 'error', 'superseded')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  payload_hash text not null,
  base_hash text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  changed_fields text[] not null default '{}',
  decision jsonb check (decision is null or jsonb_typeof(decision) = 'object'),
  verdict text check (verdict is null or verdict in ('approve', 'reject')),
  reason text,
  suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(suggestions) = 'array'),
  risk_level text,
  risk_types text[] not null default '{}',
  model text,
  policy_version text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  elapsed_ms integer not null default 0 check (elapsed_ms >= 0),
  error_message text,
  worker text,
  locked_at timestamptz,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revision_id, payload_hash)
);
create index if not exists ai_revision_reviews_queue_idx on public.ai_revision_reviews(status, created_at);
create index if not exists ai_revision_reviews_post_idx on public.ai_revision_reviews(post_id, created_at desc);
create index if not exists ai_revision_reviews_recent_idx on public.ai_revision_reviews(created_at desc);

alter table public.ai_revision_reviews enable row level security;
revoke all on public.ai_revision_reviews from public, anon;
grant select on public.ai_revision_reviews to authenticated;

create policy ai_revision_reviews_staff_read on public.ai_revision_reviews for select to authenticated
  using ((select public.has_staff_permission('ai.read')) or author_id = (select auth.uid()));

-- 内容指纹：标题 / 正文 / 分类 / 资源字段。用于判断「审核期间线上内容是否被别的写入改过」。
create or replace function heika_private.ai_post_hash(p_title text, p_body text, p_tag_id bigint, p_resource jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
  select md5(
    coalesce(p_title, '') || E'\n' || coalesce(p_body, '') || E'\n'
    || coalesce(p_tag_id::text, '') || E'\n' || coalesce(p_resource::text, '{}')
  )
$$;
revoke all on function heika_private.ai_post_hash(text, text, bigint, jsonb) from public, anon, authenticated;

-- 差异字段：只用于管理后台展示与模型上下文，不参与判定逻辑。
create or replace function heika_private.ai_payload_changed_fields(p_next jsonb, p_post public.posts)
returns text[] language plpgsql stable security invoker set search_path = '' as $$
declare fields text[] := '{}';
begin
  if coalesce(p_next->>'title', '') is distinct from coalesce(p_post.title, '') then fields := array_append(fields, 'title'); end if;
  if coalesce(p_next->>'body', '') is distinct from coalesce(p_post.body, '') then fields := array_append(fields, 'body'); end if;
  if coalesce(p_next->>'tag', '') is distinct from coalesce((select t.name from public.interest_tags t where t.id = p_post.tag_id), '') then fields := array_append(fields, 'category'); end if;
  if coalesce(p_next->>'contentType', '') is distinct from coalesce(p_post.content_type, '') then fields := array_append(fields, 'contentType'); end if;
  if coalesce(p_next->'resourceData', '{}'::jsonb) is distinct from coalesce(p_post.resource_data, '{}'::jsonb) then fields := array_append(fields, 'resourceData'); end if;
  if coalesce(p_next->'mediaPaths', '[]'::jsonb) is distinct from coalesce((select jsonb_agg(m.storage_path order by m.sort_order) from public.post_media m where m.post_id = p_post.id), '[]'::jsonb) then fields := array_append(fields, 'media'); end if;
  if coalesce(p_next->'topics', '[]'::jsonb) is distinct from coalesce((select jsonb_agg(t.name order by t.name) from public.post_topics pt join public.interest_tags t on t.id = pt.topic_id where pt.post_id = p_post.id), '[]'::jsonb) then fields := array_append(fields, 'topics'); end if;
  return fields;
end
$$;
revoke all on function heika_private.ai_payload_changed_fields(jsonb, public.posts) from public, anon, authenticated;

-- 入队：由提交接口在写入 post_revisions 之后调用。
-- 同一 revision + 同一 payload 只会有一条任务；payload 变化时旧任务标记 superseded。
create or replace function public.enqueue_ai_revision_review(p_post_id uuid, p_revision_id uuid, p_author_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_hash text;
  v_base text;
  v_job public.ai_revision_reviews%rowtype;
  v_changed text[];
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('queued', false, 'reason', 'payload_invalid');
  end if;
  select * into v_post from public.posts where id = p_post_id;
  if not found or v_post.channel <> 'ai' or v_post.status <> 'published' or v_post.author_id <> p_author_id then
    return jsonb_build_object('queued', false, 'reason', 'post_not_eligible');
  end if;
  select * into v_revision from public.post_revisions where id = p_revision_id and post_id = p_post_id and author_id = p_author_id;
  if not found or v_revision.status <> 'pending' then
    return jsonb_build_object('queued', false, 'reason', 'revision_not_pending');
  end if;

  v_hash := md5(p_payload::text);
  v_base := heika_private.ai_post_hash(v_post.title, v_post.body, v_post.tag_id, v_post.resource_data);
  v_changed := heika_private.ai_payload_changed_fields(p_payload, v_post);

  -- 同一作品更早的未完成任务：内容已变，直接作废，避免旧版本覆盖新版本。
  update public.ai_revision_reviews
    set status = 'superseded', finished_at = now(), updated_at = now()
    where post_id = p_post_id and status in ('queued', 'running') and payload_hash <> v_hash;

  insert into public.ai_revision_reviews(post_id, revision_id, author_id, payload_hash, base_hash, payload, changed_fields)
  values (p_post_id, p_revision_id, p_author_id, v_hash, v_base, p_payload, v_changed)
  on conflict (revision_id, payload_hash) do update set
    -- 只有失败任务允许重新入队；已通过/已驳回保持原结论，重复提交不会重复消耗 Token。
    status = case when public.ai_revision_reviews.status = 'error' then 'queued' else public.ai_revision_reviews.status end,
    error_message = case when public.ai_revision_reviews.status = 'error' then null else public.ai_revision_reviews.error_message end,
    attempts = case when public.ai_revision_reviews.status = 'error' then 0 else public.ai_revision_reviews.attempts end,
    locked_at = null,
    available_at = now(),
    updated_at = now()
  returning * into v_job;

  return jsonb_build_object('queued', v_job.status in ('queued', 'running'), 'jobId', v_job.id, 'status', v_job.status, 'changedFields', v_job.changed_fields);
end
$$;
revoke all on function public.enqueue_ai_revision_review(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_ai_revision_review(uuid, uuid, uuid, jsonb) to service_role;

-- 取任务：queued 优先；running 超过 4 分钟未完成视为 worker 掉线，允许重新领取。
create or replace function public.claim_ai_revision_review(p_worker text default 'worker')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_job public.ai_revision_reviews%rowtype;
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_current_base text;
begin
  select * into v_job from public.ai_revision_reviews
    where (status = 'queued' and available_at <= now())
       or (status = 'running' and locked_at < now() - interval '4 minutes')
    order by created_at asc
    limit 1
    for update skip locked;
  if not found then return null; end if;

  if v_job.attempts >= v_job.max_attempts then
    update public.ai_revision_reviews
      set status = 'error', error_message = coalesce(error_message, '审核多次中断，已停止自动重试'), finished_at = now(), locked_at = null, updated_at = now()
      where id = v_job.id;
    return null;
  end if;

  update public.ai_revision_reviews
    set status = 'running', attempts = attempts + 1, locked_at = now(), worker = left(coalesce(p_worker, 'worker'), 80),
        started_at = coalesce(started_at, now()), updated_at = now()
    where id = v_job.id
    returning * into v_job;

  select * into v_post from public.posts where id = v_job.post_id;
  select * into v_revision from public.post_revisions where id = v_job.revision_id;
  if v_post.id is null or v_revision.id is null then
    update public.ai_revision_reviews set status = 'superseded', finished_at = now(), updated_at = now() where id = v_job.id;
    return null;
  end if;

  -- 提交后、领取前如果再没有新的提交，revision 内容与任务快照应完全一致。
  if md5(v_revision.payload::text) <> v_job.payload_hash or v_revision.status <> 'pending' or v_post.status <> 'published' then
    update public.ai_revision_reviews
      set status = 'superseded', finished_at = now(), updated_at = now(),
          decision = jsonb_build_object('reason', '提交内容或作品状态在审核前已变化')
      where id = v_job.id;
    return null;
  end if;

  v_current_base := heika_private.ai_post_hash(v_post.title, v_post.body, v_post.tag_id, v_post.resource_data);
  return jsonb_build_object(
    'jobId', v_job.id,
    'postId', v_job.post_id,
    'revisionId', v_job.revision_id,
    'attempts', v_job.attempts,
    'maxAttempts', v_job.max_attempts,
    'payload', v_job.payload,
    'changedFields', v_job.changed_fields,
    'baseHash', v_job.base_hash,
    'currentBaseHash', v_current_base,
    'base', jsonb_build_object(
      'title', v_post.title, 'body', v_post.body, 'contentType', v_post.content_type,
      'category', (select t.name from public.interest_tags t where t.id = v_post.tag_id),
      'resourceData', coalesce(v_post.resource_data, '{}'::jsonb),
      'topics', coalesce((select jsonb_agg(t.name order by t.name) from public.post_topics pt join public.interest_tags t on t.id = pt.topic_id where pt.post_id = v_post.id), '[]'::jsonb),
      'mediaCount', (select count(*) from public.post_media m where m.post_id = v_post.id)
    )
  );
end
$$;
revoke all on function public.claim_ai_revision_review(text) from public, anon, authenticated;
grant execute on function public.claim_ai_revision_review(text) to service_role;

-- 完成：approve 时原子应用新版本（同一 posts 行，点赞/收藏/评论/浏览/合集全部继承），
-- reject 时只写驳回结论并保留原版本公开。任何哈希不匹配都只标记 superseded，绝不覆盖。
create or replace function public.finish_ai_revision_review(p_job_id uuid, p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_job public.ai_revision_reviews%rowtype;
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_payload jsonb;
  v_verdict text;
  v_reason text;
  v_suggestions jsonb;
  v_target_tag bigint;
  v_target_type text;
  v_target_data jsonb;
  v_topic_names text[];
  v_media text[];
  v_scenarios text[];
  v_series uuid;
  v_applied boolean := false;
begin
  select * into v_job from public.ai_revision_reviews where id = p_job_id for update;
  if not found then raise exception '审核任务不存在'; end if;
  if v_job.status <> 'running' then
    return jsonb_build_object('applied', false, 'status', v_job.status);
  end if;

  v_verdict := lower(coalesce(p_outcome->>'decision', 'approve'));
  v_reason := left(coalesce(nullif(p_outcome->>'reason', ''), '正常内容默认通过'), 600);
  v_suggestions := case when jsonb_typeof(p_outcome->'suggestions') = 'array' then p_outcome->'suggestions' else '[]'::jsonb end;

  select * into v_post from public.posts where id = v_job.post_id for update;
  select * into v_revision from public.post_revisions where id = v_job.revision_id for update;

  if v_post.id is null or v_revision.id is null then
    update public.ai_revision_reviews set status = 'superseded', finished_at = now(), updated_at = now() where id = v_job.id;
    return jsonb_build_object('applied', false, 'status', 'superseded');
  end if;

  -- 提交了更新的版本：旧任务作废，不碰 revision（由新任务继续）。
  if md5(v_revision.payload::text) <> v_job.payload_hash then
    update public.ai_revision_reviews
      set status = 'superseded', finished_at = now(), updated_at = now(), decision = p_outcome,
          reason = '提交了更新的版本，本次审核结果作废'
      where id = v_job.id;
    return jsonb_build_object('applied', false, 'status', 'superseded');
  end if;

  if v_verdict = 'reject' then
    update public.post_revisions
      set status = 'rejected', review_note = v_reason, reviewed_at = now(), reviewed_by = null, updated_at = now()
      where id = v_revision.id and status = 'pending';
    update public.ai_revision_reviews
      set status = 'rejected', verdict = 'reject', reason = v_reason, suggestions = v_suggestions,
          decision = p_outcome, risk_level = p_outcome->>'riskLevel',
          risk_types = coalesce(array(select jsonb_array_elements_text(p_outcome->'riskTypes')), '{}'),
          model = p_outcome->>'model', policy_version = p_outcome->>'policyVersion',
          input_tokens = coalesce((p_outcome->>'inputTokens')::integer, 0),
          output_tokens = coalesce((p_outcome->>'outputTokens')::integer, 0),
          elapsed_ms = coalesce((p_outcome->>'elapsedMs')::integer, 0),
          finished_at = now(), locked_at = null, updated_at = now()
      where id = v_job.id;
    insert into public.moderation_audit_logs(actor_id, action, target_type, target_id, reason, details)
    values (null, 'ai_revision_auto_rejected', 'post', v_job.post_id::text, left(v_reason, 500),
      jsonb_build_object('job_id', v_job.id, 'risk_level', p_outcome->>'riskLevel', 'risk_types', p_outcome->'riskTypes', 'policy_version', p_outcome->>'policyVersion'));
    return jsonb_build_object('applied', false, 'status', 'rejected', 'reason', v_reason);
  end if;

  -- 线上内容在审核期间被其他写入改动（例如管理员下架/编辑）：不覆盖，要求重新提交。
  if v_post.status <> 'published' then
    update public.ai_revision_reviews
      set status = 'superseded', finished_at = now(), updated_at = now(), decision = p_outcome,
          reason = '作品状态在审核期间发生变化，本次修改未应用'
      where id = v_job.id;
    return jsonb_build_object('applied', false, 'status', 'superseded', 'reason', 'post_not_published');
  end if;
  if heika_private.ai_post_hash(v_post.title, v_post.body, v_post.tag_id, v_post.resource_data) <> v_job.base_hash then
    update public.post_revisions
      set status = 'rejected', review_note = '作品在审核期间发生了其他更新，请重新提交本次修改', reviewed_at = now(), reviewed_by = null, updated_at = now()
      where id = v_revision.id and status = 'pending';
    update public.ai_revision_reviews
      set status = 'superseded', finished_at = now(), updated_at = now(), decision = p_outcome,
          reason = '线上内容已变化，为避免覆盖较新的修改，本次结果未应用'
      where id = v_job.id;
    return jsonb_build_object('applied', false, 'status', 'superseded', 'reason', 'base_changed');
  end if;

  v_payload := v_job.payload;
  if char_length(btrim(coalesce(v_payload->>'title', ''))) not between 1 and 80
     or char_length(btrim(coalesce(v_payload->>'body', ''))) not between 1 and 5000 then
    raise exception '待应用内容无效';
  end if;
  v_target_type := coalesce(v_payload->>'contentType', 'knowledge_article');
  if v_target_type not in ('knowledge_article', 'agent', 'skill', 'prompt', 'ai_tool', 'tutorial') then
    raise exception 'AI 内容类型无效';
  end if;
  v_target_data := coalesce(v_payload->'resourceData', '{}'::jsonb);
  if jsonb_typeof(v_target_data) <> 'object' then raise exception 'AI 资源字段无效'; end if;
  select t.id into v_target_tag from public.interest_tags t
    where t.name = v_payload->>'tag' and t.channel = 'ai' and t.kind = 'category' and t.active and t.merged_into_id is null;
  if v_target_tag is null then raise exception 'AI 分类已失效'; end if;
  if jsonb_typeof(v_payload->'mediaPaths') is distinct from 'array' then raise exception '媒体列表无效'; end if;
  v_media := coalesce(array(select jsonb_array_elements_text(v_payload->'mediaPaths')), '{}');
  if cardinality(v_media) > 9
     or exists(select 1 from unnest(v_media) p where p !~ ('^' || v_revision.author_id::text || '/[^/]{1,280}$')) then
    raise exception '媒体路径无效';
  end if;
  if jsonb_typeof(v_payload->'topics') is distinct from 'array' then raise exception '标签列表无效'; end if;
  v_topic_names := coalesce(array(select jsonb_array_elements_text(v_payload->'topics')), '{}');
  if cardinality(v_topic_names) > 5
     or cardinality(v_topic_names) <> (select count(distinct value) from unnest(v_topic_names) value)
     or exists(
       select 1 from unnest(v_topic_names) n
       left join public.interest_tags t on t.name = n and t.channel = 'ai' and t.kind = 'tag' and t.active and t.moderation_status = 'approved'
       where t.id is null
     ) then
    raise exception 'AI 标签无效';
  end if;
  if jsonb_typeof(v_payload->'usageScenarios') = 'array' then
    v_scenarios := coalesce(array(select jsonb_array_elements_text(v_payload->'usageScenarios')), '{}');
  else
    v_scenarios := coalesce(v_post.usage_scenarios, '{}');
  end if;
  if jsonb_typeof(v_payload->'seriesId') = 'string' and (v_payload->>'seriesId') ~ '^[0-9a-f-]{36}$' then
    v_series := (v_payload->>'seriesId')::uuid;
  elsif v_payload ? 'seriesId' then
    v_series := null;
  else
    v_series := v_post.series_id;
  end if;

  update public.posts set
    title = btrim(v_payload->>'title'),
    body = btrim(v_payload->>'body'),
    tag_id = v_target_tag,
    content_type = v_target_type,
    resource_data = v_target_data,
    usage_scenarios = v_scenarios,
    series_id = v_series,
    image_url = nullif(v_payload->>'coverUrl', ''),
    moderation_review_note = 'AI 自动审核通过：' || left(v_reason, 400),
    moderation_reviewed_by = null,
    moderation_reviewed_at = now(),
    updated_at = now()
  where id = v_job.post_id;

  delete from public.post_media where post_id = v_job.post_id;
  insert into public.post_media(post_id, storage_path, sort_order)
    select v_job.post_id, value, (ordinality - 1)::integer
    from unnest(v_media) with ordinality as paths(value, ordinality);

  delete from public.post_topics where post_id = v_job.post_id;
  insert into public.post_topics(post_id, topic_id)
    select v_job.post_id, t.id from public.interest_tags t
    where t.name = any(v_topic_names) and t.channel = 'ai' and t.kind = 'tag' and t.active and t.moderation_status = 'approved';

  update public.post_revisions
    set status = 'approved', review_note = 'AI 自动审核通过：' || left(v_reason, 400), reviewed_at = now(), reviewed_by = null, updated_at = now()
    where id = v_revision.id and status = 'pending';

  update public.ai_revision_reviews
    set status = 'approved', verdict = 'approve', reason = v_reason, suggestions = '[]'::jsonb,
        decision = p_outcome, risk_level = p_outcome->>'riskLevel',
        risk_types = coalesce(array(select jsonb_array_elements_text(p_outcome->'riskTypes')), '{}'),
        model = p_outcome->>'model', policy_version = p_outcome->>'policyVersion',
        input_tokens = coalesce((p_outcome->>'inputTokens')::integer, 0),
        output_tokens = coalesce((p_outcome->>'outputTokens')::integer, 0),
        elapsed_ms = coalesce((p_outcome->>'elapsedMs')::integer, 0),
        finished_at = now(), locked_at = null, updated_at = now()
    where id = v_job.id;

  insert into public.moderation_audit_logs(actor_id, action, target_type, target_id, reason, details)
  values (null, 'ai_revision_auto_approved', 'post', v_job.post_id::text, left(v_reason, 500),
    jsonb_build_object('job_id', v_job.id, 'changed_fields', v_job.changed_fields, 'policy_version', p_outcome->>'policyVersion', 'degraded', p_outcome->'degraded'));

  v_applied := true;
  return jsonb_build_object('applied', v_applied, 'status', 'approved', 'jobId', v_job.id);
end
$$;
revoke all on function public.finish_ai_revision_review(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_ai_revision_review(uuid, jsonb) to service_role;

-- 失败：网络/格式错误只重试，不改变作品与版本状态；超过上限标记 error，用户端显示「审核异常」。
create or replace function public.fail_ai_revision_review(p_job_id uuid, p_error text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.ai_revision_reviews%rowtype;
begin
  select * into v_job from public.ai_revision_reviews where id = p_job_id for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if v_job.status <> 'running' then return jsonb_build_object('status', v_job.status); end if;
  if v_job.attempts < v_job.max_attempts then
    update public.ai_revision_reviews
      set status = 'queued', error_message = left(coalesce(p_error, '审核服务暂时不可用'), 500), locked_at = null,
          available_at = now() + make_interval(secs => least(300, 20 * v_job.attempts)), updated_at = now()
      where id = v_job.id;
    return jsonb_build_object('status', 'queued', 'attempts', v_job.attempts, 'maxAttempts', v_job.max_attempts);
  end if;
  update public.ai_revision_reviews
    set status = 'error', error_message = left(coalesce(p_error, '审核服务暂时不可用'), 500), finished_at = now(), locked_at = null, updated_at = now()
    where id = v_job.id;
  return jsonb_build_object('status', 'error', 'attempts', v_job.attempts, 'maxAttempts', v_job.max_attempts);
end
$$;
revoke all on function public.fail_ai_revision_review(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_ai_revision_review(uuid, text) to service_role;

-- 人工重试：只在审核服务异常时使用，不改变审核策略。
create or replace function public.retry_ai_revision_review(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.ai_revision_reviews%rowtype;
begin
  update public.ai_revision_reviews
    set status = 'queued', attempts = 0, error_message = null, locked_at = null, finished_at = null, available_at = now(), updated_at = now()
    where id = p_job_id and status in ('error', 'superseded')
    returning * into v_job;
  if v_job.id is null then return jsonb_build_object('requeued', false); end if;
  return jsonb_build_object('requeued', true, 'jobId', v_job.id);
end
$$;
revoke all on function public.retry_ai_revision_review(uuid) from public, anon, authenticated;
grant execute on function public.retry_ai_revision_review(uuid) to service_role;

-- 历史积压迁移：把已存在的 AI 版本待审记录接入自动审核队列。
-- 同一 payload 重复执行不会产生新任务。
do $$
declare v_count integer := 0;
begin
  with pending as (
    select r.id as revision_id, r.post_id, r.author_id, r.payload,
           md5(r.payload::text) as payload_hash,
           heika_private.ai_post_hash(p.title, p.body, p.tag_id, p.resource_data) as base_hash,
           heika_private.ai_payload_changed_fields(r.payload, p) as changed_fields
    from public.post_revisions r
    join public.posts p on p.id = r.post_id
    where r.status = 'pending' and p.channel = 'ai' and p.status = 'published'
  )
  insert into public.ai_revision_reviews(post_id, revision_id, author_id, payload_hash, base_hash, payload, changed_fields)
  select post_id, revision_id, author_id, payload_hash, base_hash, payload, changed_fields from pending
  on conflict (revision_id, payload_hash) do nothing;
  get diagnostics v_count = row_count;
  raise notice 'ai revision reviews backfilled: %', v_count;
end
$$;

-- 管理后台统计：真实计数（不做抽样或估算）。
create or replace function public.heika_admin_ai_review_stats(p_from timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_staff_permission('ai.read') then raise exception '没有 AI 审核读取权限'; end if;
  select jsonb_build_object(
    'total', count(*),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'error', count(*) filter (where status = 'error'),
    'pending', count(*) filter (where status in ('queued', 'running')),
    'superseded', count(*) filter (where status = 'superseded'),
    'avgElapsedMs', coalesce(round(avg(elapsed_ms) filter (where status in ('approved', 'rejected')))::integer, 0),
    'avgAttempts', coalesce(round(avg(attempts) filter (where status in ('approved', 'rejected')))::numeric(10, 2), 0),
    'tokens', coalesce(sum(input_tokens + output_tokens), 0),
    'asOf', now()
  ) into result
  from public.ai_revision_reviews
  where created_at >= p_from;
  return result;
end
$$;
revoke all on function public.heika_admin_ai_review_stats(timestamptz) from public, anon;
grant execute on function public.heika_admin_ai_review_stats(timestamptz) to authenticated;
