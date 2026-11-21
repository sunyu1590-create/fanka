-- 人工复审新增「退回修改」结果：作品回到作者草稿箱，而不是直接隐藏。
-- 通过 / 退回修改 / 拒绝 三种结果都需要留痕，因此同步放宽 ai_review_decisions 的结果枚举。
alter table public.ai_review_decisions
  drop constraint if exists ai_review_decisions_decision_check;

alter table public.ai_review_decisions
  add constraint ai_review_decisions_decision_check
  check (decision in ('published', 'hidden', 'revision'));

create or replace function public.apply_ai_review_decision(
  p_batch_id uuid, p_item_id uuid, p_actor_id uuid, p_decision text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_row public.ai_task_items%rowtype;
  batch_row public.ai_task_batches%rowtype;
  updated_post public.posts%rowtype;
  target_status text;
begin
  if p_decision not in ('published', 'hidden', 'revision') or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'invalid review decision';
  end if;
  -- 退回修改：作品回到草稿箱，作者补充内容后可再次提交，不占用公开列表。
  target_status := case when p_decision = 'revision' then 'draft' else p_decision end;
  select * into item_row from public.ai_task_items where id = p_item_id and batch_id = p_batch_id for update;
  if not found or item_row.status <> 'review' or item_row.post_id is null then raise exception 'review item already handled'; end if;
  select * into batch_row from public.ai_task_batches where id = p_batch_id for update;
  if not found or batch_row.task_type <> 'review_pending' then raise exception 'review batch unavailable'; end if;
  update public.posts set status = target_status, moderation_review_note = btrim(p_reason), moderation_reviewed_by = p_actor_id,
    moderation_reviewed_at = now(), updated_at = now()
  where id = item_row.post_id and status = 'pending_review'
  returning * into updated_post;
  if not found then raise exception 'post status changed'; end if;
  insert into public.ai_review_decisions(task_item_id, post_id, actor_id, decision, reason)
  values (item_row.id, item_row.post_id, p_actor_id, p_decision, btrim(p_reason));
  insert into public.moderation_audit_logs(actor_id, action, target_type, target_id, reason, details)
  values (p_actor_id,
    case p_decision when 'published' then 'ai_review_manual_approved' when 'revision' then 'ai_review_manual_revision' else 'ai_review_manual_rejected' end,
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

revoke all on function public.apply_ai_review_decision(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_ai_review_decision(uuid, uuid, uuid, text, text) to service_role;
