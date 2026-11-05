create index post_media_thumbnail_path_idx on public.post_media(thumbnail_path) where thumbnail_path is not null;
create index post_media_retina_thumbnail_path_idx on public.post_media(retina_thumbnail_path) where retina_thumbnail_path is not null;
