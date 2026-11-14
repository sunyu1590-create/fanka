-- Public downloads are needed for the discovery feed. Uploading and managing
-- files is restricted to authenticated administrators by storage RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'heika-ad-assets',
  'heika-ad-assets',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists heika_ad_assets_admin_read on storage.objects;
create policy heika_ad_assets_admin_read
  on storage.objects for select to authenticated
  using (bucket_id = 'heika-ad-assets' and public.is_admin());

drop policy if exists heika_ad_assets_admin_insert on storage.objects;
create policy heika_ad_assets_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'heika-ad-assets' and public.is_admin());

drop policy if exists heika_ad_assets_admin_delete on storage.objects;
create policy heika_ad_assets_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'heika-ad-assets' and public.is_admin());
