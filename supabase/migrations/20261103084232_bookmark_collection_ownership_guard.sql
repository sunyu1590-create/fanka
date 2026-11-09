drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      collection_id is null
      or exists (
        select 1 from public.bookmark_collections c
        where c.id = bookmarks.collection_id and c.user_id = bookmarks.user_id
      )
    )
  );
