/**
 * HEIKA Nexus 服务端聚合层。
 *
 * 数据来源只有四类，全部可核对：
 *   1) fanka-metrics 的 1 秒实时接口（宿主机 CPU/内存/磁盘/网络/TCP + 边缘日志秒级聚合）；
 *   2) PostgreSQL 只读统计函数 heika_nexus_db_stats（连接与累计计数器差分）；
 *   3) 现有业务表（进程、告警、AI 用量、媒体任务、访问规则、内容统计）；
 *   4) app 进程内的请求指标环形缓冲（入口请求与 401/403/429 事件）。
 *
 * 不生成随机数、不猜历史状态。取不到就返回 null / available=false，
 * 由三维界面明确显示“未接入”或“无数据”。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { requestMetricsSnapshot } from "./request-metrics";
import type {
  NexusAiScene,
  NexusAlert,
  NexusContentScene,
  NexusEvent,
  NexusGlobeScene,
  NexusHistoryResponse,
  NexusLink,
  NexusNode,
  NexusProcess,
  NexusSecurityScene,
  NexusSnapshot,
  NexusStorageScene,
} from "@/lib/nexus/types";

const AGENT_URL = (process.env.METRICS_AGENT_URL || "http://metrics-agent:3100").replace(/\/$/, "");
const AGENT_TOKEN = process.env.METRICS_AGENT_TOKEN || process.env.AI_TASK_WORKER_TOKEN || "";
const DAY_MS = 86_400_000;

type Cache<T> = { at: number; value: T | null; inflight: Promise<T | null> | null };
const holder = globalThis as unknown as {
  __heikaNexusCaches?: Record<string, Cache<unknown>>;
  __heikaNexusDbPrev?: { at: number; counters: Record<string, number> } | null;
  __heikaNexusDbLast?: unknown;
  __heikaNexusAgentError?: string | null;
};
if (!holder.__heikaNexusCaches) holder.__heikaNexusCaches = {};
if (holder.__heikaNexusDbPrev === undefined) holder.__heikaNexusDbPrev = null;
if (holder.__heikaNexusDbLast === undefined) holder.__heikaNexusDbLast = null;
if (holder.__heikaNexusAgentError === undefined) holder.__heikaNexusAgentError = null;

function cached<T>(key: string, ttl: number, loader: () => Promise<T | null>): Promise<T | null> {
  const store = holder.__heikaNexusCaches!;
  const current = store[key] as Cache<T> | undefined;
  if (current && current.value !== null && Date.now() - current.at < ttl) return Promise.resolve(current.value);
  if (current?.inflight) return current.inflight;
  const inflight = loader()
    .then((value) => {
      store[key] = { at: Date.now(), value, inflight: null };
      return value;
    })
    .catch(() => {
      store[key] = { at: current?.at || 0, value: current?.value ?? null, inflight: null };
      return current?.value ?? null;
    });
  store[key] = { at: current?.at || 0, value: current?.value ?? null, inflight };
  return inflight;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const int = (value: unknown): number | null => {
  const parsed = num(value);
  return parsed === null ? null : Math.round(parsed);
};
const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

function hash(input: string) {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) value = ((value << 5) - value + input.charCodeAt(index)) | 0;
  return Math.abs(value);
}

function ageSeconds(at: string | null | undefined) {
  if (!at) return null;
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 1000)) : null;
}

/** 1 秒实时接口；失败时记录可展示的原因，不伪造指标。 */
type AgentLive = {
  ok?: boolean;
  captured_at?: string;
  host?: Record<string, unknown>;
  edge?: {
    window_seconds?: number;
    requests?: number;
    bytes?: number;
    rps?: number;
    bytes_per_second?: number;
    avg_ms?: number | null;
    success_rate?: number | null;
    by_category?: Record<string, number>;
    bytes_by_category?: Record<string, number>;
    by_client?: Record<string, number>;
    by_status?: Record<string, number>;
    points?: Array<{ t: number; requests: number; bytes: number; errors4xx: number; errors5xx: number }>;
    last_at?: string | null;
  };
  processes?: Array<Record<string, unknown>>;
};

async function fetchAgent(): Promise<AgentLive | null> {
  if (!AGENT_TOKEN) {
    holder.__heikaNexusAgentError = "未配置实时通道令牌";
    return null;
  }
  try {
    const response = await fetch(`${AGENT_URL}/live`, {
      headers: { "x-metrics-token": AGENT_TOKEN },
      signal: AbortSignal.timeout(1600),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as AgentLive;
    holder.__heikaNexusAgentError = null;
    return data;
  } catch (error) {
    holder.__heikaNexusAgentError = error instanceof Error ? error.message : "实时采集不可达";
    return null;
  }
}

type DbStats = {
  captured_at?: string;
  connections?: number;
  active?: number;
  idle?: number;
  idle_in_tx?: number;
  longest_ms?: number;
  xact_commit?: number;
  xact_rollback?: number;
  tup_returned?: number;
  tup_fetched?: number;
  tup_inserted?: number;
  tup_updated?: number;
  tup_deleted?: number;
  blks_read?: number;
  blks_hit?: number;
  db_bytes?: number;
};

async function fetchDbStats(db: SupabaseClient) {
  try {
    const { data, error } = await db.rpc("heika_nexus_db_stats");
    if (error || !data) throw new Error(error?.message || "empty");
    const stats = data as DbStats;
    const counters: Record<string, number> = {
      xact: Number(stats.xact_commit || 0) + Number(stats.xact_rollback || 0),
      read: Number(stats.tup_returned || 0) + Number(stats.tup_fetched || 0),
      write: Number(stats.tup_inserted || 0) + Number(stats.tup_updated || 0) + Number(stats.tup_deleted || 0),
      blocksRead: Number(stats.blks_read || 0),
      blocksHit: Number(stats.blks_hit || 0),
    };
    const captured = stats.captured_at || new Date().toISOString();
    const previous = holder.__heikaNexusDbPrev;
    const now = Date.now();
    let rates: { xactPerSecond: number | null; readPerSecond: number | null; writePerSecond: number | null; cacheHit: number | null } = {
      xactPerSecond: null, readPerSecond: null, writePerSecond: null, cacheHit: null,
    };
    if (previous && now > previous.at) {
      const seconds = (now - previous.at) / 1000;
      rates = {
        xactPerSecond: Number((Math.max(0, counters.xact - previous.counters.xact) / seconds).toFixed(2)),
        readPerSecond: Math.round(Math.max(0, counters.read - previous.counters.read) / seconds),
        writePerSecond: Math.round(Math.max(0, counters.write - previous.counters.write) / seconds),
        cacheHit: (() => {
          const hit = Math.max(0, counters.blocksHit - previous.counters.blocksHit);
          const read = Math.max(0, counters.blocksRead - previous.counters.blocksRead);
          return hit + read > 0 ? Number(((hit / (hit + read)) * 100).toFixed(2)) : null;
        })(),
      };
    }
    holder.__heikaNexusDbPrev = { at: now, counters };
    const value = {
      available: true,
      connections: int(stats.connections),
      active: int(stats.active),
      idle: int(stats.idle),
      idleInTx: int(stats.idle_in_tx),
      longestMs: int(stats.longest_ms),
      sizeBytes: int(stats.db_bytes),
      capturedAt: captured,
      ...rates,
    };
    holder.__heikaNexusDbLast = value;
    return value;
  } catch {
    return holder.__heikaNexusDbLast as {
      available: boolean; connections: number | null; active: number | null; idle: number | null;
      idleInTx: number | null; longestMs: number | null; sizeBytes: number | null; capturedAt: string | null;
      xactPerSecond: number | null; readPerSecond: number | null; writePerSecond: number | null; cacheHit: number | null;
    } | null;
  }
}

type SlowData = {
  processes: NexusProcess[];
  alerts: NexusAlert[];
  latestMetric: Record<string, unknown> | null;
  rules: Array<Record<string, unknown>>;
  aiUsage: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  mediaDaily: Array<Record<string, unknown>>;
  uploads: Array<Record<string, unknown>>;
  content: { posts: number | null; aiPosts: number | null; series: number | null; tags: number | null; views: number | null; likes: number | null; comments: number | null };
  uniqueIps: number | null;
};

async function loadSlow(db: SupabaseClient): Promise<SlowData> {
  return (await cached<SlowData>("slow", 5000, async () => {
    const since1h = new Date(Date.now() - 3600_000).toISOString();
    const since24h = new Date(Date.now() - DAY_MS).toISOString();
    const today = dayKey();
    const [processes, alerts, metric, rules, aiUsage, revisions, mediaDaily, uploads, posts, aiPosts, series, tags, views, likes, comments, ips] = await Promise.all([
      db.from("system_processes").select("service_key,label,status,pid,process_count,cpu_percent,mem_bytes,started_at,captured_at").order("service_key"),
      db.from("system_alerts").select("id,level,title,detail,status,first_seen_at,last_seen_at").neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(8),
      db.from("system_metrics").select("*").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("access_rules").select("id,scope,target,action,reason,created_at,expires_at,active").eq("active", true).order("created_at", { ascending: false }).limit(200),
      db.from("ai_usage_events").select("purpose,model,status,elapsed_ms,input_tokens,output_tokens,estimated_cost,created_at").gte("created_at", since1h).order("created_at", { ascending: false }).limit(3000),
      db.from("ai_revision_reviews").select("id,status,decision,verdict,risk_level,model,input_tokens,output_tokens,elapsed_ms,reason,created_at,finished_at").gte("created_at", since24h).order("created_at", { ascending: false }).limit(500),
      db.from("media_traffic_daily").select("kind,requests,bytes,completed,failed").eq("day", today),
      db.from("upload_tasks").select("status,file_size,created_at").gte("created_at", `${today}T00:00:00+08:00`).limit(3000),
      db.from("posts").select("id", { count: "exact", head: true }).eq("status", "published"),
      db.from("posts").select("id", { count: "exact", head: true }).eq("status", "published").eq("channel", "ai"),
      db.from("post_series").select("id", { count: "exact", head: true }).eq("review_status", "approved").eq("is_public", true),
      db.from("interest_tags").select("id", { count: "exact", head: true }).eq("active", true),
      db.from("posts").select("view_count").eq("status", "published").limit(20000),
      db.from("post_like_stats").select("like_count").limit(20000),
      db.from("comments").select("id", { count: "exact", head: true }),
      db.from("ip_access_stats").select("ip").eq("day", today).limit(5000),
    ]);

    const viewSum = (views.data || []).reduce((sum, row) => sum + Number(row.view_count || 0), 0);
    const likeSum = (likes.data || []).reduce((sum, row) => sum + Number(row.like_count || 0), 0);
    return {
      processes: (processes.data || []).map((row) => ({
        service_key: str(row.service_key),
        label: str(row.label),
        status: str(row.status, "unknown"),
        pid: int(row.pid),
        process_count: Number(row.process_count || 1),
        cpu_percent: num(row.cpu_percent),
        mem_bytes: num(row.mem_bytes),
        started_at: row.started_at || null,
        captured_at: str(row.captured_at),
      })),
      alerts: (alerts.data || []).map((row) => ({
        id: str(row.id), level: str(row.level, "warn"), title: str(row.title), detail: str(row.detail),
        status: str(row.status, "open"), first_seen_at: str(row.first_seen_at), last_seen_at: str(row.last_seen_at),
      })),
      latestMetric: (metric.data as Record<string, unknown> | null) || null,
      rules: (rules.data || []) as Array<Record<string, unknown>>,
      aiUsage: (aiUsage.data || []) as Array<Record<string, unknown>>,
      revisions: (revisions.data || []) as Array<Record<string, unknown>>,
      mediaDaily: (mediaDaily.data || []) as Array<Record<string, unknown>>,
      uploads: (uploads.data || []) as Array<Record<string, unknown>>,
      content: {
        posts: posts.count ?? null,
        aiPosts: aiPosts.count ?? null,
        series: series.count ?? null,
        tags: tags.count ?? null,
        views: viewSum,
        likes: likeSum,
        comments: comments.count ?? null,
      },
      uniqueIps: new Set((ips.data || []).map((row) => String(row.ip))).size,
    } satisfies SlowData;
  }))!;
}

const PROCESS_ALIAS: Record<string, string> = {
  web: "app",
  caddy: "edge",
  "ai-worker": "ai-worker",
  metrics: "metrics",
  database: "db",
  rest: "rest",
  storage: "storage",
  auth: "auth",
  realtime: "realtime",
};

function processStatus(process: NexusProcess | undefined): "healthy" | "degraded" | "down" | "unknown" {
  if (!process) return "unknown";
  const age = ageSeconds(process.captured_at);
  if (age !== null && age > 120) return "degraded";
  return process.status === "running" ? "healthy" : process.status === "unknown" ? "unknown" : "down";
}

function buildNodes(slow: SlowData, snapshot: Partial<NexusSnapshot>, agent: AgentLive | null, dbStats: Awaited<ReturnType<typeof fetchDbStats>>): NexusNode[] {
  const byKey = new Map<string, NexusProcess>();
  for (const process of slow.processes) {
    const key = PROCESS_ALIAS[process.service_key] || process.service_key;
    byKey.set(key, process);
  }
  const agentCaptured = agent?.captured_at || null;
  const node = (
    id: string,
    label: string,
    kind: NexusNode["kind"],
    subtitle: string,
    metrics: NexusNode["metrics"],
    options: { status?: NexusNode["status"]; measured?: boolean; staleSeconds?: number | null } = {},
  ): NexusNode => ({
    id, label, kind, subtitle, metrics,
    status: options.status || "healthy",
    measured: options.measured !== false,
    staleSeconds: options.staleSeconds ?? null,
  });

  const uptime = num(agent?.host?.uptime_seconds) ?? null;
  const webProbe = (slow.latestMetric?.services as { web_api?: { ok?: boolean; latency_ms?: number } } | undefined)?.web_api;
  const appStatus = processStatus(byKey.get("app"));
  const aiUsageCount = slow.aiUsage.filter((row) => Date.now() - Date.parse(str(row.created_at)) < 60_000).length;

  return [
    node("client-web", "网页端", "client", "浏览器访问", [
      { label: "请求", value: snapshot.traffic?.byClient?.web == null ? null : Number((Number(snapshot.traffic.byClient.web) / Math.max(1, snapshot.traffic.windowSeconds || 60)).toFixed(2)), unit: "req/s" },
    ], { status: "healthy", measured: Boolean(snapshot.traffic?.available), staleSeconds: ageSeconds(snapshot.traffic?.capturedAt || null) }),
    node("client-app", "Android APP", "client", "原生客户端", [
      { label: "请求", value: snapshot.traffic?.byClient?.app == null ? null : Number((Number(snapshot.traffic.byClient.app) / Math.max(1, snapshot.traffic.windowSeconds || 60)).toFixed(2)), unit: "req/s" },
    ], { status: "healthy", measured: Boolean(snapshot.traffic?.available) }),
    node("edge", "网络入口", "gateway", "Caddy · 反代与访问日志", [
      { label: "请求", value: snapshot.traffic?.rps ?? null, unit: "req/s" },
      { label: "入网", value: snapshot.server?.netRxRate ?? null, unit: "B/s" },
      { label: "出网", value: snapshot.server?.netTxRate ?? null, unit: "B/s" },
    ], { status: processStatus(byKey.get("edge")), staleSeconds: ageSeconds(agentCaptured) }),
    node("app", "业务 API", "server", "Next.js Web / API", [
      { label: "请求", value: snapshot.traffic?.rps ?? null, unit: "req/s" },
      { label: "P95", value: snapshot.traffic?.avgMs ?? null, unit: "ms" },
      { label: "错误率", value: snapshot.traffic?.successRate == null ? null : Number((100 - snapshot.traffic.successRate).toFixed(2)), unit: "%" },
    ], { status: webProbe?.ok === false || appStatus === "down" ? "down" : appStatus, staleSeconds: ageSeconds(str(slow.latestMetric?.captured_at, "")) }),
    node("rest", "数据 API", "server", "PostgREST", [
      { label: "查询", value: snapshot.traffic?.byCategory?.rest ?? null, unit: "次/分" },
    ], { status: processStatus(byKey.get("rest")), measured: Boolean(snapshot.traffic?.available) }),
    node("db", "数据库", "database", "PostgreSQL · 主数据", [
      { label: "事务", value: dbStats?.xactPerSecond ?? null, unit: "tx/s" },
      { label: "连接", value: dbStats?.connections ?? null, unit: "个" },
      { label: "缓存命中", value: dbStats?.cacheHit ?? null, unit: "%" },
    ], { status: processStatus(byKey.get("db")), staleSeconds: ageSeconds(dbStats?.capturedAt || null) }),
    node("storage", "媒体存储", "storage", "对象存储 · 图片/视频/附件", [
      { label: "传输", value: snapshot.traffic?.byCategory?.storage ?? null, unit: "次/分" },
    ], { status: processStatus(byKey.get("storage")), measured: Boolean(snapshot.traffic?.available) }),
    node("auth", "身份认证", "auth", "GoTrue", [
      { label: "请求", value: snapshot.traffic?.byCategory?.auth ?? null, unit: "次/分" },
    ], { status: processStatus(byKey.get("auth")), measured: Boolean(snapshot.traffic?.available) }),
    node("realtime", "实时通道", "realtime", "Supabase Realtime", [
      { label: "连接", value: null, unit: "个" },
    ], { status: processStatus(byKey.get("realtime")), measured: false }),
    node("ai-worker", "AI 调度", "ai", "任务队列与模型调用", [
      { label: "队列", value: snapshot.ai?.queue ?? null, unit: "项" },
      { label: "近 1 分钟", value: aiUsageCount, unit: "次" },
    ], { status: processStatus(byKey.get("ai-worker")), staleSeconds: ageSeconds(str(slow.latestMetric?.captured_at, "")) }),
    node("ai-provider", "外部模型", "external", "DeepSeek · 仅统计已记录调用", [
      { label: "Token/时", value: snapshot.ai?.tokens1h ?? null, unit: "tokens" },
      { label: "平均耗时", value: snapshot.ai?.avgMs1h ?? null, unit: "ms" },
    ], { status: snapshot.ai?.available ? "healthy" : "unknown", measured: Boolean(snapshot.ai?.available) }),
    node("metrics", "监控采集", "monitor", "fanka-metrics · 15s 落库 / 1s 实时", [
      { label: "TCP", value: snapshot.server?.tcpTotal ?? null, unit: "连接" },
    ], { status: processStatus(byKey.get("metrics")), staleSeconds: ageSeconds(str(slow.latestMetric?.captured_at, "")) }),
  ];
}

function buildLinks(snapshot: Partial<NexusSnapshot>, agent: AgentLive | null): NexusLink[] {
  const edge = agent?.edge;
  const windowSeconds = Math.max(1, edge?.window_seconds || 60);
  const category = (key: string) => (edge?.by_category?.[key] ?? null);
  const rateOf = (key: string) => (category(key) === null ? null : Number(((category(key) || 0) / windowSeconds).toFixed(2)));
  const bytesOf = (key: string) => (edge?.bytes_by_category?.[key] == null ? null : Math.round(Number(edge.bytes_by_category[key]) / windowSeconds));
  const link = (
    id: string, from: string, to: string, kind: NexusLink["kind"], label: string,
    rate: number | null, bytes: number | null, options: Partial<NexusLink> = {},
  ): NexusLink => ({
    id, from, to, kind, label, rate, bytesPerSecond: bytes, latencyMs: null, errorRate: null,
    direction: "one-way", measured: rate !== null || bytes !== null, ...options,
  });

  const appRps = snapshot.traffic?.rps ?? null;
  const appError = snapshot.traffic?.successRate == null ? null : Number((100 - snapshot.traffic.successRate).toFixed(2));
  const clientWeb = edge?.by_client?.web == null ? null : Number((Number(edge.by_client.web) / windowSeconds).toFixed(2));
  const clientApp = edge?.by_client?.app == null ? null : Number((Number(edge.by_client.app) / windowSeconds).toFixed(2));
  const aiRate = snapshot.ai?.calls60s == null ? null : Number((snapshot.ai.calls60s / 60).toFixed(3));

  return [
    link("web-edge", "client-web", "edge", "http", "网页访问", clientWeb, null, { errorRate: appError }),
    link("app-edge", "client-app", "edge", "http", "APP 访问", clientApp, null, { errorRate: appError }),
    link("edge-app", "edge", "app", "api", "页面与业务 API", rateOf("page") != null && rateOf("api") != null ? Number(((rateOf("page") || 0) + (rateOf("api") || 0)).toFixed(2)) : appRps, null, { latencyMs: snapshot.traffic?.avgMs ?? null, errorRate: appError, direction: "two-way" }),
    link("edge-rest", "edge", "rest", "data", "数据查询", rateOf("rest"), bytesOf("rest"), { direction: "two-way", latencyMs: snapshot.db?.longestMs ?? null }),
    link("edge-storage", "edge", "storage", "media", "媒体传输", rateOf("storage"), bytesOf("storage"), { direction: "two-way" }),
    link("edge-auth", "edge", "auth", "auth", "登录与令牌", rateOf("auth"), bytesOf("auth"), { direction: "two-way" }),
    link("edge-realtime", "edge", "realtime", "realtime", "实时订阅", null, null, { note: "WebSocket 连接数未接入链路级指标" }),
    link("app-ai", "app", "ai-worker", "ai", "AI 任务提交", aiRate, null, { direction: "two-way", note: aiRate === null ? "近 1 小时无已记录调用" : undefined }),
    link("ai-provider", "ai-worker", "ai-provider", "ai", "模型调用", aiRate, null, { note: aiRate === null ? "近 1 小时无已记录调用" : undefined }),
    link("rest-db", "rest", "db", "data", "数据读写", snapshot.db?.xactPerSecond ?? null, null, { direction: "two-way", note: "事务量为数据库全局值" }),
    link("storage-db", "storage", "db", "data", "对象元数据", null, null, { note: "未接入存储服务级数据库指标" }),
    link("auth-db", "auth", "db", "data", "账号数据", null, null, { note: "未接入认证服务级数据库指标" }),
    link("realtime-db", "realtime", "db", "data", "变更广播", null, null, { note: "未接入实时服务级数据库指标" }),
    link("metrics-app", "metrics", "app", "probe", "健康探活", Number((1 / 15).toFixed(2)), null, { note: "采集器每 15 秒探活一次" }),
    link("metrics-db", "metrics", "db", "probe", "指标落库", Number((1 / 15).toFixed(2)), null, { note: "采集器每 15 秒写入一次" }),
  ];
}

function aiAggregate(rows: Array<Record<string, unknown>>) {
  const purposes = new Map<string, { calls: number; tokens: number; ms: number; errors: number; timed: number }>();
  const models = new Map<string, { calls: number; tokens: number; ms: number; timed: number }>();
  const calls60s = rows.filter((row) => Date.now() - Date.parse(str(row.created_at)) < 60_000).length;
  for (const row of rows) {
    const purpose = str(row.purpose, "unknown");
    const model = str(row.model, "unknown");
    const tokens = Number(row.input_tokens || 0) + Number(row.output_tokens || 0);
    const ms = Number(row.elapsed_ms || 0);
    const failed = str(row.status) !== "ok" && str(row.status) !== "success" && str(row.status) !== "completed";
    const p = purposes.get(purpose) || { calls: 0, tokens: 0, ms: 0, errors: 0, timed: 0 };
    p.calls += 1; p.tokens += tokens;
    if (ms > 0) { p.ms += ms; p.timed += 1; }
    if (failed) p.errors += 1;
    purposes.set(purpose, p);
    const m = models.get(model) || { calls: 0, tokens: 0, ms: 0, timed: 0 };
    m.calls += 1; m.tokens += tokens;
    if (ms > 0) { m.ms += ms; m.timed += 1; }
    models.set(model, m);
  }
  return {
    calls60s,
    byPurpose: [...purposes.entries()].map(([purpose, value]) => ({
      purpose, calls: value.calls, tokens: value.tokens,
      avgMs: value.timed ? Math.round(value.ms / value.timed) : null, errors: value.errors,
    })).sort((a, b) => b.calls - a.calls),
    byModel: [...models.entries()].map(([model, value]) => ({
      model, calls: value.calls, tokens: value.tokens,
      avgMs: value.timed ? Math.round(value.ms / value.timed) : null,
    })).sort((a, b) => b.calls - a.calls),
  };
}

function buildEvents(slow: SlowData): NexusEvent[] {
  const requests = requestMetricsSnapshot().recent_events || [];
  const events: NexusEvent[] = requests.map((event) => ({
    id: event.id,
    at: event.at,
    type: event.type,
    title: `${event.method} ${event.path}`,
    detail: `HTTP ${event.status} · ${event.ms}ms · ${event.category}`,
    source: event.category,
    target: "app",
    result: event.status >= 500 ? "error" : event.status >= 400 ? "warn" : "ok",
    durationMs: event.ms,
    trace: event.id,
    nodeId: event.category === "storage" ? "storage" : event.category === "auth" ? "auth" : event.category === "rest" ? "rest" : event.category === "download" ? "edge" : "app",
    linkId: event.category === "storage" ? "edge-storage" : event.category === "auth" ? "edge-auth" : event.category === "rest" ? "edge-rest" : "edge-app",
  }));
  for (const alert of slow.alerts.slice(0, 4)) {
    events.push({
      id: `alert-${alert.id}`,
      at: alert.last_seen_at,
      type: "alert",
      title: alert.title,
      detail: alert.detail || `级别 ${alert.level}`,
      source: "告警",
      target: "app",
      result: alert.level === "critical" || alert.level === "error" ? "error" : "warn",
      durationMs: null,
      trace: alert.id,
      nodeId: "app",
      linkId: null,
    });
  }
  for (const row of slow.revisions.slice(0, 6)) {
    const status = str(row.status);
    if (!["approved", "rejected", "error"].includes(status)) continue;
    events.push({
      id: `rev-${str(row.id)}`,
      at: str(row.finished_at) || str(row.created_at),
      type: "ai",
      title: `版本自动审核 · ${status === "approved" ? "通过" : status === "rejected" ? "驳回" : "异常"}`,
      detail: str(row.reason) || (status === "error" ? "审核任务异常，等待重试" : "AI 自动决策"),
      source: "AI 审核",
      target: "AI 调度",
      result: status === "approved" ? "ok" : status === "rejected" ? "warn" : "error",
      durationMs: int(row.elapsed_ms),
      trace: str(row.id),
      nodeId: "ai-worker",
      linkId: "app-ai",
    });
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 120);
}

/** 核心快照：1 秒可调用，重查询全部有 5–30 秒缓存。 */
export async function buildNexusSnapshot(db: SupabaseClient): Promise<NexusSnapshot> {
  const [agent, slow, dbStats] = await Promise.all([
    cached<AgentLive>("agent", 850, fetchAgent),
    loadSlow(db),
    cached("dbStats", 1400, () => fetchDbStats(db)),
  ]);
  const requestMetrics = requestMetricsSnapshot();
  const metric = slow.latestMetric || {};
  const host = agent?.host || {};
  const edge = agent?.edge;

  const server = {
    cpuPercent: num(host.cpu_percent) ?? num(metric.cpu_percent),
    load1: num(host.load1) ?? num(metric.load1),
    memPercent: num(host.mem_percent) ?? num(metric.mem_percent),
    memUsed: num(host.mem_used) ?? num(metric.mem_used),
    memTotal: num(host.mem_total) ?? num(metric.mem_total),
    memAvailable: num(host.mem_available) ?? num(metric.mem_available),
    swapUsed: num(host.swap_used) ?? num(metric.swap_used),
    swapTotal: num(host.swap_total) ?? num(metric.swap_total),
    diskPercent: num(host.disk_percent) ?? num(metric.disk_percent),
    diskUsed: num(host.disk_used) ?? num(metric.disk_used),
    diskTotal: num(host.disk_total) ?? num(metric.disk_total),
    netRxRate: num(host.net_rx_rate) ?? num(metric.net_rx_rate),
    netTxRate: num(host.net_tx_rate) ?? num(metric.net_tx_rate),
    tcpTotal: int(host.tcp_total) ?? int(metric.tcp_total),
    uptimeSeconds: int(host.uptime_seconds),
    capturedAt: str(agent?.captured_at) || str(metric.captured_at) || null,
  };

  const m1 = requestMetrics.m1;
  const trafficAvailable = Boolean(edge) || m1.requests > 0;
  const traffic = {
    available: trafficAvailable,
    windowSeconds: edge?.window_seconds || 60,
    requests: edge?.requests ?? m1.requests,
    rps: edge?.rps ?? m1.requests_per_second,
    bytesPerSecond: edge?.bytes_per_second ?? null,
    avgMs: edge?.avg_ms ?? m1.avg_ms,
    successRate: edge?.success_rate ?? (m1.requests ? Number((100 - m1.error_rate).toFixed(2)) : null),
    errors4xx: edge?.by_status?.["4xx"] ?? m1.errors4xx,
    errors5xx: edge?.by_status?.["5xx"] ?? m1.errors5xx,
    byCategory: edge?.by_category || {},
    byClient: edge?.by_client || {},
    series: (edge?.points || []).map((point) => ({
      t: point.t * 1000, requests: point.requests,
      errors: point.errors4xx + point.errors5xx, ms: 0,
    })),
    appSeries: (requestMetrics.seconds || []).map((point) => ({
      t: point.t * 1000, requests: point.requests, errors: point.errors,
      ms: point.requests ? Math.round(point.ms / point.requests) : 0,
    })),
    capturedAt: edge?.last_at || requestMetrics.collected_at,
  };

  const ai = aiAggregate(slow.aiUsage);
  const oneHour = slow.aiUsage.length;
  const aiErrors = slow.aiUsage.filter((row) => !["ok", "success", "completed"].includes(str(row.status))).length;
  const revisionCounts = { approved: 0, rejected: 0, error: 0, queued: 0, running: 0 };
  for (const row of slow.revisions) {
    const status = str(row.status);
    if (status in revisionCounts) revisionCounts[status as keyof typeof revisionCounts] += 1;
  }
  const revisionQueue = revisionCounts.queued + revisionCounts.running;
  const mediaByKind = slow.mediaDaily.map((row) => ({
    kind: str(row.kind), bytes: Number(row.bytes || 0), requests: Number(row.requests || 0),
  }));
  const uploadsReady = slow.uploads.filter((row) => str(row.status) === "ready");
  const uploadsFailed = slow.uploads.filter((row) => str(row.status) === "failed");
  const blockedRules = slow.rules.filter((row) => str(row.action) === "block").length;

  const partial: Partial<NexusSnapshot> = {
    server,
    db: dbStats as NexusSnapshot["db"],
    traffic,
    ai: {
      available: slow.aiUsage.length > 0,
      calls1h: oneHour,
      calls60s: ai.calls60s,
      tokens1h: slow.aiUsage.reduce((sum, row) => sum + Number(row.input_tokens || 0) + Number(row.output_tokens || 0), 0),
      errorRate1h: oneHour ? Number(((aiErrors / oneHour) * 100).toFixed(2)) : null,
      avgMs1h: (() => {
        const values = slow.aiUsage.map((row) => Number(row.elapsed_ms || 0)).filter((value) => value > 0);
        return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
      })(),
      byPurpose: ai.byPurpose,
      byModel: ai.byModel,
      queue: int(metric.ai_queue),
      running: null,
      revision: revisionCounts,
      reviewQueue: revisionQueue,
      revision24h: slow.revisions.length,
    },
    media: {
      active: int(metric.media_active),
      failed24h: uploadsFailed.length || null,
      uploadsToday: uploadsReady.length,
      uploadBytesToday: uploadsReady.reduce((sum, row) => sum + Number(row.file_size || 0), 0),
      downloadBytesToday: mediaByKind.reduce((sum, row) => sum + row.bytes, 0),
      downloadRequestsToday: mediaByKind.reduce((sum, row) => sum + row.requests, 0),
      byKind: mediaByKind,
    },
    security: {
      denied1m: edge ? edge.by_status?.["4xx"] ?? null : m1.errors4xx,
      blockedRules,
      activeRules: slow.rules.length,
      alertsOpen: slow.alerts.length,
      recentSecurityEvents: null,
    },
    content: slow.content,
    clients: {
      uniqueToday: slow.uniqueIps,
      onlineEstimate: null,
    },
  };

  partial.nodes = buildNodes(slow, partial, agent, dbStats);
  partial.links = buildLinks(partial, agent);
  partial.alerts = slow.alerts;
  partial.processes = slow.processes;
  partial.events = buildEvents(slow);

  const metricsCapturedAt = str(metric.captured_at) || null;
  const sources = {
    agent: Boolean(agent),
    db: Boolean(dbStats?.available),
    ai: slow.aiUsage.length > 0,
    geo: false,
    metricsCapturedAt,
    agentCapturedAt: str(agent?.captured_at) || null,
    dbCapturedAt: str(dbStats?.capturedAt) || null,
    agentError: holder.__heikaNexusAgentError || null,
  };

  const revision = hash(JSON.stringify([
    server, traffic.requests, traffic.byCategory, dbStats?.xactPerSecond,
    partial.ai?.queue, revisionCounts, slow.alerts.map((alert) => alert.id),
    slow.processes.map((process) => `${process.service_key}:${process.status}:${process.captured_at}`),
  ]));

  return {
    ts: new Date().toISOString(),
    revision,
    sources,
    ...partial,
  } as NexusSnapshot;
}

/** 场景二：全球网络态势。地理字段来自 ip_access_stats.country；为空时明确未接入。 */
export async function loadGlobeScene(db: SupabaseClient): Promise<NexusGlobeScene> {
  const today = dayKey();
  const [{ data: rows }, { data: tcp }, agent] = await Promise.all([
    db.from("ip_access_stats").select("ip,country,requests,bytes_out,status_4xx,last_seen,client").eq("day", today).order("requests", { ascending: false }).limit(300),
    db.from("tcp_snapshots").select("counts,total,captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    cached<AgentLive>("agentGlobe", 2000, fetchAgent),
  ]);
  const countries = new Map<string, { requests: number; ips: number }>();
  for (const row of rows || []) {
    const country = str(row.country);
    if (!country) continue;
    const current = countries.get(country) || { requests: 0, ips: 0 };
    current.requests += Number(row.requests || 0);
    current.ips += 1;
    countries.set(country, current);
  }
  const geoAvailable = countries.size > 0;
  return {
    available: true,
    geoAvailable,
    note: geoAvailable
      ? "国家/地区来自访问统计中已解析的 IP 归属，仅用于粗粒度地区分析，不代表用户精确位置。"
      : "当前 IP 统计未包含地理归属数据（ip_access_stats.country 为空），本场景显示真实连接与 IP 列表，但不绘制国家分布，避免伪造地理位置。",
    serverNode: null,
    countries: [...countries.entries()].map(([country, value]) => ({ country, requests: value.requests, ips: value.ips })).sort((a, b) => b.requests - a.requests),
    clients: (rows || []).map((row) => ({
      ip: str(row.ip), country: row.country || null, requests: Number(row.requests || 0),
      bytes: Number(row.bytes_out || 0), status4xx: Number(row.status_4xx || 0),
      lastSeen: row.last_seen || null, client: row.client || null,
    })),
    connections: {
      tcpTotal: int(tcp?.total) ?? int(agent?.host?.tcp_total),
      uniqueIpsToday: rows?.length ?? null,
    },
    http: agent?.edge?.by_status ? { byStatus: agent.edge.by_status, avgMs: agent.edge.avg_ms ?? null } : null,
  };
}

/** 场景四：资源数据城市。全部来自 heika_storage_summary / heika_storage_page。 */
export async function loadStorageScene(db: SupabaseClient): Promise<NexusStorageScene> {
  return (await cached<NexusStorageScene>("storageScene", 30_000, async () => {
    const [{ data: summary, error }, { data: page }, { data: health }] = await Promise.all([
      db.rpc("heika_storage_summary"),
      db.rpc("heika_storage_page", { p_limit: 24, p_offset: 0, p_sort: "size", p_desc: true }),
      db.rpc("heika_storage_health"),
    ]);
    if (error || !summary) {
      return {
        capturedAt: new Date().toISOString(), totalBytes: null, totalObjects: null, buildings: [], topFiles: [],
        health: null, note: "存储统计函数暂不可用，未生成任何估算建筑。",
      };
    }
    const byKind = (summary.by_kind || []) as Array<{ kind: string; objects: number; bytes: number }>;
    const byBucket = (summary.by_bucket || []) as Array<{ bucket: string; objects: number; bytes: number }>;
    const buildings = [
      ...byKind.map((row) => ({ key: `kind:${row.kind}`, label: row.kind, kind: row.kind, bytes: Number(row.bytes || 0), objects: Number(row.objects || 0), bucket: null })),
      ...byBucket.map((row) => ({ key: `bucket:${row.bucket}`, label: row.bucket, kind: "bucket", bytes: Number(row.bytes || 0), objects: Number(row.objects || 0), bucket: row.bucket })),
    ].filter((row) => row.bytes > 0 || row.objects > 0).sort((a, b) => b.bytes - a.bytes);
    const topFiles = ((page?.items || []) as Array<Record<string, unknown>>).map((row) => ({
      bucket: str(row.bucket_id), name: str(row.name), bytes: Number(row.bytes || 0), kind: str(row.kind, "other"),
      createdAt: (row.created_at as string) || null, state: str(row.state, "unknown"),
      refCount: Number(row.ref_count || 0), postId: (row.post_id as string) || null,
    }));
    return {
      capturedAt: str(summary.captured_at) || new Date().toISOString(),
      totalBytes: int(summary.bytes),
      totalObjects: int(summary.objects),
      buildings,
      topFiles,
      health: health ? {
        orphans: Number((health as Record<string, unknown>).orphan_count || 0),
        duplicates: Number((health as Record<string, unknown>).duplicate_count || 0),
        missing: Number((health as Record<string, unknown>).missing_count || 0),
        reclaimableBytes: Number((health as Record<string, unknown>).reclaimable_bytes || 0),
      } : null,
      note: "建筑体积与真实字节数按统一对数映射；同一对象同时出现在类型与桶两个维度，不是重复占用。",
    };
  }))!;
}

/** 场景六：内容知识宇宙。只取真实作品、合集、标签与互动统计。 */
export async function loadContentScene(db: SupabaseClient): Promise<NexusContentScene> {
  return (await cached<NexusContentScene>("contentScene", 30_000, async () => {
    const { data: posts } = await db.from("posts")
      .select("id,title,channel,tag_id,series_id,view_count,created_at")
      .eq("status", "published").order("view_count", { ascending: false }).limit(90);
    const ids = (posts || []).map((row) => row.id);
    const seriesIds = [...new Set((posts || []).map((row) => row.series_id).filter(Boolean))] as string[];
    const tagIds = [...new Set((posts || []).map((row) => row.tag_id).filter(Boolean))] as number[];
    const [likes, bookmarks, series, tags] = await Promise.all([
      ids.length ? db.from("post_like_stats").select("post_id,like_count").in("post_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("bookmarks").select("post_id").in("post_id", ids).limit(5000) : Promise.resolve({ data: [] }),
      seriesIds.length ? db.from("post_series").select("id,title").in("id", seriesIds) : Promise.resolve({ data: [] }),
      tagIds.length ? db.from("interest_tags").select("id,name").in("id", tagIds) : Promise.resolve({ data: [] }),
    ]);
    const likeMap = new Map((likes.data || []).map((row) => [row.post_id, Number(row.like_count || 0)]));
    const bookmarkMap = new Map<string, number>();
    for (const row of bookmarks.data || []) bookmarkMap.set(row.post_id, (bookmarkMap.get(row.post_id) || 0) + 1);
    const tagMap = new Map((tags.data || []).map((row) => [row.id, row.name]));
    const seriesMap = new Map((series.data || []).map((row) => [row.id, row.title]));
    const seriesCount = new Map<string, number>();
    for (const row of posts || []) if (row.series_id) seriesCount.set(row.series_id, (seriesCount.get(row.series_id) || 0) + 1);
    const nodePosts = (posts || []).map((row) => ({
      id: row.id, title: row.title, channel: row.channel,
      views: Number(row.view_count || 0), likes: likeMap.get(row.id) || 0, bookmarks: bookmarkMap.get(row.id) || 0,
      tagId: row.tag_id == null ? null : Number(row.tag_id), seriesId: row.series_id || null, createdAt: row.created_at,
    }));
    const edges: NexusContentScene["edges"] = [];
    for (const post of nodePosts) {
      if (post.seriesId) edges.push({ from: post.id, to: `series:${post.seriesId}`, kind: "series" });
      if (post.tagId != null) edges.push({ from: post.id, to: `tag:${post.tagId}`, kind: "tag" });
    }
    return {
      generatedAt: new Date().toISOString(),
      posts: nodePosts,
      series: [...seriesMap.entries()].map(([id, title]) => ({ id: `series:${id}`, title, posts: seriesCount.get(id) || 0 })),
      tags: tagIds.map((id) => ({ id, name: tagMap.get(id) || `#${id}`, posts: nodePosts.filter((post) => post.tagId === id).length })),
      edges,
      totals: {
        posts: nodePosts.length,
        views: nodePosts.reduce((sum, post) => sum + post.views, 0),
        likes: nodePosts.reduce((sum, post) => sum + post.likes, 0),
        series: seriesMap.size,
        tags: tagIds.length,
      },
    };
  }))!;
}

/** 场景五：AI 智能中枢。审核状态严格沿用当前自动审核链路。 */
export async function loadAiScene(db: SupabaseClient): Promise<NexusAiScene> {
  return (await cached<NexusAiScene>("aiScene", 10_000, async () => {
    const since1h = new Date(Date.now() - 3600_000).toISOString();
    const [{ data: usage }, { data: revisions }, { data: batches }] = await Promise.all([
      db.from("ai_usage_events").select("purpose,model,status,elapsed_ms,input_tokens,output_tokens,created_at").gte("created_at", since1h).limit(3000),
      db.from("ai_revision_reviews").select("id,status,decision,verdict,model,input_tokens,output_tokens,elapsed_ms,reason,created_at,finished_at").order("created_at", { ascending: false }).limit(40),
      db.from("ai_task_batches").select("id,status").in("status", ["queued", "running", "paused"]).limit(200),
    ]);
    const agg = aiAggregate((usage || []) as Array<Record<string, unknown>>);
    const counts = { approved: 0, rejected: 0, error: 0, queued: 0, running: 0 };
    for (const row of revisions || []) {
      const status = str(row.status);
      if (status in counts) counts[status as keyof typeof counts] += 1;
    }
    return {
      generatedAt: new Date().toISOString(),
      available: (usage || []).length > 0 || (revisions || []).length > 0,
      purposes: agg.byPurpose,
      models: agg.byModel,
      queue: { batches: batches?.length ?? null, revisionQueue: counts.queued + counts.running, running: null },
      revision: {
        ...counts,
        recent: (revisions || []).slice(0, 12).map((row) => ({
          id: str(row.id), status: str(row.status), decision: row.decision ? str((row.decision as Record<string, unknown>).decision) || null : null,
          createdAt: str(row.created_at), finishedAt: (row.finished_at as string) || null,
          model: row.model ? str(row.model) : null,
          tokens: Number(row.input_tokens || 0) + Number(row.output_tokens || 0),
          elapsedMs: int(row.elapsed_ms), reason: row.reason ? str(row.reason) : null,
        })),
      },
      note: "审核链路为 AI 自动审核：通过即发布，仅重大违规自动驳回；不存在人工版本待审队列。",
    };
  }))!;
}

/** 场景七：安全防御空间。 */
export async function loadSecurityScene(db: SupabaseClient): Promise<NexusSecurityScene> {
  return (await cached<NexusSecurityScene>("securityScene", 10_000, async () => {
    const today = dayKey();
    const [rules, ips, alerts, agent] = await Promise.all([
      db.from("access_rules").select("id,scope,target,action,reason,created_at,expires_at,active").eq("active", true).order("created_at", { ascending: false }).limit(200),
      db.from("ip_access_stats").select("ip,requests,status_4xx,last_seen,client").eq("day", today).gt("status_4xx", 0).order("status_4xx", { ascending: false }).limit(40),
      db.from("system_alerts").select("id", { count: "exact", head: true }).neq("status", "resolved"),
      cached<AgentLive>("agentSecurity", 2000, fetchAgent),
    ]);
    const ruleRows = (rules.data || []).map((row) => ({
      id: str(row.id), type: `${str(row.scope)}·${str(row.action)}`, value: str(row.target),
      reason: row.reason ? str(row.reason) : null, createdAt: str(row.created_at),
      expiresAt: (row.expires_at as string) || null, active: Boolean(row.active),
    }));
    const blocked = ruleRows.filter((row) => row.type.endsWith("block")).length;
    const denied4xx = (ips.data || []).reduce((sum, row) => sum + Number(row.status_4xx || 0), 0);
    return {
      generatedAt: new Date().toISOString(),
      rules: ruleRows,
      stats: {
        activeRules: ruleRows.length, blockedIps: blocked,
        denied1m: agent?.edge?.by_status?.["4xx"] ?? null,
        denied4xxToday: denied4xx,
        alertsOpen: alerts.count || 0,
      },
      layers: [
        { key: "edge", label: "边缘拦截", count: agent?.edge?.by_status?.["4xx"] ?? null, description: "4xx 响应（近 60 秒，来自 Caddy）" },
        { key: "rules", label: "访问规则", count: ruleRows.length, description: "当前生效的黑白名单与限速规则" },
        { key: "auth", label: "身份校验", count: null, description: "认证失败次数未单独落库" },
        { key: "permission", label: "权限校验", count: null, description: "服务端权限拒绝未单独计数" },
      ],
      recent: (ips.data || []).map((row) => ({
        ip: str(row.ip), requests: Number(row.requests || 0), status4xx: Number(row.status_4xx || 0),
        lastSeen: row.last_seen || null, client: row.client || null,
      })),
      note: "只有真实产生 4xx/5xx 或被规则拦截的请求才计为安全事件；普通访问不会被标记为攻击。",
    };
  }))!;
}

/** 场景八：时空回溯。历史快照 + 真实事件标记。 */
export async function loadHistory(db: SupabaseClient, from: string, to: string, bucketSeconds: number): Promise<NexusHistoryResponse> {
  const bucket = Math.max(30, Math.min(3600, Math.round(bucketSeconds || 60)));
  const [{ data: points, error }, alerts, deployments, revisions, failedUploads] = await Promise.all([
    db.rpc("heika_nexus_history", { p_from: from, p_to: to, p_bucket_seconds: bucket }),
    db.from("system_alerts").select("id,level,title,detail,first_seen_at,resolved_at").gte("first_seen_at", from).lte("first_seen_at", to).order("first_seen_at").limit(120),
    db.from("server_deployments").select("id,version,image,deployed_at,status,note").gte("deployed_at", from).lte("deployed_at", to).order("deployed_at").limit(60),
    db.from("ai_revision_reviews").select("id,status,reason,finished_at,created_at").in("status", ["rejected", "error"]).gte("created_at", from).lte("created_at", to).order("created_at").limit(100),
    db.from("upload_tasks").select("task_key,file_name,status,updated_at").eq("status", "failed").gte("updated_at", from).lte("updated_at", to).order("updated_at").limit(60),
  ]);
  if (error) throw new Error("历史聚合暂不可用");
  const rows = (points || []) as Array<Record<string, unknown>>;
  const markers = [
    ...(alerts.data || []).map((row) => ({
      id: `alert-${row.id}`, at: str(row.first_seen_at), type: "alert" as const,
      level: ["critical", "error"].includes(str(row.level)) ? "error" as const : "warn" as const,
      title: str(row.title), detail: str(row.detail),
    })),
    ...(deployments.data || []).map((row) => ({
      id: `deploy-${row.id}`, at: str(row.deployed_at), type: "deploy" as const, level: "info" as const,
      title: `版本发布 ${str(row.version)}`, detail: str(row.note) || str(row.image),
    })),
    ...(revisions.data || []).map((row) => ({
      id: `rev-${row.id}`, at: str(row.finished_at) || str(row.created_at), type: "ai" as const,
      level: str(row.status) === "error" ? "error" as const : "warn" as const,
      title: str(row.status) === "error" ? "AI 审核异常" : "AI 自动驳回",
      detail: str(row.reason),
    })),
    ...(failedUploads.data || []).map((row) => ({
      id: `upload-${row.task_key}`, at: str(row.updated_at), type: "media" as const, level: "warn" as const,
      title: "媒体任务失败", detail: str(row.file_name) || str(row.task_key),
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const mapped = rows.map((row) => ({
    bucketAt: str(row.bucket_at), cpuPercent: num(row.cpu_percent), memPercent: num(row.mem_percent),
    diskPercent: num(row.disk_percent), netRxRate: num(row.net_rx_rate), netTxRate: num(row.net_tx_rate),
    apiRequests: int(row.api_requests), apiP95Ms: num(row.api_p95_ms), tcpTotal: int(row.tcp_total),
    aiQueue: int(row.ai_queue), mediaActive: int(row.media_active), samples: int(row.samples) || 0,
  }));
  return {
    from, to, bucketSeconds: bucket, points: mapped, markers,
    coverage: {
      first: mapped[0]?.bucketAt || null,
      last: mapped[mapped.length - 1]?.bucketAt || null,
      samples: mapped.reduce((sum, point) => sum + point.samples, 0),
    },
    note: mapped.length ? undefined : "该时间范围没有监控快照。历史数据只能来自已落库的 system_metrics，不能用当前状态反推。",
  };
}

/** 场景四下钻：真实文件列表（复用现有存储分页函数）。 */
export async function loadStorageFiles(db: SupabaseClient, bucket: string | null, kind: string | null, offset: number) {
  const { data, error } = await db.rpc("heika_storage_page", {
    p_bucket: bucket || null,
    p_kind: kind && ["image", "video", "audio", "attachment", "apk", "other"].includes(kind) ? kind : null,
    p_limit: 30,
    p_offset: Math.max(0, offset),
    p_sort: "size",
    p_desc: true,
  });
  if (error) throw new Error("资源列表暂不可用");
  return data;
}
