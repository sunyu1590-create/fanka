-- A sender can remove their own private chat attachments. Reading remains
-- limited to the two conversation participants by chat_image_read.
create policy chat_image_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'heika-chat'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and exists (
    select 1 from public.dm_conversations c
    where c.id::text = split_part(name, '/', 1)
      and (select auth.uid()) in (c.user_a, c.user_b)
  )
);
