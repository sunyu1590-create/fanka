-- 人工复审「作品不可用」的根治：
-- ai_task_items.post_id 的外键是 ON DELETE SET NULL，作品被作者或管理员删除后，
-- 审核项仍然留在 status='review'，但 post_id 变成 NULL，既无法通过/驳回，也不会自动消失，
-- 于是在复审队列里长期显示为「作品不可用」。
--
-- 1) 触发器：作品删除时，把尚未处理的审核项直接关闭，避免产生新的僵尸记录。
-- 2) 一次性清理：把已经存在、确实没有关联作品的待复审记录关闭并写明原因。
-- 3) 重算受影响批次的 review_count，避免「待复审」数字虚高。

create or replace function public.close_ai_items_on_post_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- BEFORE DELETE 时审核项的 post_id 还没被置空，可以准确定位。
  update public.ai_task_items
     set status = 'skipped',
         error_message = '关联作品已被删除，审核项自动关闭',
         completed_at = now(),
         updated_at = now()
   where post_id = old.id
     and status in ('pending', 'processing', 'review');
  return old;
end;
$$;

drop trigger if exists trg_close_ai_items_on_post_delete on public.posts;
create trigger trg_close_ai_items_on_post_delete
  before delete on public.posts
  for each row execute function public.close_ai_items_on_post_delete();

-- 历史数据清理：只处理确实没有作品关联、且仍在等待处理的记录。
update public.ai_task_items
   set status = 'skipped',
       error_message = '关联作品已不存在（历史数据），审核项自动关闭',
       completed_at = now(),
       updated_at = now()
 where post_id is null
   and status in ('pending', 'processing', 'review');

update public.ai_task_batches b
   set review_count = coalesce((
         select count(*) from public.ai_task_items i
          where i.batch_id = b.id and i.status = 'review'
       ), 0),
       updated_at = now()
 where b.review_count <> coalesce((
         select count(*) from public.ai_task_items i
          where i.batch_id = b.id and i.status = 'review'
       ), 0);
