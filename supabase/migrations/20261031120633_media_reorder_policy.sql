-- Permit the owner to change media order on their own post, including drafts.
create policy media_update on public.post_media for update to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
    and split_part(storage_path, '/', 1) = auth.uid()::text);
grant update on public.post_media to authenticated;
