-- Published post fields and cover media are readable only to users who have
-- opened the post in one of their daily decks (or own the post / administer it).
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
for select to authenticated
using (
  author_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1
    from public.daily_cards c
    join public.daily_decks d on d.id = c.deck_id
    where c.post_id = posts.id
      and c.opened_at is not null
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists media_read on public.post_media;
create policy media_read on public.post_media
for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_media.post_id
      and (
        p.author_id = (select auth.uid())
        or (select public.is_admin())
        or exists (
          select 1
          from public.daily_cards c
          join public.daily_decks d on d.id = c.deck_id
          where c.post_id = p.id
            and c.opened_at is not null
            and d.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects
for select to authenticated
using (
  bucket_id = 'post-covers'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or exists (
      select 1
      from public.post_media m
      join public.daily_cards c on c.post_id = m.post_id and c.opened_at is not null
      join public.daily_decks d on d.id = c.deck_id
      where m.storage_path = name
        and d.user_id = (select auth.uid())
    )
  )
);
