-- Keep the private collection UUID out of anonymous/public bookmark reads.
revoke select on table public.bookmarks from anon, authenticated;
grant select (user_id, post_id, created_at) on public.bookmarks to anon;
grant select (user_id, post_id, created_at, collection_id) on public.bookmarks to authenticated;
