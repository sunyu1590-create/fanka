-- 修复 AI 自动分类入队函数：plpgsql 变量名与 ON CONFLICT 列名冲突
-- 症状：enqueue_ai_classification_for_post 抛 "column reference batch_id is ambiguous"，
--       接口层捕获后仅打印日志，导致「发布后自动分类 / 自动话题」从未真正入队。
-- 处理：把同名变量改为 v_ 前缀，逻辑与返回结构保持不变。

create or replace function public.enqueue_ai_classification_for_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_post_row public.posts%rowtype;
  v_batch_id uuid;
  v_item_id uuid;
  v_model_name text;
  v_topic_ids bigint[];
begin
  perform pg_advisory_xact_lock(hashtextextended('heika-ai-classification-batch', 0));
  select * into v_post_row from public.posts p
  where p.id = p_post_id
    and p.status in ('pending_review', 'published')
    and p.is_demo = false
    and p.channel in ('community', 'ai');
  if not found then
    return jsonb_build_object('queued', false, 'reason', 'post_not_eligible');
  end if;

  select coalesce(array_agg(pt.topic_id order by pt.topic_id), '{}'::bigint[]) into v_topic_ids
  from public.post_topics pt where pt.post_id = v_post_row.id;

  select b.id into v_batch_id from public.ai_task_batches b
  where b.task_type = 'classification' and b.status in ('queued', 'running', 'paused')
  for update;

  if v_batch_id is null then
    select c.model into v_model_name from public.ai_model_configs c where c.purpose = 'classification';
    insert into public.ai_task_batches(task_type, status, config_snapshot)
    values ('classification', 'running', jsonb_build_object('model', coalesce(v_model_name, 'deepseek-chat')))
    returning id into v_batch_id;
  end if;

  insert into public.ai_task_items(batch_id, post_id, content_hash, taxonomy_snapshot)
  values (
    v_batch_id,
    v_post_row.id,
    md5(coalesce(v_post_row.title, '') || E'\n' || coalesce(v_post_row.body, '')),
    jsonb_build_object('tagId', v_post_row.tag_id, 'topicIds', to_jsonb(v_topic_ids))
  )
  on conflict on constraint ai_task_items_batch_id_post_id_key do nothing
  returning id into v_item_id;

  if v_item_id is not null then
    update public.ai_task_batches
    set total_count = total_count + 1, completed_at = null, updated_at = now()
    where id = v_batch_id;
  end if;

  return jsonb_build_object('queued', v_item_id is not null, 'batchId', v_batch_id, 'itemId', v_item_id);
end;
$function$;
