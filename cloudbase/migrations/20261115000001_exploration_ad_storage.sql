-- Publicly readable ad images; uploads and deletion remain administrator-only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('exploration-ads','exploration-ads',true,4194304,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=4194304,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists exploration_ad_images_admin_insert on storage.objects;
create policy exploration_ad_images_admin_insert on storage.objects for insert to authenticated
with check (bucket_id='exploration-ads' and (select public.is_admin()));

drop policy if exists exploration_ad_images_admin_delete on storage.objects;
create policy exploration_ad_images_admin_delete on storage.objects for delete to authenticated
using (bucket_id='exploration-ads' and (select public.is_admin()));
