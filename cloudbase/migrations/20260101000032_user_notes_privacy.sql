-- Let each member hide their published notes, including their images, from
-- other members. The author and administrators retain access.
alter table public.profiles
  add column if not exists notes_private boolean not null default false;

grant update(notes_private) on public.profiles to authenticated;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
for select to anon, authenticated
using (
  author_id = (select auth.uid())
  or (select public.is_admin())
  or (
    status = 'published'
    and not coalesce((
      select p.notes_private from public.profiles p where p.id = posts.author_id
    ), false)
  )
);

drop policy if exists post_topics_read on public.post_topics;
create policy post_topics_read on public.post_topics
for select to anon, authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (
        p.author_id = (select auth.uid())
        or (select public.is_admin())
        or (
          p.status = 'published'
          and not coalesce((
            select profile.notes_private
            from public.profiles profile
            where profile.id = p.author_id
          ), false)
        )
      )
  )
);

drop policy if exists media_read on public.post_media;
create policy media_read on public.post_media
for select to anon, authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (
        p.author_id = (select auth.uid())
        or (select public.is_admin())
        or (
          p.status = 'published'
          and not coalesce((
            select profile.notes_private
            from public.profiles profile
            where profile.id = p.author_id
          ), false)
        )
      )
  )
);

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments
for select to anon, authenticated
using (
  author_id = (select auth.uid())
  or (select public.is_admin())
  or (
    status = 'visible'
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status = 'published'
        and not coalesce((
          select profile.notes_private
          from public.profiles profile
          where profile.id = p.author_id
        ), false)
    )
  )
);

drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'post-covers'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or exists (
      select 1
      from public.post_media m
      join public.posts p on p.id = m.post_id
      where m.storage_path = name
        and p.status = 'published'
        and not coalesce((
          select profile.notes_private
          from public.profiles profile
          where profile.id = p.author_id
        ), false)
    )
  )
);
