-- Public profiles may opt in to showing their bookmarked published posts.
alter table public.profiles
  add column if not exists show_bookmarks boolean not null default false;

-- The public profile may read bookmark rows only after the owner has opted in.
create policy bookmarks_public_read
  on public.bookmarks for select to anon, authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = bookmarks.user_id
        and p.show_bookmarks = true
    )
  );

grant select on public.bookmarks to anon;
grant update(show_bookmarks) on public.profiles to authenticated;
