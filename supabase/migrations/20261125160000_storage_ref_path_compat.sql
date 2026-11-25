-- 引用路径口径兼容：post_media / media_assets / upload_tasks 的 storage_path
-- 绝大多数只存 {user_id}/{file}（不含 bucket），但客户端历史上也写入过
-- {bucket}/{user_id}/{file}。原实现只与 storage.objects.name 比较，
-- 带 bucket 前缀的引用会被判成「无引用」，超过 7 天后就会被当作孤立资源清理，
-- 直接删掉正式作品正在使用的文件。
-- 这里把三个函数改成同时接受两种口径。

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
    left join refs on refs.path in (o.name, o.bucket_id || '/' || o.name)
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
    where r.path in (p_name, p_bucket || '/' || p_name)
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
    left join refs on refs.path in (o.name, o.bucket_id || '/' || o.name)
    where coalesce(refs.ref_count, 0) = 0 and o.created_at < now() - interval '7 days'
  ), temporary as (
    select o.* from objects o
    left join refs on refs.path in (o.name, o.bucket_id || '/' || o.name)
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
      and not exists (select 1 from objects o where o.name = r.path or o.bucket_id || '/' || o.name = r.path)
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
