-- 新发布作品自动进入 AI 初审：按作品入队 review_pending 任务，复用既有批次与 worker。
create or replace function public.enqueue_ai_review_for_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_batch uuid;
  v_item uuid;
  v_model text;
begin
  perform pg_advisory_xact_lock(hashtextextended('heika-ai-review-batch', 0));
  select * into v_post from public.posts p
  where p.id = p_post_id and p.status in ('pending_review', 'published') and p.is_demo = false;
  if not found then
    return jsonb_build_object('queued', false, 'reason', 'post_not_eligible');
  end if;

  select b.id into v_batch from public.ai_task_batches b
  where b.task_type = 'review_pending' and b.status in ('queued', 'running', 'paused')
  for update;
  if v_batch is null then
    select c.model into v_model from public.ai_model_configs c where c.purpose = 'review';
    insert into public.ai_task_batches(task_type, status, config_snapshot)
    values ('review_pending', 'running', jsonb_build_object('model', coalesce(v_model, 'deepseek-chat')))
    returning id into v_batch;
  end if;

  insert into public.ai_task_items(batch_id, post_id, content_hash)
  values (v_batch, v_post.id, md5(coalesce(v_post.title, '') || E'\n' || coalesce(v_post.body, '')))
  on conflict on constraint ai_task_items_batch_id_post_id_key do nothing
  returning id into v_item;

  if v_item is not null then
    update public.ai_task_batches set total_count = total_count + 1, completed_at = null, updated_at = now() where id = v_batch;
  end if;
  return jsonb_build_object('queued', v_item is not null, 'batchId', v_batch, 'itemId', v_item);
end;
$$;
revoke all on function public.enqueue_ai_review_for_post(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_ai_review_for_post(uuid) to service_role;
