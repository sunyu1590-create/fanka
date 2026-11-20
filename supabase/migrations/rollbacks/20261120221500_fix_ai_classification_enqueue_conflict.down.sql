-- 回滚 20261120221500：恢复原始 enqueue_ai_classification_for_post（保留其历史行为）
-- 注意：回滚后「发布后自动分类」会重新出现 column reference "batch_id" is ambiguous 报错。
-- 仅在需要逐字节还原线上函数、便于对比排查时使用。

create or replace function public.enqueue_ai_classification_for_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;
