-- HEIKA Nexus · 全域感知更新
-- 目标：为三维数字孪生提供可持续、可回溯的真实观测数据。
-- 原则：
--   1) 不新建第二套监控采集器，复用 fanka-metrics 与 system_metrics；
--   2) 只增加必要字段与一个只读统计函数，不复制业务表；
--   3) 所有新增字段允许为空，采集失败时宁缺勿假。

-- ---------- 1. 监控快照扩展 ----------
-- 历史回放需要同时还原“服务健康 / AI 队列 / 媒体任务”三类状态，
-- 这些值由现有采集器在同一个 15 秒采样里写入，不额外增加采集进程。
alter table public.system_metrics
  add column if not exists tcp_total integer,
  add column if not exists ai_queue integer,
  add column if not exists media_active integer,
  add column if not exists services jsonb;

comment on column public.system_metrics.tcp_total is '采集时刻已建立 TCP 连接数（/proc/net/tcp + tcp6，状态 01）';
comment on column public.system_metrics.ai_queue is '采集时刻 AI 任务队列积压（ai_task_items queued/running + 版本审核 queued/running）';
comment on column public.system_metrics.media_active is '采集时刻进行中的上传/媒体任务数';
comment on column public.system_metrics.services is '采集时刻服务探活结果（仅 ok/latency/status，不含任何凭据）';

create index if not exists idx_ai_revision_reviews_created_status
  on public.ai_revision_reviews (created_at desc, status);

-- ---------- 2. 数据库实时统计 ----------
-- PostgREST 无法直接读取 pg_stat_database，用 security definer 函数暴露
-- 计数器原值（累计值），由应用侧做差分得到每秒事务/元组读写。
-- 只返回聚合数字，不返回 SQL 文本、连接串、角色名或任何行级数据。
create or replace function public.heika_nexus_db_stats()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  with act as (
    select
      count(*) filter (where state = 'active')::int as active,
      count(*) filter (where state = 'idle')::int as idle,
      count(*) filter (where state = 'idle in transaction')::int as idle_in_tx,
      count(*)::int as total,
      coalesce(max(extract(epoch from (now() - query_start)) * 1000) filter (where state = 'active'), 0)::bigint as longest_ms
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
  ), db as (
    select
      xact_commit, xact_rollback, tup_returned, tup_fetched,
      tup_inserted, tup_updated, tup_deleted, blks_read, blks_hit,
      deadlocks, temp_bytes, sessions, sessions_abandoned
    from pg_stat_database
    where datname = current_database()
  )
  select jsonb_build_object(
    'captured_at', now(),
    'connections', (select total from act),
    'active', (select active from act),
    'idle', (select idle from act),
    'idle_in_tx', (select idle_in_tx from act),
    'longest_ms', (select longest_ms from act),
    'xact_commit', (select xact_commit from db),
    'xact_rollback', (select xact_rollback from db),
    'tup_returned', (select tup_returned from db),
    'tup_fetched', (select tup_fetched from db),
    'tup_inserted', (select tup_inserted from db),
    'tup_updated', (select tup_updated from db),
    'tup_deleted', (select tup_deleted from db),
    'blks_read', (select blks_read from db),
    'blks_hit', (select blks_hit from db),
    'deadlocks', (select deadlocks from db),
    'temp_bytes', (select temp_bytes from db),
    'db_bytes', pg_database_size(current_database())
  );
$$;

revoke all on function public.heika_nexus_db_stats() from public, anon, authenticated;
grant execute on function public.heika_nexus_db_stats() to service_role;

comment on function public.heika_nexus_db_stats() is
  'HEIKA Nexus 只读数据库统计：连接状态与累计计数器，供应用侧差分；不暴露 SQL、角色或连接串。';

-- ---------- 3. 历史聚合 ----------
-- 按指定粒度返回真实监控快照；空区间返回空数组，由前端显示“暂无快照”。
create or replace function public.heika_nexus_history(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_seconds integer default 60
)
returns table (
  bucket_at timestamptz,
  cpu_percent real,
  mem_percent real,
  disk_percent real,
  net_rx_rate real,
  net_tx_rate real,
  api_requests integer,
  api_p95_ms real,
  tcp_total integer,
  ai_queue integer,
  media_active integer,
  samples integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    to_timestamp(floor(extract(epoch from captured_at) / greatest(30, p_bucket_seconds)) * greatest(30, p_bucket_seconds)) as bucket_at,
    avg(cpu_percent)::real,
    avg(mem_percent)::real,
    avg(disk_percent)::real,
    avg(net_rx_rate)::real,
    avg(net_tx_rate)::real,
    avg(api_requests)::integer,
    avg(api_p95_ms)::real,
    max(tcp_total)::integer,
    max(ai_queue)::integer,
    max(media_active)::integer,
    count(*)::integer
  from public.system_metrics
  where captured_at >= p_from and captured_at <= p_to
  group by 1
  order by 1 asc
  limit 3000;
$$;

revoke all on function public.heika_nexus_history(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.heika_nexus_history(timestamptz, timestamptz, integer) to service_role;

notify pgrst, 'reload schema';
