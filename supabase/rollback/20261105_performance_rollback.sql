-- Run only after rolling the application back to a build that does not use
-- body_excerpt, thumbnail_path, retina_thumbnail_path, or dm_inbox_summary().
-- This removes schema metadata and indexes only; it never deletes posts,
-- messages, or generated image objects from storage.

drop policy if exists covers_read_thumbnails on storage.objects;

drop function if exists public.dm_inbox_summary();

drop index if exists public.post_media_thumbnail_path_idx;
drop index if exists public.post_media_retina_thumbnail_path_idx;
drop index if exists public.posts_published_title_trgm_idx;
drop index if exists public.posts_published_body_trgm_idx;
drop index if exists public.profiles_nickname_trgm_idx;
drop index if exists public.profiles_bio_trgm_idx;

alter table public.post_media
  drop column if exists thumbnail_path,
  drop column if exists retina_thumbnail_path;

alter table public.posts drop column if exists body_excerpt;

-- pg_trgm is intentionally left installed. It may be shared by other schema
-- objects, and leaving the extension in place is safe and reversible.
