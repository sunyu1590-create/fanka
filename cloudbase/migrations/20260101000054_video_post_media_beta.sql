-- Private, owner-scoped storage for the video upload beta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-videos',
  'post-videos',
  false,
  104857600,
  array['video/mp4', 'video/webm']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists post_videos_insert on storage.objects;
create policy post_videos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists post_videos_read on storage.objects;
create policy post_videos_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'post-videos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1
        from public.post_media media
        join public.posts post on post.id = media.post_id
        where media.storage_path = objects.name
          and post.status = 'published'
          and not coalesce(
            (select profile.notes_private from public.profiles profile where profile.id = post.author_id),
            false
          )
      )
    )
  );

drop policy if exists post_videos_delete on storage.objects;
create policy post_videos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
