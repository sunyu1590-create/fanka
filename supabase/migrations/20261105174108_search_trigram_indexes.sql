create extension if not exists pg_trgm with schema extensions;

create index posts_published_title_trgm_idx on public.posts using gin (title extensions.gin_trgm_ops) where status = 'published';
create index posts_published_body_trgm_idx on public.posts using gin (body extensions.gin_trgm_ops) where status = 'published';
create index profiles_nickname_trgm_idx on public.profiles using gin (nickname extensions.gin_trgm_ops);
create index profiles_bio_trgm_idx on public.profiles using gin (bio extensions.gin_trgm_ops);
