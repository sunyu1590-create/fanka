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
  return { startedAt: Date.now(), requests: 0, errors4xx: 0, errors5xx: 0, durationsMs: [], lastErrors: [] };
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
};

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

function noteStream(durationMs: number, status: number, path: string, method: string) {
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
  if (clean.startsWith("/api/v1/admin/nexus/stream") || clean.startsWith("/api/v1/internal/")) return;
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
  });
  if (stream.events.length > 160) stream.events.splice(0, stream.events.length - 160);
}

export function recordRequest(durationMs: number, status: number, path = "", method = "GET") {
  noteStream(durationMs, status, path, method);
  for (const window of Object.values(windows)) {
    window.requests += 1;
    if (status >= 500) window.errors5xx += 1;
    else if (status >= 400) window.errors4xx += 1;
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
    return {
      window_seconds: Math.round(spanSeconds),
      requests: window.requests,
      requests_per_second: Number((window.requests / spanSeconds).toFixed(2)),
      errors4xx: window.errors4xx,
      errors5xx: window.errors5xx,
      error_rate: window.requests ? Number((((window.errors4xx + window.errors5xx) / window.requests) * 100).toFixed(2)) : 0,
      avg_ms: sorted.length ? Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) : null,
      p95_ms: percentile(sorted, 95),
      recent_5xx: window.lastErrors.slice(-5),
    };
  };
  const seconds = [...stream.seconds.values()].sort((a, b) => a.t - b.t).slice(-90);
  const recentEvents = stream.events.slice(-80).reverse();
  return {
    m1: summarize(windows.m1),
    m5: summarize(windows.m5),
    m15: summarize(windows.m15),
    seconds,
    recent_events: recentEvents,
    collected_at: new Date().toISOString(),
  };
}
