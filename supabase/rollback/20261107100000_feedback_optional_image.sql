-- Revoke attachment access but preserve stored files and submitted feedback.
drop policy if exists user_feedback_media_insert on storage.objects;
drop policy if exists user_feedback_media_read on storage.objects;
drop policy if exists user_feedback_media_delete on storage.objects;
update storage.buckets set public = false where id = 'user-feedback';
-- Keep attachment_path and bucket objects so rollback never destroys submitted data.
