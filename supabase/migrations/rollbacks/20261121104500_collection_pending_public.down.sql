-- 回滚 20261121104500_collection_pending_public.sql
alter table public.post_series drop column if exists pending_public;
alter table public.post_series drop column if exists pending_review_note;
