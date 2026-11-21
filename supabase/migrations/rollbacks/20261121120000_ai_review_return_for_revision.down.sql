-- 回滚：恢复到「只有通过 / 拒绝」两态，并把已产生的退回修改记录归并为拒绝。
update public.ai_review_decisions set decision = 'hidden' where decision = 'revision';

alter table public.ai_review_decisions
  drop constraint if exists ai_review_decisions_decision_check;

alter table public.ai_review_decisions
  add constraint ai_review_decisions_decision_check
  check (decision in ('published', 'hidden'));

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

revoke all on function public.apply_ai_review_decision(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_ai_review_decision(uuid, uuid, uuid, text, text) to service_role;
