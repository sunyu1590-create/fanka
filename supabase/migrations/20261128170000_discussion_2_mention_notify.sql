-- HEIKA Discussion 2.0 · @提及通知类型
-- 现状：app_notifications_notification_type_check 只允许
-- creator_post / topic_post / series_post / comment / reply / moderation / like / bookmark。
-- 而 heika_private.notify_comment_mentions() 写入 'mention'，插入会违反约束并抛错，
-- 连带导致整条带 @提及 的评论写入失败。这里只补充允许值，不改动既有数据。
alter table public.app_notifications drop constraint if exists app_notifications_notification_type_check;
alter table public.app_notifications
  add constraint app_notifications_notification_type_check
  check (
    notification_type = any (array[
      'creator_post'::text, 'topic_post'::text, 'series_post'::text, 'comment'::text,
      'reply'::text, 'moderation'::text, 'like'::text, 'bookmark'::text, 'mention'::text
    ])
  );

-- 提及通知需要按「评论 + 收件人」去重，重复 @ 同一人不产生多条。
create unique index if not exists app_notifications_mention_unique
  on public.app_notifications (comment_id, recipient_id)
  where notification_type = 'mention' and comment_id is not null;
