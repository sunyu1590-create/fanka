-- HEIKA 创作与发布系统 2.0
-- 1) 发布任务增加幂等键与内容指纹：同一发布请求重试复用结果，不同内容拒绝复用。
-- 2) 放宽「每账号仅一份草稿」限制：允许连续创作形成多份独立草稿（本地草稿已由 IndexedDB 管理，
--    这里只解除云端草稿写入的多草稿阻塞，不删除任何历史草稿）。

-- publish_tasks 幂等字段（幂等键 = 一次正式发布请求的唯一标识）。
alter table public.publish_tasks add column if not exists idempotency_key text;
alter table public.publish_tasks add column if not exists content_hash text;
create unique index if not exists publish_tasks_user_idem
  on public.publish_tasks(user_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.publish_tasks.idempotency_key is '一次正式发布请求的幂等标识；重试复用，内容变化需换新键';
comment on column public.publish_tasks.content_hash is '创作内容快照的哈希，用于检测幂等键是否被复用到不同内容';

-- 解除单草稿限制：网页端本地草稿在 IndexedDB，云端草稿为发布中间态；
-- 允许多份独立草稿，避免出现「已有草稿就无法保存新作品」的问题。
drop index if exists public.posts_single_active_draft_per_author;
