-- HEIKA Control Center 3.0 + 审核策略 3.0
-- 说明：所有表默认只对 service_role 开放，管理接口在服务端完成权限校验后访问，
-- 不把运维数据暴露给浏览器直连。

-- ---------------------------------------------------------------------------
-- 1. AI 审核策略版本
-- ---------------------------------------------------------------------------
create table if not exists public.ai_review_policies (
  id bigint generated always as identity primary key,
  version text not null unique,
  name text not null,
  system_prompt text not null,
  thresholds jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

-- 同一时间只允许一个启用版本，避免审核口径漂移。
create unique index if not exists ai_review_policies_one_active
  on public.ai_review_policies ((active)) where active;

-- ---------------------------------------------------------------------------
-- 2. 每次 AI 审核的结论（三态 + 人工推翻记录）
-- ---------------------------------------------------------------------------
create table if not exists public.ai_moderation_decisions (
  id bigint generated always as identity primary key,
  task_item_id uuid references public.ai_task_items(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  decision text not null check (decision in ('PASS', 'REVIEW', 'REJECT')),
  risk_level text not null default 'uncertain',
  risk_types text[] not null default '{}',
  reason text not null default '',
  reason_code text not null default '',
  evidence text[] not null default '{}',
  policy_version text not null default '3.0',
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  elapsed_ms integer not null default 0,
  human_decision text check (human_decision in ('PASS', 'REVIEW', 'REJECT')),
  human_actor uuid references public.profiles(id) on delete set null,
  human_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_moderation_decisions_created_idx on public.ai_moderation_decisions (created_at desc);
create index if not exists ai_moderation_decisions_post_idx on public.ai_moderation_decisions (post_id, created_at desc);
create index if not exists ai_moderation_decisions_policy_idx on public.ai_moderation_decisions (policy_version);

-- ---------------------------------------------------------------------------
-- 3. IP 访问汇总（按天聚合，来自 Caddy 真实访问日志）
-- ---------------------------------------------------------------------------
create table if not exists public.ip_access_stats (
  day date not null,
  ip inet not null,
  requests bigint not null default 0,
  bytes_in bigint not null default 0,
  bytes_out bigint not null default 0,
  status_4xx integer not null default 0,
  status_5xx integer not null default 0,
  avg_ms integer not null default 0,
  first_seen timestamptz,
  last_seen timestamptz,
  client text,
  country text,
  account_id uuid references public.profiles(id) on delete set null,
  paths jsonb not null default '{}'::jsonb,
  primary key (day, ip)
);
create index if not exists ip_access_stats_last_seen_idx on public.ip_access_stats (last_seen desc);
create index if not exists ip_access_stats_account_idx on public.ip_access_stats (account_id, day desc);

-- ---------------------------------------------------------------------------
-- 4. TCP 连接快照（每 15 秒一次，只保留 24 小时）
-- ---------------------------------------------------------------------------
create table if not exists public.tcp_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  state text not null,
  local_ip inet,
  local_port integer,
  remote_ip inet,
  remote_port integer,
  process text,
  pid integer,
  direction text check (direction in ('inbound', 'outbound', 'local')),
  bytes_sent bigint,
  bytes_recv bigint,
  first_seen timestamptz,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists tcp_snapshots_time_idx on public.tcp_snapshots (captured_at desc);
create index if not exists tcp_snapshots_state_idx on public.tcp_snapshots (state, captured_at desc);

-- ---------------------------------------------------------------------------
-- 5. 访问控制规则（应用层）
-- ---------------------------------------------------------------------------
create table if not exists public.access_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'all' check (scope in ('all', 'web', 'api', 'upload', 'download', 'auth')),
  target text not null,
  action text not null check (action in ('allow', 'block', 'limit')),
  max_concurrent integer,
  rate_per_minute integer,
  bandwidth_kbps integer,
  expires_at timestamptz,
  reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default true
);
create index if not exists access_rules_active_idx on public.access_rules (active, scope);
create index if not exists access_rules_target_idx on public.access_rules (target);

-- ---------------------------------------------------------------------------
-- 6. 账号能力限制（与 IP 解耦，避免共享出口被整段封禁）
-- ---------------------------------------------------------------------------
create table if not exists public.account_ability_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ability text not null check (ability in ('login', 'browse', 'publish', 'comment', 'dm', 'upload', 'download', 'ai')),
  until timestamptz,
  reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default true,
  unique (user_id, ability)
);

-- ---------------------------------------------------------------------------
-- 7. 资源回收站（数据库记录与存储对象一起管理）
-- ---------------------------------------------------------------------------
create table if not exists public.resource_trash (
  id uuid primary key default gen_random_uuid(),
  resource_kind text not null,
  resource_key text not null,
  display_name text,
  size_bytes bigint not null default 0,
  meta jsonb not null default '{}'::jsonb,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '7 days',
  restored_at timestamptz,
  unique (resource_kind, resource_key)
);

-- ---------------------------------------------------------------------------
-- 8. HTTP 访问日志摘要（不含正文、Cookie、Token）
-- ---------------------------------------------------------------------------
create table if not exists public.http_access_logs (
  id bigint generated always as identity primary key,
  ts timestamptz not null,
  ip inet,
  method text,
  path text,
  status integer,
  ms integer,
  bytes bigint,
  ua text,
  account_id uuid references public.profiles(id) on delete set null
);
create index if not exists http_access_logs_ts_idx on public.http_access_logs (ts desc);
create index if not exists http_access_logs_ip_idx on public.http_access_logs (ip, ts desc);
create index if not exists http_access_logs_path_idx on public.http_access_logs (path, ts desc);

-- ---------------------------------------------------------------------------
-- 9. 告警规则（可配置阈值）
-- ---------------------------------------------------------------------------
create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  operator text not null default '>' check (operator in ('>', '>=', '<', '<=')),
  threshold numeric not null,
  duration_seconds integer not null default 120,
  cooldown_seconds integer not null default 1800,
  level text not null default 'warn' check (level in ('info', 'warn', 'critical')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (metric, operator, threshold)
);

-- ---------------------------------------------------------------------------
-- 10. 服务注册与部署记录
-- ---------------------------------------------------------------------------
create table if not exists public.server_services (
  key text primary key,
  label text not null,
  kind text not null,
  container text,
  status text not null default 'unknown',
  health text not null default 'unknown',
  version text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.server_deployments (
  id bigint generated always as identity primary key,
  version text not null,
  image text,
  status text not null default 'success',
  note text,
  deployed_by uuid references public.profiles(id) on delete set null,
  deployed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 10.5 全局业务开关（维护模式 / 单项功能启停）
-- ---------------------------------------------------------------------------
create table if not exists public.system_flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.system_flags enable row level security;
revoke all on public.system_flags from public, anon, authenticated;
grant all on public.system_flags to service_role;

insert into public.system_flags (key, value) values
  ('site_mode', '{"mode":"normal"}'::jsonb),
  ('features', '{"register":true,"publish":true,"comment":true,"dm":true,"upload":true,"download":true,"ai":true,"apk":true}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 11. 权限：全部仅 service_role
-- ---------------------------------------------------------------------------
alter table public.ai_review_policies enable row level security;
alter table public.ai_moderation_decisions enable row level security;
alter table public.ip_access_stats enable row level security;
alter table public.tcp_snapshots enable row level security;
alter table public.access_rules enable row level security;
alter table public.account_ability_restrictions enable row level security;
alter table public.resource_trash enable row level security;
alter table public.http_access_logs enable row level security;
alter table public.alert_rules enable row level security;
alter table public.server_services enable row level security;
alter table public.server_deployments enable row level security;

revoke all on public.ai_review_policies, public.ai_moderation_decisions, public.ip_access_stats,
  public.tcp_snapshots, public.access_rules, public.account_ability_restrictions,
  public.resource_trash, public.http_access_logs, public.alert_rules,
  public.server_services, public.server_deployments from public, anon, authenticated;

grant all on public.ai_review_policies, public.ai_moderation_decisions, public.ip_access_stats,
  public.tcp_snapshots, public.access_rules, public.account_ability_restrictions,
  public.resource_trash, public.http_access_logs, public.alert_rules,
  public.server_services, public.server_deployments to service_role;

-- ---------------------------------------------------------------------------
-- 12. 审核统计函数
-- ---------------------------------------------------------------------------
create or replace function public.admin_moderation_stats(p_since timestamptz default now() - interval '7 days')
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with base as (
    select * from public.ai_moderation_decisions where created_at >= p_since
  ), totals as (
    select
      count(*)::int as total,
      count(*) filter (where decision = 'PASS')::int as pass,
      count(*) filter (where decision = 'REVIEW')::int as review,
      count(*) filter (where decision = 'REJECT')::int as reject,
      count(*) filter (where human_decision is not null)::int as human_reviewed,
      count(*) filter (where human_decision is not null and human_decision <> decision)::int as human_overridden,
      coalesce(round(avg(elapsed_ms))::int, 0) as avg_ms,
      coalesce(sum(input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(output_tokens), 0)::bigint as output_tokens
    from base
  ), risks as (
    select risk, count(*)::int as count
    from base, unnest(risk_types) as risk
    group by risk order by count desc limit 20
  ), policies as (
    select policy_version as version, count(*)::int as count,
      count(*) filter (where decision = 'PASS')::int as pass
    from base group by policy_version order by count desc
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'risk_types', coalesce((select jsonb_agg(to_jsonb(r)) from risks r), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(to_jsonb(p)) from policies p), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_moderation_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_moderation_stats(timestamptz) to service_role;

-- 默认策略：正常内容默认通过，只有明确违规才介入。
insert into public.ai_review_policies (version, name, system_prompt, thresholds, active, activated_at)
values (
  '3.0',
  '默认通过 · 明确违规才介入',
  '你是 HEIKA 的内容审核分类器。平台原则是「正常内容默认通过，只有明确违规才介入」。默认通过：技术教程、编程与代码、AI 知识、开源项目、Prompt / Skill / Agent、文学创作、日常分享、工具测评、外部资源链接、普通争议性观点、轻微粗俗表达、历史知识与学术讨论、软件介绍与官网链接。只有以下明确违规才允许 reject：极端主义或恐怖主义、明确违反平台涉政规则、商业广告与恶意营销、恶意引流、诈骗、严重暴力威胁、恶意软件或钓鱼、严重违法（毒品、赌博、色情交易等）、侵犯个人隐私。review 只用于确有原文证据、但性质需要人工确认的边界内容。不确定一律 pass；不得因专业术语、代码、外链或模型理解不足而拦截。reject 必须同时满足 riskLevel=high、riskTypes 非空、evidence 至少一条可在原文逐字定位。只输出 JSON：{"decision":"pass|review|reject","riskLevel":"clear|low|medium|high|uncertain","riskTypes":[],"evidence":[],"rule":"","reason":""}',
  '{"reject_requires_high": true, "reject_requires_evidence": true, "review_requires_evidence": true, "uncertain_passes": true}'::jsonb,
  true,
  now()
)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- 13. IP 日统计增量写入（采集器每轮批量 upsert）
-- ---------------------------------------------------------------------------
create or replace function public.heika_ip_stats_inc(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row jsonb;
begin
  for row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into public.ip_access_stats (
      day, ip, requests, bytes_in, bytes_out, status_4xx, status_5xx, avg_ms, first_seen, last_seen, paths
    ) values (
      (row->>'day')::date,
      (row->>'ip')::inet,
      coalesce((row->>'requests')::bigint, 0),
      coalesce((row->>'bytes_in')::bigint, 0),
      coalesce((row->>'bytes_out')::bigint, 0),
      coalesce((row->>'status_4xx')::int, 0),
      coalesce((row->>'status_5xx')::int, 0),
      coalesce((row->>'avg_ms')::int, 0),
      nullif(row->>'first_seen', '')::timestamptz,
      nullif(row->>'last_seen', '')::timestamptz,
      coalesce(row->'paths', '{}'::jsonb)
    )
    on conflict (day, ip) do update set
      requests = public.ip_access_stats.requests + excluded.requests,
      bytes_in = public.ip_access_stats.bytes_in + excluded.bytes_in,
      bytes_out = public.ip_access_stats.bytes_out + excluded.bytes_out,
      status_4xx = public.ip_access_stats.status_4xx + excluded.status_4xx,
      status_5xx = public.ip_access_stats.status_5xx + excluded.status_5xx,
      avg_ms = case
        when public.ip_access_stats.requests + excluded.requests = 0 then 0
        else ((public.ip_access_stats.avg_ms * public.ip_access_stats.requests + excluded.avg_ms * excluded.requests)
          / (public.ip_access_stats.requests + excluded.requests))::int
      end,
      first_seen = least(public.ip_access_stats.first_seen, excluded.first_seen),
      last_seen = greatest(public.ip_access_stats.last_seen, excluded.last_seen),
      paths = public.ip_access_stats.paths || excluded.paths;
  end loop;
end;
$$;

revoke all on function public.heika_ip_stats_inc(jsonb) from public, anon, authenticated;
grant execute on function public.heika_ip_stats_inc(jsonb) to service_role;

-- 默认告警规则（真实阈值，采集器按此评估）
insert into public.alert_rules (metric, operator, threshold, duration_seconds, cooldown_seconds, level)
values
  ('cpu_percent', '>', 85, 180, 1800, 'warn'),
  ('mem_percent', '>', 90, 180, 1800, 'critical'),
  ('disk_percent', '>', 85, 600, 3600, 'warn'),
  ('tcp_total', '>', 800, 180, 1800, 'warn'),
  ('api_error_rate', '>', 3, 180, 1800, 'warn'),
  ('api_p95_ms', '>', 1200, 300, 1800, 'warn'),
  ('upload_fail_rate', '>', 10, 300, 3600, 'warn')
on conflict (metric, operator, threshold) do nothing;

-- ---------------------------------------------------------------------------
-- 14. 流量分析聚合函数（应用层 = 边缘访问日志；网络层 = 网卡累计计数）
-- ---------------------------------------------------------------------------

-- 网卡层：按天取累计计数器的最小/最大值求增量，口径与「应用层响应字节」严格区分。
create or replace function public.heika_nic_traffic(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with samples as (
    select (captured_at at time zone 'Asia/Shanghai')::date as day,
           net_rx_bytes, net_tx_bytes
    from public.system_metrics
    where captured_at >= p_from and captured_at <= p_to
      and net_rx_bytes is not null and net_tx_bytes is not null
  ), per_day as (
    select day,
           max(net_rx_bytes) - min(net_rx_bytes) as rx,
           max(net_tx_bytes) - min(net_tx_bytes) as tx,
           count(*) as samples
    from samples group by day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', day, 'rx', greatest(rx, 0), 'tx', greatest(tx, 0), 'samples', samples
         ) order by day), '[]'::jsonb)
  from per_day;
$$;

revoke all on function public.heika_nic_traffic(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.heika_nic_traffic(timestamptz, timestamptz) to service_role;

-- 应用层：按路径聚合真实请求数、响应字节、错误数、平均与 P95 耗时。
create or replace function public.heika_http_stats(p_from timestamptz, p_to timestamptz, p_limit integer default 40)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with scope as (
    select path, status, ms, coalesce(bytes, 0) as bytes
    from public.http_access_logs
    where ts >= p_from and ts <= p_to
  ), totals as (
    select count(*) as requests,
           coalesce(sum(bytes), 0) as bytes,
           count(*) filter (where status >= 400) as errors,
           coalesce(round(avg(ms)), 0) as avg_ms,
           coalesce(round(percentile_cont(0.95) within group (order by ms)), 0) as p95_ms,
           count(distinct path) as paths
    from scope
  ), rows as (
    select path,
           count(*) as requests,
           coalesce(sum(bytes), 0) as bytes,
           count(*) filter (where status >= 400) as errors,
           coalesce(round(avg(ms)), 0) as avg_ms,
           coalesce(round(percentile_cont(0.95) within group (order by ms)), 0) as p95_ms
    from scope group by path
    order by bytes desc
    limit greatest(1, least(coalesce(p_limit, 40), 200))
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from rows r), '[]'::jsonb)
  );
$$;

revoke all on function public.heika_http_stats(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.heika_http_stats(timestamptz, timestamptz, integer) to service_role;

-- 资源类型：图片 / 视频 / 音频 / 附件 / APK 的真实字节。
create or replace function public.heika_media_kind_stats(p_from date, p_to date)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.bytes desc), '[]'::jsonb)
  from (
    select kind,
           sum(requests) as requests,
           sum(bytes) as bytes,
           sum(completed) as completed,
           sum(failed) as failed
    from public.media_traffic_daily
    where day >= p_from and day <= p_to and source = 'edge'
    group by kind
  ) t;
$$;

revoke all on function public.heika_media_kind_stats(date, date) from public, anon, authenticated;
grant execute on function public.heika_media_kind_stats(date, date) to service_role;

-- 资源榜单：按具体路径累计，用于定位最耗流量的图片/视频/附件。
create or replace function public.heika_media_path_stats(p_from date, p_to date, p_limit integer default 30)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.bytes desc), '[]'::jsonb)
  from (
    select path, kind, sum(requests) as requests, sum(bytes) as bytes,
           sum(download_requests) as downloads
    from public.media_traffic_path_daily
    where day >= p_from and day <= p_to
    group by path, kind
    order by sum(bytes) desc
    limit greatest(1, least(coalesce(p_limit, 30), 200))
  ) t;
$$;

revoke all on function public.heika_media_path_stats(date, date, integer) from public, anon, authenticated;
grant execute on function public.heika_media_path_stats(date, date, integer) to service_role;
