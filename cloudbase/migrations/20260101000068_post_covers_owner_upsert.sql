-- Storage upsert needs UPDATE in addition to INSERT and SELECT. Keep replacement
-- scoped to the authenticated user's own post-covers folder.
drop policy if exists covers_update on storage.objects;
create policy covers_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'post-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'post-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
