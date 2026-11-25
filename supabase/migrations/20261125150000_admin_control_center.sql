-- HEIKA Control Center 2.1：实时运营、媒体资源与系统监控的数据基础。
-- 全部为增量结构：不修改既有业务表语义，不迁移、不删除任何现有数据。
-- 1) 审核记录软归档字段（删除/归档只隐藏记录，不删原作品）
-- 2) 服务器进程采样（由监控采集器写入真实 /proc 数据）
-- 3) 媒体访问流量日聚合（由反向代理访问日志汇总，真实字节数）
-- 4) 资源健康扫描任务
-- 5) 运营成本计费配置

-- ---------- 1. 审核记录生命周期 ----------
alter table public.ai_task_items add column if not exists archived_at timestamptz;
alter table public.ai_task_items add column if not exists archived_by uuid;
alter table public.ai_task_items add column if not exists archive_reason text;
alter table public.ai_task_items add column if not exists content_state text;

comment on column public.ai_task_items.archived_at is '软归档时间：非空表示已从正常复审视图中移除，保留最小审计信息';
comment on column public.ai_task_items.content_state is '内容侧状态：ok / post_deleted / post_unreadable，用于区分删除与读取异常';

create index if not exists idx_ai_task_items_live_review
  on public.ai_task_items (status, updated_at desc)
  where archived_at is null;

-- 作品删除时同时写入内容状态，便于区分「作品确实被删除」与「读取异常」。
create or replace function public.close_ai_items_on_post_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_task_items
     set status = 'skipped',
         content_state = 'post_deleted',
         error_message = '关联作品已被删除，审核项自动关闭',
         completed_at = now(),
         updated_at = now()
   where post_id = old.id
     and status in ('pending', 'processing', 'review');
  return old;
end;
$$;

-- ---------- 2. 服务器进程采样 ----------
create table if not exists public.system_processes (
  service_key text primary key,
  label text not null,
  scope text not null default 'host',
  status text not null default 'running',
  pid integer,
  process_count integer not null default 1,
  cpu_percent real,
  mem_bytes bigint,
  started_at timestamptz,
  captured_at timestamptz not null default now(),
  detail jsonb
);

comment on table public.system_processes is '由 metrics-agent 采集的宿主机进程/容器聚合指标，只读展示，不含启动参数';

-- ---------- 3. 媒体访问流量（真实字节数） ----------
create table if not exists public.media_traffic_daily (
  day date not null,
  source text not null default 'edge',
  kind text not null,
  requests bigint not null default 0,
  bytes bigint not null default 0,
  completed bigint not null default 0,
  failed bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, source, kind)
);

comment on table public.media_traffic_daily is '媒体访问日聚合：bytes 为边缘节点实际写出的响应字节数，来自 Caddy JSON 访问日志';

create table if not exists public.media_traffic_path_daily (
  day date not null,
  path text not null,
  kind text not null default 'other',
  requests bigint not null default 0,
  bytes bigint not null default 0,
  download_requests bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, path)
);

create index if not exists idx_media_traffic_path_day_bytes on public.media_traffic_path_daily (day, bytes desc);

create table if not exists public.media_traffic_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 采集器按批上报增量，由数据库做原子累加，避免并发覆盖。
create or replace function public.heika_media_traffic_inc(p_daily jsonb, p_paths jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(p_daily, '[]'::jsonb)) loop
    insert into public.media_traffic_daily (day, source, kind, requests, bytes, completed, failed, updated_at)
    values (
      (item->>'day')::date,
      coalesce(item->>'source', 'edge'),
      coalesce(item->>'kind', 'other'),
      coalesce((item->>'requests')::bigint, 0),
      coalesce((item->>'bytes')::bigint, 0),
      coalesce((item->>'completed')::bigint, 0),
      coalesce((item->>'failed')::bigint, 0),
      now()
    )
    on conflict (day, source, kind) do update set
      requests = public.media_traffic_daily.requests + excluded.requests,
      bytes = public.media_traffic_daily.bytes + excluded.bytes,
      completed = public.media_traffic_daily.completed + excluded.completed,
      failed = public.media_traffic_daily.failed + excluded.failed,
      updated_at = now();
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_paths, '[]'::jsonb)) loop
    insert into public.media_traffic_path_daily (day, path, kind, requests, bytes, download_requests, updated_at)
    values (
      (item->>'day')::date,
      item->>'path',
      coalesce(item->>'kind', 'other'),
      coalesce((item->>'requests')::bigint, 0),
      coalesce((item->>'bytes')::bigint, 0),
      coalesce((item->>'download_requests')::bigint, 0),
      now()
    )
    on conflict (day, path) do update set
      requests = public.media_traffic_path_daily.requests + excluded.requests,
      bytes = public.media_traffic_path_daily.bytes + excluded.bytes,
      download_requests = public.media_traffic_path_daily.download_requests + excluded.download_requests,
      updated_at = now();
  end loop;

  insert into public.media_traffic_meta (key, value, updated_at)
  values ('last_ingest_at', now()::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  insert into public.media_traffic_meta (key, value, updated_at)
  values ('first_ingest_at', now()::text, now())
  on conflict (key) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.heika_media_traffic_inc(jsonb, jsonb) from public, anon, authenticated;

-- ---------- 4. 资源健康扫描任务 ----------
create table if not exists public.admin_resource_scans (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'health',
  status text not null default 'running',
  scanned_count integer not null default 0,
  orphan_count integer not null default 0,
  duplicate_count integer not null default 0,
  missing_count integer not null default 0,
  reclaimable_bytes bigint not null default 0,
  detail jsonb,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_admin_resource_scans_created on public.admin_resource_scans (created_at desc);

-- ---------- 5. 运营成本配置 ----------
create table if not exists public.admin_cost_settings (
  id integer primary key default 1 check (id = 1),
  currency text not null default 'CNY',
  server_monthly numeric(12, 2) not null default 0,
  storage_per_gb_month numeric(12, 4) not null default 0,
  egress_per_gb numeric(12, 4) not null default 0,
  ai_input_per_million numeric(12, 4) not null default 0,
  ai_output_per_million numeric(12, 4) not null default 0,
  egress_free_gb numeric(12, 2) not null default 0,
  storage_free_gb numeric(12, 2) not null default 0,
  ai_free_amount numeric(12, 2) not null default 0,
  budget_monthly numeric(12, 2) not null default 0,
  budget_egress_gb numeric(12, 2) not null default 0,
  budget_storage_gb numeric(12, 2) not null default 0,
  budget_ai numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.admin_cost_settings (id) values (1) on conflict (id) do nothing;

-- ---------- 6. 查询索引 ----------
create index if not exists idx_upload_tasks_created on public.upload_tasks (created_at desc);
create index if not exists idx_upload_tasks_status_updated on public.upload_tasks (status, updated_at desc);
create index if not exists idx_system_metrics_captured on public.system_metrics (captured_at desc);

-- 只允许服务端（service_role）写入监控与流量数据：启用 RLS 且不建任何公开策略。
alter table public.system_processes enable row level security;
alter table public.media_traffic_daily enable row level security;
alter table public.media_traffic_path_daily enable row level security;
alter table public.media_traffic_meta enable row level security;
alter table public.admin_resource_scans enable row level security;
alter table public.admin_cost_settings enable row level security;

-- ---------- 7. 媒体引用视图与资源统计函数 ----------
-- 同一个物理文件可能被作品、草稿、头像、装扮、通知、私信等多个业务引用；
-- 引用数量用于判断「是否孤立」，但容量永远按物理对象统计一次。
create or replace view public.media_path_refs as
  select 'post'::text as ref_kind, pm.post_id, null::uuid as user_id, pm.storage_path as path from public.post_media pm
  union all
  select 'post', pm.post_id, null, pm.thumbnail_path from public.post_media pm where pm.thumbnail_path is not null
  union all
  select 'post', pm.post_id, null, pm.retina_thumbnail_path from public.post_media pm where pm.retina_thumbnail_path is not null
  union all
  select 'asset', ma.post_id, ma.user_id, ma.storage_path from public.media_assets ma
  union all
  select 'asset', ma.post_id, ma.user_id, ma.thumbnail_path from public.media_assets ma where ma.thumbnail_path is not null
  union all
  select 'asset', ma.post_id, ma.user_id, ma.retina_thumbnail_path from public.media_assets ma where ma.retina_thumbnail_path is not null
  union all
  select 'publish', pt.post_id, pt.user_id, pt.cover_path from public.publish_tasks pt where pt.cover_path is not null
  union all
  select 'publish', pt.post_id, pt.user_id, value from public.publish_tasks pt, jsonb_array_elements_text(coalesce(pt.media_paths, '[]'::jsonb)) as value
  union all
  select 'upload', ut.post_id, ut.user_id, ut.storage_path from public.upload_tasks ut where ut.storage_path is not null
  union all
  select 'profile', null, p.id, regexp_replace(p.avatar_url, '^.*/storage/v1/object/(public|sign)/[^/]+/', '') from public.profiles p where coalesce(p.avatar_url, '') like '%/storage/v1/object/%'
  union all
  select 'profile', null, p.id, regexp_replace(p.cover_url, '^.*/storage/v1/object/(public|sign)/[^/]+/', '') from public.profiles p where coalesce(p.cover_url, '') like '%/storage/v1/object/%'
  union all
  select 'config', null, null, regexp_replace(n.image_url, '^.*/storage/v1/object/(public|sign)/[^/]+/', '') from public.official_notices n where coalesce(n.image_url, '') like '%/storage/v1/object/%'
  union all
  select 'config', null, null, regexp_replace(a.image_url, '^.*/storage/v1/object/(public|sign)/[^/]+/', '') from public.exploration_ad_settings a where coalesce(a.image_url, '') like '%/storage/v1/object/%'
  union all
  select 'dm', null, m.sender_id, m.media_path from public.dm_messages m where m.media_path is not null
  union all
  select 'feedback', null, f.user_id, f.attachment_path from public.user_feedback f where f.attachment_path is not null;

-- 资源主分类：格式维度，互斥且可加总，避免同一对象在不同分类里重复计数。
create or replace function public.heika_media_kind(p_bucket text, p_name text, p_mime text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_mime, '') like 'image/%' then 'image'
    when coalesce(p_mime, '') like 'video/%' or coalesce(p_mime, '') like 'audio/%' then 'media'
    when coalesce(p_mime, '') like 'application/pdf' or coalesce(p_mime, '') like '%word%'
      or coalesce(p_mime, '') like '%officedocument%' or coalesce(p_mime, '') like '%excel%'
      or coalesce(p_mime, '') like '%powerpoint%' or coalesce(p_mime, '') like 'text/%' then 'document'
    when coalesce(p_mime, '') in ('application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed')
      or lower(p_name) ~ '\.(zip|rar|7z)$' then 'archive'
    when coalesce(p_mime, '') = 'application/vnd.android.package-archive' or lower(p_name) ~ '\.apk$' then 'app'
    when coalesce(p_mime, '') in ('application/json', 'application/x-yaml', 'text/yaml', 'text/x-yaml') then 'ai'
    else 'other'
  end;
$$;

create or replace function public.heika_storage_summary()
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  with rows as (
    select o.bucket_id,
           coalesce((o.metadata->>'size')::bigint, 0) as bytes,
           public.heika_media_kind(o.bucket_id, o.name, o.metadata->>'mimetype') as kind
    from storage.objects o
  ), by_kind as (
    select kind, count(*)::int as objects, coalesce(sum(bytes), 0)::bigint as bytes from rows group by kind
  ), by_bucket as (
    select bucket_id, count(*)::int as objects, coalesce(sum(bytes), 0)::bigint as bytes from rows group by bucket_id
  )
  select jsonb_build_object(
    'objects', (select count(*)::int from rows),
    'bytes', (select coalesce(sum(bytes), 0)::bigint from rows),
    'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'objects', objects, 'bytes', bytes) order by bytes desc), '[]'::jsonb) from by_kind),
    'by_bucket', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'objects', objects, 'bytes', bytes) order by bytes desc), '[]'::jsonb) from by_bucket),
    'captured_at', now()
  );
$$;

revoke all on function public.heika_storage_summary() from public, anon, authenticated;

create or replace function public.heika_storage_page(
  p_bucket text default null,
  p_search text default null,
  p_kind text default null,
  p_state text default null,
  p_sort text default 'created',
  p_desc boolean default true,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  with refs as (
    select r.path,
           count(*)::int as ref_count,
           bool_or(r.ref_kind in ('post', 'asset', 'publish', 'profile', 'config', 'dm', 'feedback')) as live_ref,
           max(r.post_id::text) as post_id
    from public.media_path_refs r
    group by r.path
  ), base as (
    select o.bucket_id,
           o.name,
           coalesce((o.metadata->>'size')::bigint, 0) as bytes,
           coalesce(o.metadata->>'mimetype', '') as mime,
           o.created_at,
           o.updated_at,
           public.heika_media_kind(o.bucket_id, o.name, o.metadata->>'mimetype') as kind,
           coalesce(refs.ref_count, 0) as ref_count,
           refs.live_ref,
           refs.post_id
    from storage.objects o
    left join refs on refs.path = o.name
    where (p_bucket is null or o.bucket_id = p_bucket)
      and (p_search is null or o.name ilike '%' || p_search || '%')
      and (p_kind is null or public.heika_media_kind(o.bucket_id, o.name, o.metadata->>'mimetype') = p_kind)
  ), stated as (
    select base.*,
           case
             when ref_count = 0 and created_at < now() - interval '7 days' then 'orphan'
             when ref_count = 0 then 'temporary'
             when live_ref then 'referenced'
             else 'pending'
           end as state
    from base
  ), filtered as (
    select * from stated where (p_state is null or state = p_state)
  ), page as (
    select * from filtered
    order by
      case when p_sort = 'size' and p_desc then bytes end desc nulls last,
      case when p_sort = 'size' and not p_desc then bytes end asc nulls last,
      case when p_sort = 'name' and p_desc then name end desc,
      case when p_sort = 'name' and not p_desc then name end asc,
      case when p_sort = 'created' and p_desc then created_at end desc,
      case when p_sort = 'created' and not p_desc then created_at end asc,
      created_at desc
    limit greatest(1, least(100, p_limit)) offset greatest(0, p_offset)
  )
  select jsonb_build_object(
    'total', (select count(*)::int from filtered),
    'objects', (select count(*)::int from stated),
    'bytes', (select coalesce(sum(bytes), 0)::bigint from filtered),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', bucket_id, 'name', name, 'bytes', bytes, 'mime', mime,
        'created_at', created_at, 'updated_at', updated_at, 'kind', kind,
        'ref_count', ref_count, 'state', state, 'post_id', post_id
      ) order by
        case when p_sort = 'size' and p_desc then bytes end desc nulls last,
        case when p_sort = 'size' and not p_desc then bytes end asc nulls last,
        case when p_sort = 'name' and p_desc then name end desc,
        case when p_sort = 'name' and not p_desc then name end asc,
        case when p_sort = 'created' and p_desc then created_at end desc,
        case when p_sort = 'created' and not p_desc then created_at end asc,
        created_at desc), '[]'::jsonb) from page)
  );
$$;

revoke all on function public.heika_storage_page(text, text, text, text, text, boolean, integer, integer) from public, anon, authenticated;

-- 资源详情：单个对象的引用明细（业务用途、所属作品、上传任务）。
create or replace function public.heika_storage_detail(p_bucket text, p_name text)
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  with target as (
    select o.*, coalesce((o.metadata->>'size')::bigint, 0) as bytes,
           public.heika_media_kind(o.bucket_id, o.name, o.metadata->>'mimetype') as kind
    from storage.objects o
    where o.bucket_id = p_bucket and o.name = p_name
  ), refs as (
    select r.ref_kind, r.post_id, r.user_id, p.title as post_title, p.status as post_status
    from public.media_path_refs r
    left join public.posts p on p.id = r.post_id
    where r.path = p_name
  )
  select case when (select count(*) from target) = 0 then null else jsonb_build_object(
    'bucket', (select bucket_id from target),
    'name', (select name from target),
    'bytes', (select bytes from target),
    'mime', (select metadata->>'mimetype' from target),
    'etag', (select replace(coalesce(metadata->>'eTag', ''), '"', '') from target),
    'created_at', (select created_at from target),
    'updated_at', (select updated_at from target),
    'kind', (select kind from target),
    'ref_count', (select count(*)::int from refs),
    'refs', (select coalesce(jsonb_agg(jsonb_build_object('kind', ref_kind, 'post_id', post_id, 'post_title', post_title, 'post_status', post_status, 'user_id', user_id)), '[]'::jsonb) from refs)
  ) end;
$$;

revoke all on function public.heika_storage_detail(text, text) from public, anon, authenticated;

-- 资源健康检查：孤立、重复、缺失、临时，只出报告，不删除任何文件。
create or replace function public.heika_storage_health()
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  with refs as (
    select r.path,
           count(*)::int as ref_count,
           bool_or(r.ref_kind in ('post', 'asset', 'publish', 'profile', 'config', 'dm', 'feedback')) as live_ref,
           max(r.post_id::text) as post_id
    from public.media_path_refs r group by r.path
  ), objects as (
    select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0) as bytes,
           o.created_at, o.metadata,
           public.heika_media_kind(o.bucket_id, o.name, o.metadata->>'mimetype') as kind
    from storage.objects o
  ), orphans as (
    select o.*, 'orphan'::text as reason from objects o
    left join refs on refs.path = o.name
    where coalesce(refs.ref_count, 0) = 0 and o.created_at < now() - interval '7 days'
  ), temporary as (
    select o.* from objects o
    left join refs on refs.path = o.name
    where coalesce(refs.ref_count, 0) = 0 and o.created_at >= now() - interval '7 days'
  ), duplicates as (
    select (o.metadata->>'size')::bigint as bytes,
           replace(o.metadata->>'eTag', '"', '') as etag,
           count(*)::int as count,
           jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name, 'created_at', o.created_at)) as items
    from objects o
    where coalesce(o.metadata->>'eTag', '') <> ''
      and coalesce(o.metadata->>'eTag', '') not like '%-%'
      and coalesce((o.metadata->>'size')::bigint, 0) > 0
    group by 1, 2 having count(*) > 1
  ), missing as (
    select r.path, r.post_id, null::text as ref_kind
    from refs r
    where r.ref_count > 0
      and not exists (select 1 from objects o where o.name = r.path)
    limit 200
  )
  select jsonb_build_object(
    'orphans', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', name, 'bytes', bytes, 'kind', kind, 'created_at', created_at)), '[]'::jsonb) from orphans),
    'orphan_bytes', (select coalesce(sum(bytes), 0)::bigint from orphans),
    'temporary', (select count(*)::int from temporary),
    'temporary_bytes', (select coalesce(sum(bytes), 0)::bigint from temporary),
    'duplicates', (select coalesce(jsonb_agg(jsonb_build_object('bytes', bytes, 'etag', etag, 'count', count, 'items', items) order by count desc), '[]'::jsonb) from duplicates),
    'duplicate_bytes', (select coalesce(sum(bytes * (count - 1)), 0)::bigint from duplicates),
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'post_id', post_id, 'ref_kind', ref_kind)), '[]'::jsonb) from missing),
    'objects', (select count(*)::int from objects),
    'bytes', (select coalesce(sum(bytes), 0)::bigint from objects),
    'scanned_at', now()
  );
$$;

revoke all on function public.heika_storage_health() from public, anon, authenticated;

-- 热门资源：按天聚合后的访问/流量排行，关联业务标题；不改变用户端任何热度算法。
create or replace function public.heika_media_top(
  p_from date, p_to date, p_metric text default 'bytes', p_kind text default null, p_limit integer default 10
)
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  with agg as (
    select p.path, max(p.kind) as kind,
           sum(p.requests)::bigint as requests,
           sum(p.bytes)::bigint as bytes,
           sum(p.download_requests)::bigint as downloads
    from public.media_traffic_path_daily p
    where p.day between p_from and p_to
      and (p_kind is null or p.kind = p_kind)
    group by p.path
  ), enriched as (
    select a.*, o.bucket_id, coalesce((o.metadata->>'size')::bigint, 0) as size,
           o.name as object_name,
           (select r.post_id from public.media_path_refs r where r.path = a.path and r.post_id is not null limit 1) as post_id
    from agg a
    left join storage.objects o on o.name = a.path
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'path', path, 'kind', kind, 'requests', requests, 'bytes', bytes, 'downloads', downloads,
      'bucket', bucket_id, 'size', size,
      'post_id', post_id,
      'title', (select p.title from public.posts p where p.id = enriched.post_id)
    ) order by
      case when p_metric = 'requests' then requests end desc,
      case when p_metric = 'downloads' then downloads end desc,
      case when p_metric = 'bytes' then bytes end desc,
      bytes desc
    ), '[]'::jsonb)
  from (select * from enriched order by
      case when p_metric = 'requests' then requests end desc,
      case when p_metric = 'downloads' then downloads end desc,
      case when p_metric = 'bytes' then bytes end desc,
      bytes desc
    limit greatest(1, least(50, p_limit))) enriched;
$$;

revoke all on function public.heika_media_top(date, date, text, text, integer) from public, anon, authenticated;
