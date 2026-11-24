-- 回滚 media_integrity_and_tracking
drop policy if exists system_alerts_admin_all on public.system_alerts;
drop table if exists public.system_alerts;
drop policy if exists system_metrics_admin_read on public.system_metrics;
drop table if exists public.system_metrics;
drop policy if exists publish_tasks_staff_read on public.publish_tasks;
drop policy if exists publish_tasks_owner_all on public.publish_tasks;
drop table if exists public.publish_tasks;
drop policy if exists upload_tasks_staff_read on public.upload_tasks;
drop policy if exists upload_tasks_owner_all on public.upload_tasks;
drop table if exists public.upload_tasks;
drop policy if exists media_assets_staff_read on public.media_assets;
drop policy if exists media_assets_owner_all on public.media_assets;
drop table if exists public.media_assets;

drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects for select using(bucket_id='post-covers' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.post_media m join public.posts p on p.id=m.post_id where m.storage_path=name and p.status='published')));
