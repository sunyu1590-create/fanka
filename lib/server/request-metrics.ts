/**
 * 进程内请求指标（由 instrumentation.ts 挂载到 Node HTTP 层）。
 * 只做计数与延迟采样，不阻塞请求路径；监控采集器通过
 * /api/v1/internal/metrics 周期抓取后写入 system_metrics。
 */

const SAMPLE_LIMIT = 512;

type Window = {
  startedAt: number;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  durationsMs: number[];
  lastErrors: { at: number; status: number; path: string }[];
  /** 按业务分类的请求计数，用于把外部访问 / 后台管理 / Nexus 自身监控拆开统计。 */
  groups: Partial<Record<RequestGroup, number>>;
};

const windows: Record<"m1" | "m5" | "m15", Window> = (() => {
  // 计数器挂在 globalThis 上：instrumentation 钩子与路由可能拿到不同模块实例，
  // 必须共享同一份窗口，否则监控端看到的永远是 0。
  const key = "__heika_request_metric_windows";
  const holder = globalThis as unknown as Record<string, Record<"m1" | "m5" | "m15", Window> | undefined>;
  if (!holder[key]) holder[key] = { m1: newWindow(), m5: newWindow(), m15: newWindow() };
  return holder[key]!;
})();

function newWindow(): Window {
  return { startedAt: Date.now(), requests: 0, errors4xx: 0, errors5xx: 0, durationsMs: [], lastErrors: [], groups: {} };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

export type RequestEvent = {
  id: string;
  at: string;
  type: "request" | "security";
  method: string;
  path: string;
  status: number;
  ms: number;
  category: string;
  /** 事件分类：决定进入业务事件流还是内部监控事件流。 */
  group: RequestGroup;
};

/**
 * 事件分类体系。业务事件流默认只展示 `group` 属于 BUSINESS_GROUPS 的条目，
 * HEIKA Nexus 自身的监控轮询归入 "nexus"，不与真实用户行为混排，
 * 但原始事件与计数一律保留，不做删除或伪装。
 */
export type RequestGroup =
  | "business" | "client" | "content" | "media" | "ai"
  | "service" | "admin" | "nexus" | "health" | "security" | "system";

export const GROUP_LABELS: Record<RequestGroup, string> = {
  business: "普通用户访问",
  client: "客户端检查与配置",
  content: "内容浏览与交互",
  media: "媒体上传下载",
  ai: "AI 调用与审核",
  service: "数据库与内部服务",
  admin: "后台管理请求",
  nexus: "Nexus 内部监控",
  health: "健康检查",
  security: "安全检测与异常",
  system: "系统告警",
};

/** 默认业务事件流包含的分类（Nexus 自身监控、健康检查、静态资源不在其中）。 */
const BUSINESS_GROUPS: RequestGroup[] = ["business", "client", "content", "media", "ai", "service", "admin", "security"];

export function isBusinessGroup(group: RequestGroup) {
  return BUSINESS_GROUPS.includes(group);
}

/** 内部监控与探活：不进业务流，但保留独立计数与独立事件流。 */
export function isInternalGroup(group: RequestGroup) {
  return group === "nexus" || group === "health";
}

const CONTENT_PREFIXES = [
  "/api/v1/posts", "/api/v1/comments", "/api/v1/search", "/api/v1/topics", "/api/v1/tags",
  "/api/v1/series", "/api/v1/collections", "/api/v1/bookmark-collections", "/api/v1/recommendations",
  "/api/v1/rankings", "/api/v1/highlights", "/api/v1/co-explore", "/api/v1/exploration",
  "/api/v1/categories", "/api/v1/profiles", "/api/v1/me", "/api/v1/messages", "/api/v1/notifications",
];
const CLIENT_PREFIXES = ["/api/v1/app-version", "/api/v1/app-download", "/api/v1/settings", "/api/v1/announcement", "/api/v1/official-notices"];
const AI_PREFIXES = ["/api/v1/ai", "/api/v1/ai-space", "/api/v1/ai-resource-types", "/api/v1/composer", "/api/v1/publish-tasks"];
const MEDIA_PREFIXES = ["/api/v1/media", "/api/v1/attachments", "/api/v1/deck", "/storage/v1/", "/dl/", "/api/v1/cover-templates"];
const HEALTH_PATHS = ["/api/health", "/healthz", "/health", "/api/v1/ping", "/api/v1/health"];

/**
 * 路径 → 分类。只看路径前缀的显式规则，不做 UA 或模型猜测；
 * 未命中任何规则的 `/api/` 与页面请求按普通访问处理。
 */
export function groupOf(path: string, status?: number): RequestGroup {
  const clean = path.split("?")[0];
  if (status === 401 || status === 403 || status === 429) return "security";
  if (HEALTH_PATHS.includes(clean)) return "health";
  if (clean.startsWith("/api/v1/admin/nexus") || clean.startsWith("/api/v1/internal/")) return "nexus";
  if (clean.startsWith("/api/v1/admin/")) return "admin";
  if (clean.startsWith("/rest/v1/") || clean.startsWith("/realtime/v1/") || clean.startsWith("/auth/v1/")) return "service";
  if (CLIENT_PREFIXES.some((prefix) => clean.startsWith(prefix))) return "client";
  if (MEDIA_PREFIXES.some((prefix) => clean.startsWith(prefix))) return "media";
  if (AI_PREFIXES.some((prefix) => clean.startsWith(prefix))) return "ai";
  if (CONTENT_PREFIXES.some((prefix) => clean.startsWith(prefix))) return "content";
  return "business";
}

type SecondBucket = { t: number; requests: number; errors: number; ms: number; by_category: Record<string, number> };

type StreamStore = { seconds: Map<number, SecondBucket>; events: RequestEvent[]; seq: number };

const streamHolder = globalThis as unknown as { __heikaRequestStream?: StreamStore };
if (!streamHolder.__heikaRequestStream) streamHolder.__heikaRequestStream = { seconds: new Map(), events: [], seq: 0 };
const stream = streamHolder.__heikaRequestStream!;

function categoryOf(path: string) {
  if (path.startsWith("/api/v1/admin/nexus")) return "nexus";
  if (path.startsWith("/api/")) return "api";
  if (path.startsWith("/rest/v1/")) return "rest";
  if (path.startsWith("/storage/v1/")) return "storage";
  if (path.startsWith("/auth/v1/")) return "auth";
  if (path.startsWith("/realtime/v1/")) return "realtime";
  if (path.startsWith("/dl/")) return "download";
  if (path.startsWith("/_next/") || path.startsWith("/assets/") || path.startsWith("/icons/") || path === "/favicon.ico") return "static";
  return "page";
}

function noteStream(durationMs: number, status: number, path: string, method: string, group: RequestGroup) {
  const clean = path.split("?")[0].slice(0, 180);
  const category = categoryOf(clean);
  const second = Math.floor(Date.now() / 1000);
  const bucket = stream.seconds.get(second) || { t: second, requests: 0, errors: 0, ms: 0, by_category: {} };
  bucket.requests += 1;
  bucket.ms += durationMs;
  if (status >= 400) bucket.errors += 1;
  bucket.by_category[category] = (bucket.by_category[category] || 0) + 1;
  stream.seconds.set(second, bucket);
  const cutoff = second - 120;
  for (const key of stream.seconds.keys()) if (key < cutoff) stream.seconds.delete(key);

  // 事件流只保留可确认的入口请求，不拼装跨服务调用链。
  // 静态资源、SSE 自身、内部探活不进入事件列表，避免刷屏。
  if (clean.startsWith("/_next/") || clean.startsWith("/assets/") || clean.startsWith("/icons/") || clean === "/favicon.ico") return;
  if (clean.startsWith("/api/v1/admin/nexus/stream")) return;
  stream.seq += 1;
  stream.events.push({
    id: `req-${Date.now().toString(36)}-${stream.seq.toString(36)}`,
    at: new Date().toISOString(),
    type: status === 401 || status === 403 || status === 429 ? "security" : "request",
    method: method.slice(0, 8),
    path: clean,
    status,
    ms: Math.round(durationMs),
    category,
    group,
  });
  // 环形缓冲加大到 320：业务事件与内部监控事件分开取用，各自都需要足够窗口。
  if (stream.events.length > 320) stream.events.splice(0, stream.events.length - 320);
}

export function recordRequest(durationMs: number, status: number, path = "", method = "GET") {
  const group = groupOf(path, status);
  noteStream(durationMs, status, path, method, group);
  for (const window of Object.values(windows)) {
    window.requests += 1;
    if (status >= 500) window.errors5xx += 1;
    else if (status >= 400) window.errors4xx += 1;
    window.groups[group] = (window.groups[group] || 0) + 1;
    window.durationsMs.push(durationMs);
    if (window.durationsMs.length > SAMPLE_LIMIT) window.durationsMs.shift();
    if (status >= 500) {
      window.lastErrors.push({ at: Date.now(), status, path: path.slice(0, 120) });
      if (window.lastErrors.length > 20) window.lastErrors.shift();
    }
    // 按时间滚动清窗（近似 1/5/15 分钟）。
    const span = Date.now() - window.startedAt;
    const limitMs = window === windows.m1 ? 60_000 : window === windows.m5 ? 300_000 : 900_000;
    if (span > limitMs) {
      const fresh = newWindow();
      Object.assign(window, fresh);
    }
  }
}

export function requestMetricsSnapshot() {
  const summarize = (window: Window) => {
    const sorted = [...window.durationsMs].sort((a, b) => a - b);
    const spanSeconds = Math.max(1, (Date.now() - window.startedAt) / 1000);
    const rate = (count: number) => Number((count / spanSeconds).toFixed(2));
    const groups = window.groups;
    const internal = (groups.nexus || 0) + (groups.health || 0);
    const admin = groups.admin || 0;
    // 总负载 = 全部入口请求；外部访问 = 总数 - 内部监控 - 后台管理。
    const external = Math.max(0, window.requests - internal - admin);
    return {
      window_seconds: Math.round(spanSeconds),
      requests: window.requests,
      requests_per_second: rate(window.requests),
      external_requests: external,
      external_requests_per_second: rate(external),
      admin_requests: admin,
      admin_requests_per_second: rate(admin),
      internal_requests: internal,
      internal_requests_per_second: rate(internal),
      groups: { ...groups },
      errors4xx: window.errors4xx,
      errors5xx: window.errors5xx,
      error_rate: window.requests ? Number((((window.errors4xx + window.errors5xx) / window.requests) * 100).toFixed(2)) : 0,
      avg_ms: sorted.length ? Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) : null,
      p95_ms: percentile(sorted, 95),
      recent_5xx: window.lastErrors.slice(-5),
    };
  };
  const seconds = [...stream.seconds.values()].sort((a, b) => a.t - b.t).slice(-90);
  // 业务流只给真实业务事件；Nexus 自身的监控轮询单独取用，不混排但也不丢弃。
  const all = stream.events;
  const businessEvents = all.filter((event) => !isInternalGroup(event.group ?? "business")).slice(-80).reverse();
  const internalEvents = all.filter((event) => isInternalGroup(event.group ?? "business")).slice(-60).reverse();
  return {
    m1: summarize(windows.m1),
    m5: summarize(windows.m5),
    m15: summarize(windows.m15),
    seconds,
    recent_events: businessEvents,
    recent_internal: internalEvents,
    collected_at: new Date().toISOString(),
  };
}
