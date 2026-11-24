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

const windows: Record<"m1" | "m5" | "m15", Window> = {
  m1: newWindow(),
  m5: newWindow(),
  m15: newWindow(),
};

function newWindow(): Window {
  return { startedAt: Date.now(), requests: 0, errors4xx: 0, errors5xx: 0, durationsMs: [], lastErrors: [] };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

export function recordRequest(durationMs: number, status: number, path = "") {
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
  return { m1: summarize(windows.m1), m5: summarize(windows.m5), m15: summarize(windows.m15), collected_at: new Date().toISOString() };
}
