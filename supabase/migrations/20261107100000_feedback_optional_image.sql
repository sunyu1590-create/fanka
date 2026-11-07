-- Optional private image attachments for user feedback.
alter table public.user_feedback add column if not exists attachment_path text
  check (attachment_path is null or attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}_[0-9a-f-]{36}[.](jpg|png|webp)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-feedback', 'user-feedback', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists user_feedback_media_insert on storage.objects;
create policy user_feedback_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'user-feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists user_feedback_media_read on storage.objects;
create policy user_feedback_media_read on storage.objects for select to authenticated
  using (bucket_id = 'user-feedback' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.has_staff_permission('reports.manage'))
  ));
drop policy if exists user_feedback_media_delete on storage.objects;
create policy user_feedback_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'user-feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);
