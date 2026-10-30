drop policy covers_read on storage.objects;
create policy covers_read on storage.objects for select using(bucket_id='post-covers' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.post_media m join public.posts p on p.id=m.post_id where m.storage_path=name and p.status='published')));
drop policy media_write on public.post_media;
create policy media_insert on public.post_media for insert to authenticated with check(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()) and split_part(storage_path,'/',1)=auth.uid()::text);
create policy media_delete on public.post_media for delete to authenticated using(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()));
