-- 合集公开信息修改待审：线上版本保持可用，新信息进入 pending_public 等待 AI/人工审核。
alter table public.post_series add column if not exists pending_public jsonb;
alter table public.post_series add column if not exists pending_review_note text;

comment on column public.post_series.pending_public is '待审核的公开信息快照：title/description/cover_url/kind/channel/category_id';
