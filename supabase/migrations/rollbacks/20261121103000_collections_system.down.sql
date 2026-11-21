-- 回滚 20261121103000_collections_system.sql
drop function if exists public.record_collection_progress(uuid, uuid);
drop trigger if exists post_series_touch_updated_at on public.post_series;
drop function if exists public.touch_post_series_updated_at();
drop table if exists public.collection_progress;
drop table if exists public.collection_follows;
drop index if exists public.posts_series_order_idx;
alter table public.posts drop column if exists series_order;
alter table public.post_series drop constraint if exists post_series_review_status_check;
alter table public.post_series drop constraint if exists post_series_status_check;
alter table public.post_series drop constraint if exists post_series_channel_check;
alter table public.post_series drop constraint if exists post_series_kind_check;
alter table public.post_series
  drop column if exists kind,
  drop column if exists cover_url,
  drop column if exists channel,
  drop column if exists category_id,
  drop column if exists status,
  drop column if exists is_public,
  drop column if exists review_status,
  drop column if exists review_note,
  drop column if exists updated_at;
