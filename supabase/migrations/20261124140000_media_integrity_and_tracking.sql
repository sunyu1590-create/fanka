-- 媒体完整性与发布基础设施（2026.11.24 重构）
--
-- 1) covers_read：原策略只匹配 storage_path=name，变体（-480/-960.webp）永远签不出来，
--    非作者浏览已发布内容时缩略图/retina 全部被 RLS 拒绝。补上两列匹配。
-- 2) media_assets：staging 上传的正式登记表。上传时即写入缩略图路径、宽高、字节数、
--    校验和与验证状态；发布时「认领」进 post_media，从此不再出现「发布入库丢缩略图/尺寸」。
-- 3) upload_tasks：上传任务全链路追踪（客户端遥测 + 服务端事件），供媒体服务中心检索。
-- 4) publish_tasks：发布任务持久化（与客户端任务中心对齐，服务端状态为最终事实）。
-- 5) system_metrics / system_alerts：轻量监控采集与告警。

-- ============ 2. 媒体资产登记 ============
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null,
  storage_path text not null unique,
  thumbnail_path text,
  retina_thumbnail_path text,
  width integer,
  height integer,
  byte_size bigint,
  mime_type text,
  checksum_sha256 text,
  status text not null default 'verified',
  client_type text,
  client_version text,
  post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz
);
comment on column public.media_assets.status is 'uploading|verified|claimed|failed';
create unique index if not exists media_assets_user_upload on public.media_assets(user_id, upload_id);
create index if not exists media_assets_post on public.media_assets(post_id);
create index if not exists media_assets_status_created on public.media_assets(status, created_at desc);

alter table public.media_assets enable row level security;
drop policy if exists media_assets_owner_all on public.media_assets;
create policy media_assets_owner_all on public.media_assets for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists media_assets_staff_read on public.media_assets;
create policy media_assets_staff_read on public.media_assets for select to authenticated
  using (public.is_admin());

-- ============ 存储读取策略修复（需在 media_assets 之后） ============
drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects for select using(
  bucket_id='post-covers' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.is_admin()
    or exists(
      select 1 from public.post_media m
      join public.posts p on p.id=m.post_id
      where (m.storage_path=name or m.thumbnail_path=name or m.retina_thumbnail_path=name)
        and p.status='published'
    )
    or exists(
      select 1 from public.media_assets a
      where a.storage_path=name or a.thumbnail_path=name or a.retina_thumbnail_path=name
    )
  )
);


-- ============ 3. 上传任务追踪 ============
create table if not exists public.upload_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_key text not null,
  media_upload_id uuid,
  post_id uuid,
  file_name text,
  file_size bigint,
  mime_type text,
  client_type text,
  client_version text,
  status text not null default 'created',
  progress integer not null default 0,
  bytes_sent bigint not null default 0,
  attempts integer not null default 0,
  error_code text,
  error_message text,
  storage_path text,
  checksum_sha256 text,
  verify_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  events jsonb not null default '[]'::jsonb
);
comment on column public.upload_tasks.status is 'created|preparing|compressing|queued|uploading|retrying|verifying|ready|failed|cancelled';
create unique index if not exists upload_tasks_user_key on public.upload_tasks(user_id, task_key);
create index if not exists upload_tasks_status on public.upload_tasks(status, updated_at desc);
create index if not exists upload_tasks_user_created on public.upload_tasks(user_id, created_at desc);
create index if not exists upload_tasks_created on public.upload_tasks(created_at desc);

alter table public.upload_tasks enable row level security;
drop policy if exists upload_tasks_owner_all on public.upload_tasks;
create policy upload_tasks_owner_all on public.upload_tasks for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists upload_tasks_staff_read on public.upload_tasks;
create policy upload_tasks_staff_read on public.upload_tasks for select to authenticated
  using (public.is_admin());

-- ============ 4. 发布任务 ============
create table if not exists public.publish_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_key text not null,
  post_id uuid,
  title text,
  status text not null default 'task_created',
  media_paths jsonb not null default '[]'::jsonb,
  cover_path text,
  error_message text,
  client_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
comment on column public.publish_tasks.status is 'draft_snapshot_saved|task_created|waiting_for_media|uploading_media|verifying_media|submitting_content|ai_classifying|ai_reviewing|waiting_for_human_review|publishing|published|failed|rejected|cancelled';
create unique index if not exists publish_tasks_user_key on public.publish_tasks(user_id, task_key);
create index if not exists publish_tasks_status on public.publish_tasks(status, updated_at desc);
create index if not exists publish_tasks_user_created on public.publish_tasks(user_id, created_at desc);

alter table public.publish_tasks enable row level security;
drop policy if exists publish_tasks_owner_all on public.publish_tasks;
create policy publish_tasks_owner_all on public.publish_tasks for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists publish_tasks_staff_read on public.publish_tasks;
create policy publish_tasks_staff_read on public.publish_tasks for select to authenticated
  using (public.is_admin());

-- ============ 5. 系统监控指标 ============
create table if not exists public.system_metrics (
  id bigserial primary key,
  captured_at timestamptz not null default now(),
  cpu_percent real,
  load1 real, load5 real, load15 real,
  mem_total bigint, mem_used bigint, mem_available bigint, mem_percent real,
  swap_total bigint, swap_used bigint,
  disk_total bigint, disk_used bigint, disk_free bigint, disk_percent real, inode_percent real,
  net_rx_bytes bigint, net_tx_bytes bigint, net_rx_rate real, net_tx_rate real,
  api_requests integer, api_errors integer, api_avg_ms real, api_p95_ms real,
  upload_tasks integer, upload_failed integer, upload_success_rate real,
  container_info jsonb
);
create index if not exists system_metrics_time on public.system_metrics(captured_at desc);

alter table public.system_metrics enable row level security;
drop policy if exists system_metrics_admin_read on public.system_metrics;
create policy system_metrics_admin_read on public.system_metrics for select to authenticated
  using (public.is_admin());

-- ============ 6. 系统告警 ============
create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  level text not null default 'warning',
  title text not null,
  detail text,
  metric_snapshot jsonb,
  status text not null default 'open',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  occurrences integer not null default 1,
  handled_by uuid references auth.users(id) on delete set null,
  handle_note text
);
comment on column public.system_alerts.status is 'open|acknowledged|resolving|resolved';
comment on column public.system_alerts.level is 'info|warning|critical';
create index if not exists system_alerts_status on public.system_alerts(status, last_seen_at desc);
create index if not exists system_alerts_type on public.system_alerts(alert_type, last_seen_at desc);

alter table public.system_alerts enable row level security;
drop policy if exists system_alerts_admin_all on public.system_alerts;
create policy system_alerts_admin_all on public.system_alerts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============ 7. 存量数据修复：补齐派生缩略图路径 ============
-- 发布入库丢缩略图的历史行，按命名约定回填（与 imagePaths()/mediaVariantPath() 一致）。
-- 真实文件缺失的情况由 scripts/backfill-thumbnails.py 补生成；宽度高度由
-- scripts/backfill-media-dimensions.mjs 回填。
update public.post_media
set thumbnail_path = regexp_replace(storage_path, '\.(jpg|jpeg|png|webp)$', '-480.webp', 'i')
where thumbnail_path is null and storage_path ~* '\.(jpg|jpeg|png|webp)$';

update public.post_media
set retina_thumbnail_path = regexp_replace(storage_path, '\.(jpg|jpeg|png|webp)$', '-960.webp', 'i')
where retina_thumbnail_path is null and storage_path ~* '\.(jpg|jpeg|png|webp)$';
