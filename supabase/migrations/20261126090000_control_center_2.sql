-- 控制中心 2.0：布局偏好、运营聚合、监控指标序列
-- 只新增对象，不修改既有表结构与业务函数。

-- ---------------------------------------------------------------------------
-- 1) 管理员控制台布局偏好：按账号保存，服务端为准，前端 localStorage 仅作首屏缓存
-- ---------------------------------------------------------------------------
create table if not exists public.admin_console_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null default 'pro' check (mode in ('lite', 'pro')),
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.admin_console_prefs enable row level security;
revoke all on public.admin_console_prefs from anon, authenticated;
grant all on public.admin_console_prefs to service_role;

comment on table public.admin_console_prefs is '控制中心 2.0 首页布局偏好，仅 service_role 可读写；接口层按登录账号隔离。';

-- ---------------------------------------------------------------------------
-- 1.1) 账号在线状态：由 API 鉴权入口节流写入，仅 service_role 可读写
-- ---------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);

create index if not exists user_presence_last_seen_idx on public.user_presence (last_seen desc);

alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;
grant all on public.user_presence to service_role;

comment on table public.user_presence is '账号最近一次通过鉴权访问 API 的时间，用于计算真实在线/活跃用户；不记录 IP 与路径。';

-- ---------------------------------------------------------------------------
-- 2) 运营聚合：一次查询返回指定时间范围的用户/访问/内容/互动/会员数据
--    口径说明：
--    - 用户 active = 区间内带登录态访问去重账号；online = 最近 5 分钟带登录态访问
--    - 访问 UV = coalesce(登录账号, 客户端 IP) 去重，不等同于注册用户
--    - 阅读/点赞来自累计字段，无法按区间拆分，返回累计值并在 meta 标注
--    - 收藏/评论按 created_at 落在区间内统计
-- ---------------------------------------------------------------------------
create or replace function public.heika_admin_ops_summary(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  result jsonb;
  req_total bigint;
  req_errors bigint;
  log_since timestamptz;
  log_until timestamptz;
begin
  if not heika_private.has_staff_permission('content.read') then
    raise exception '没有管理概览权限';
  end if;
  if p_to <= p_from then
    raise exception '时间范围无效';
  end if;

  select count(*), count(*) filter (where status >= 500), min(ts), max(ts)
    into req_total, req_errors, log_since, log_until
    from public.http_access_logs
   where ts >= p_from and ts < p_to;

  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
      -- 活跃：区间内出现在线记录，或有发布/评论/收藏行为（按账号去重）
      'active', (
        select count(*) from (
          select user_id from public.user_presence
           where last_seen >= p_from and last_seen < p_to
          union
          select author_id from public.posts
           where created_at >= p_from and created_at < p_to and author_id is not null
          union
          select author_id from public.comments
           where created_at >= p_from and created_at < p_to and author_id is not null
          union
          select user_id from public.bookmarks
           where created_at >= p_from and created_at < p_to and user_id is not null
        ) active_accounts
      ),
      -- 在线：最近 5 分钟有鉴权请求的账号
      'online', (select count(*) from public.user_presence where last_seen >= now() - interval '5 minutes')
    ),
    'visits', jsonb_build_object(
      'pv', coalesce(req_total, 0),
      'requests', coalesce(req_total, 0),
      'uv', (
        select count(distinct coalesce(account_id::text, host(ip)))
          from public.http_access_logs
         where ts >= p_from and ts < p_to
      ),
      'ips', (
        select count(distinct ip) from public.http_access_logs
         where ts >= p_from and ts < p_to
      ),
      'errors', coalesce(req_errors, 0),
      'errorRate', case when coalesce(req_total, 0) > 0 then round(req_errors::numeric / req_total, 4) else null end,
      'avgMs', (
        select round(avg(ms))::int from public.http_access_logs
         where ts >= p_from and ts < p_to and ms is not null
      ),
      'p95Ms', (
        select round(percentile_cont(0.95) within group (order by ms))::int
          from public.http_access_logs
         where ts >= p_from and ts < p_to and ms is not null
      )
    ),
    'content', jsonb_build_object(
      'published', (select count(*) from public.posts where status = 'published'),
      'ai', (select count(*) from public.posts where channel = 'ai' and status = 'published'),
      'series', (select count(*) from public.post_series),
      'featured', (
        select count(*) from public.posts
         where featured_at is not null and featured_at >= p_from and featured_at < p_to
      ),
      'newPosts', (select count(*) from public.posts where created_at >= p_from and created_at < p_to)
    ),
    'engagement', jsonb_build_object(
      'views', (select coalesce(sum(view_count), 0) from public.posts where status = 'published'),
      'likes', (select coalesce(sum(like_count), 0) from public.post_like_stats),
      'saves', (select count(*) from public.bookmarks where created_at >= p_from and created_at < p_to),
      'comments', (
        select count(*) from public.comments
         where status = 'visible' and created_at >= p_from and created_at < p_to
      )
    ),
    'membership', jsonb_build_object(
      'total', (select count(*) from public.profiles where membership_tier <> 'free'),
      'new', (
        select count(*) from public.profiles
         where membership_tier <> 'free' and created_at >= p_from and created_at < p_to
      ),
      'byTier', coalesce((
        select jsonb_agg(jsonb_build_object('tier', tier, 'count', amount) order by tier)
          from (
            select membership_tier as tier, count(*) as amount
              from public.profiles
             group by membership_tier
          ) grouped
      ), '[]'::jsonb)
    ),
    'meta', jsonb_build_object(
      'logSince', log_since,
      'logUntil', log_until,
      'retentionDays', 30,
      'viewsCumulative', true,
      'likesCumulative', true,
      'activeDefinition', '区间内有在线记录或发布/评论/收藏行为的去重账号',
      'onlineDefinition', '最近 5 分钟有鉴权请求的去重账号',
      'uvDefinition', '登录账号或客户端 IP 去重'
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public.heika_admin_ops_summary(timestamptz, timestamptz) from public, anon;
-- 函数内部校验 has_staff_permission，authenticated 可调用但普通用户会被拒绝。
grant execute on function public.heika_admin_ops_summary(timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) 监控指标序列：CPU / 内存 / 磁盘 / 入站 / 出站 / TCP / 请求量 / 错误率
--    按固定时间桶聚合，空桶不补零（前端呈现真实断点）。
-- ---------------------------------------------------------------------------
create or replace function public.heika_admin_metric_series(
  p_metric text,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_seconds int
)
returns table (bucket timestamptz, value numeric)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  bucket_seconds int := greatest(coalesce(p_bucket_seconds, 60), 10);
begin
  if not heika_private.has_staff_permission('audit.read') then
    raise exception '没有监控权限';
  end if;
  if p_to <= p_from then
    raise exception '时间范围无效';
  end if;

  if p_metric in ('cpu', 'mem', 'disk', 'load') then
    return query
      select
        to_timestamp(floor(extract(epoch from m.captured_at) / bucket_seconds) * bucket_seconds) as bucket,
        avg(
          case p_metric
            when 'cpu' then m.cpu_percent
            when 'mem' then m.mem_percent
            when 'disk' then m.disk_percent
            else m.load1
          end
        )::numeric as value
      from public.system_metrics m
      where m.captured_at >= p_from and m.captured_at < p_to
      group by 1
      order by 1;
  elsif p_metric in ('net_rx', 'net_tx') then
    return query
      select
        to_timestamp(floor(extract(epoch from m.captured_at) / bucket_seconds) * bucket_seconds) as bucket,
        avg(case p_metric when 'net_rx' then m.net_rx_rate else m.net_tx_rate end)::numeric as value
      from public.system_metrics m
      where m.captured_at >= p_from and m.captured_at < p_to
      group by 1
      order by 1;
  elsif p_metric = 'tcp' then
    return query
      select
        to_timestamp(floor(extract(epoch from t.captured_at) / bucket_seconds) * bucket_seconds) as bucket,
        avg((t.meta->>'total')::numeric) as value
      from public.tcp_snapshots t
      where t.state = 'SUMMARY'
        and t.captured_at >= p_from and t.captured_at < p_to
        and jsonb_typeof(t.meta->'total') = 'number'
      group by 1
      order by 1;
  elsif p_metric = 'requests' then
    return query
      select
        to_timestamp(floor(extract(epoch from l.ts) / bucket_seconds) * bucket_seconds) as bucket,
        count(*)::numeric as value
      from public.http_access_logs l
      where l.ts >= p_from and l.ts < p_to
      group by 1
      order by 1;
  elsif p_metric = 'errors' then
    return query
      select
        to_timestamp(floor(extract(epoch from l.ts) / bucket_seconds) * bucket_seconds) as bucket,
        round(
          (count(*) filter (where l.status >= 500))::numeric
          / greatest(count(*), 1) * 100,
          2
        ) as value
      from public.http_access_logs l
      where l.ts >= p_from and l.ts < p_to
      group by 1
      order by 1;
  else
    raise exception '未知监控指标：%', p_metric;
  end if;
end;
$function$;

revoke all on function public.heika_admin_metric_series(text, timestamptz, timestamptz, int) from public, anon;
grant execute on function public.heika_admin_metric_series(text, timestamptz, timestamptz, int) to authenticated, service_role;
