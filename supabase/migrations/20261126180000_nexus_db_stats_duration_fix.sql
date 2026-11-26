-- HEIKA Nexus 修正：数据库最长活跃查询时长出现负值
-- 原因：now() 是「本事务开始时间」，而 pg_stat_activity.query_start 是其他后端
--       真实开始时间；若对端查询在本事务开始之后才启动，两者相减得到负数。
-- 处理：改用 clock_timestamp() 取当前真实时刻，并 clamp 到 0，保证展示值不为负。
-- 影响：只在原有函数体内替换时间基准，返回字段与权限不变。

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
      coalesce(
        max(greatest(0, extract(epoch from (clock_timestamp() - query_start)) * 1000))
          filter (where state = 'active' and query_start is not null),
        0
      )::bigint as longest_ms
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
    'captured_at', clock_timestamp(),
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
