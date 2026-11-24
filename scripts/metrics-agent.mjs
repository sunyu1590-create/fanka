#!/usr/bin/env node
/**
 * HEIKA 轻量监控采集器（fanka-metrics 容器）。
 *
 * - 每 20 秒：采集宿主/容器可见的 CPU、内存、磁盘、网络指标（/proc + fs.statfs）
 *   + 抓取 app 进程内 API 指标 + 服务健康探活，聚合写入 system_metrics。
 * - 每 60 秒：汇总上传任务成功率（upload_tasks），评估告警规则并写入 system_alerts
 *   （同类型未恢复告警去重合并，只累加 occurrences，防止通知轰炸）。
 * - 保留期限：原始指标 7 天，已恢复告警 30 天，防止监控自身占满磁盘。
 *
 * 所有数据均为真实采集，不生成任何模拟值；采集失败时对应字段留空。
 */

import fs from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WORKER_TOKEN = process.env.AI_TASK_WORKER_TOKEN || "";
const APP_BASE = process.env.METRICS_APP_URL || "http://app:3000";
const SAMPLE_INTERVAL_MS = 20_000;
const RETENTION_DAYS = 7;
const ALERT_RETENTION_DAYS = 30;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[metrics-agent] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 缺失，退出");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`REST ${path} ${response.status}: ${text.slice(0, 200)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ---------- 系统指标 ----------

let prevCpu = null;
let prevNet = null;
let prevNetAt = 0;

function readProcStat() {
  try {
    const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((sum, value) => sum + value, 0);
    return { idle, total };
  } catch {
    return null;
  }
}

function cpuPercent() {
  const current = readProcStat();
  if (!current) return null;
  if (!prevCpu) {
    prevCpu = current;
    return null;
  }
  const totalDelta = current.total - prevCpu.total;
  const idleDelta = current.idle - prevCpu.idle;
  prevCpu = current;
  if (totalDelta <= 0) return null;
  return Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1));
}

function readMemInfo() {
  try {
    const info = {};
    for (const line of fs.readFileSync("/proc/meminfo", "utf8").split("\n")) {
      const match = line.match(/^(\w+):\s+(\d+)/);
      if (match) info[match[1]] = Number(match[2]) * 1024;
    }
    const total = info.MemTotal || null;
    // Linux 可用内存应计入可回收缓存：MemAvailable 是内核给的口径。
    const available = info.MemAvailable ?? (info.MemFree || 0) + (info.Buffers || 0) + (info.Cached || 0);
    return {
      total,
      used: total ? total - available : null,
      available,
      percent: total ? Number((((total - available) / total) * 100).toFixed(1)) : null,
      swap_total: info.SwapTotal || 0,
      swap_used: (info.SwapTotal || 0) - (info.SwapFree || 0),
    };
  } catch {
    return {};
  }
}

function readLoad() {
  try {
    const [load1, load5, load15] = fs.readFileSync("/proc/loadavg", "utf8").trim().split(/\s+/).map(Number);
    return { load1, load5, load15 };
  } catch {
    return {};
  }
}

function readDisk() {
  try {
    const stat = fs.statfsSync("/");
    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    const used = total - free;
    const inodeTotal = stat.files;
    const inodeFree = stat.ffree;
    return {
      total,
      used,
      free,
      percent: total ? Number(((used / total) * 100).toFixed(1)) : null,
      inode_percent: inodeTotal ? Number((((inodeTotal - inodeFree) / inodeTotal) * 100).toFixed(1)) : null,
    };
  } catch {
    return {};
  }
}

function readNetRates() {
  try {
    const lines = fs.readFileSync("/proc/net/dev", "utf8").split("\n").slice(2);
    let rx = 0;
    let tx = 0;
    for (const line of lines) {
      const [iface, rest] = line.trim().split(":");
      if (!rest) continue;
      if (iface === "lo") continue;
      const fields = rest.trim().split(/\s+/).map(Number);
      rx += fields[0] || 0;
      tx += fields[8] || 0;
    }
    const now = Date.now();
    let rxRate = null;
    let txRate = null;
    if (prevNet && now > prevNetAt) {
      const seconds = (now - prevNetAt) / 1000;
      rxRate = Math.max(0, Math.round((rx - prevNet.rx) / seconds));
      txRate = Math.max(0, Math.round((tx - prevNet.tx) / seconds));
    }
    prevNet = { rx, tx };
    prevNetAt = now;
    return { rx_bytes: rx, tx_bytes: tx, rx_rate: rxRate, tx_rate: txRate };
  } catch {
    return {};
  }
}

// ---------- 探活与业务指标 ----------

async function probeApp(path, token) {
  const started = Date.now();
  try {
    const response = await fetch(`${APP_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    return { ok: response.ok, latency_ms: Date.now() - started, status: response.status };
  } catch (error) {
    return { ok: false, latency_ms: Date.now() - started, detail: error instanceof Error ? error.message : "unreachable" };
  }
}

async function collectApiMetrics() {
  const probe = await probeApp("/api/v1/internal/metrics", WORKER_TOKEN);
  if (!probe.ok) return { api_requests: null, api_errors: null, api_avg_ms: probe.latency_ms, api_p95_ms: null, probe };
  try {
    const response = await fetch(`${APP_BASE}/api/v1/internal/metrics`, { headers: { Authorization: `Bearer ${WORKER_TOKEN}` }, signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    const m5 = payload?.data?.m5;
    return {
      api_requests: m5?.requests ?? null,
      api_errors: (m5?.errors4xx ?? 0) + (m5?.errors5xx ?? 0),
      api_avg_ms: m5?.avg_ms ?? null,
      api_p95_ms: m5?.p95_ms ?? null,
    };
  } catch {
    return { api_requests: null, api_errors: null, api_avg_ms: null, api_p95_ms: null };
  }
}

async function collectUploadStats() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const rows = await rest(`upload_tasks?select=status&created_at=gte.${encodeURIComponent(since)}&limit=5000`);
    const total = rows?.length || 0;
    const ready = rows?.filter((row) => row.status === "ready").length || 0;
    const failed = rows?.filter((row) => row.status === "failed").length || 0;
    return {
      upload_tasks: total,
      upload_failed: failed,
      upload_success_rate: total ? Number(((ready / total) * 100).toFixed(1)) : null,
    };
  } catch {
    return { upload_tasks: null, upload_failed: null, upload_success_rate: null };
  }
}

// ---------- 告警规则 ----------

const ALERT_RULES = [
  { type: "cpu_high", level: "warning", title: "CPU 持续偏高", test: (m) => m.cpu_percent != null && m.cpu_percent > 80, detail: (m) => `CPU ${m.cpu_percent}%` },
  { type: "mem_low", level: "critical", title: "可用内存不足", test: (m) => m.mem_percent != null && m.mem_percent > 85, detail: (m) => `内存使用 ${m.mem_percent}%` },
  { type: "disk_high", level: "critical", title: "磁盘使用率过高", test: (m) => m.disk_percent != null && m.disk_percent > 85, detail: (m) => `磁盘 ${m.disk_percent}%` },
  { type: "api_errors", level: "warning", title: "API 错误率偏高", test: (m) => m.api_requests > 20 && m.api_errors != null && (m.api_errors / m.api_requests) * 100 > 5, detail: (m) => `错误率 ${((m.api_errors / Math.max(1, m.api_requests)) * 100).toFixed(1)}%（${m.api_errors}/${m.api_requests}）` },
  { type: "upload_first_fail", level: "warning", title: "上传成功率偏低", test: (m) => m.upload_success_rate != null && m.upload_tasks >= 10 && m.upload_success_rate < 90, detail: (m) => `24h 成功率 ${m.upload_success_rate}%（样本 ${m.upload_tasks}）` },
  { type: "service_down", level: "critical", title: "服务健康检查失败", test: (_m, services) => services && Object.values(services).some((item) => item && item.ok === false), detail: (_m, services) => Object.entries(services || {}).filter(([, item]) => item?.ok === false).map(([name, item]) => `${name}: ${item.detail || "不可用"}`).join("; ") },
];

async function evaluateAlerts(metrics, services) {
  for (const rule of ALERT_RULES) {
    let triggered = false;
    try {
      triggered = Boolean(rule.test(metrics, services));
    } catch {
      triggered = false;
    }
    const existing = await rest(`system_alerts?alert_type=eq.${encodeURIComponent(rule.type)}&status=neq.resolved&limit=1`).catch(() => null);
    const row = Array.isArray(existing) ? existing[0] : null;
    if (triggered) {
      const snapshot = { ...metrics, services };
      if (row) {
        await rest(`system_alerts?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ last_seen_at: new Date().toISOString(), occurrences: (row.occurrences || 1) + 1, metric_snapshot: snapshot, detail: rule.detail(metrics, services) }),
        }).catch(() => {});
      } else {
        await rest("system_alerts", {
          method: "POST",
          body: JSON.stringify({
            alert_type: rule.type, level: rule.level, title: rule.title,
            detail: rule.detail(metrics, services), metric_snapshot: snapshot, status: "open",
          }),
        }).catch(() => {});
        console.warn(`[metrics-agent] 新告警：${rule.title} — ${rule.detail(metrics, services)}`);
      }
    } else if (row) {
      await rest(`system_alerts?id=eq.${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString() }),
      }).catch(() => {});
    }
  }
}

async function cleanup() {
  const metricsCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  await rest(`system_metrics?captured_at=lt.${encodeURIComponent(metricsCutoff)}`, { method: "DELETE" }).catch(() => {});
  const alertCutoff = new Date(Date.now() - ALERT_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  await rest(`system_alerts?status=eq.resolved&resolved_at=lt.${encodeURIComponent(alertCutoff)}`, { method: "DELETE" }).catch(() => {});
}

// ---------- 主循环 ----------

let tick = 0;

async function sample() {
  tick += 1;
  const metrics = {
    captured_at: new Date().toISOString(),
    cpu_percent: cpuPercent(),
    ...readLoad(),
    ...readMemInfo(),
    ...readDisk(),
    ...readNetRates(),
    ...(await collectApiMetrics()),
    ...(tick % 3 === 1 ? await collectUploadStats() : {}),
    container_info: { collector: "fanka-metrics", pid: process.pid, node: process.version },
  };
  try {
    await rest("system_metrics", { method: "POST", body: JSON.stringify(metrics) });
  } catch (error) {
    console.error("[metrics-agent] 写入 system_metrics 失败：", error instanceof Error ? error.message : error);
  }

  const services = {
    web_api: await probeApp("/api/v1/internal/health", WORKER_TOKEN),
    app_root: await probeApp("/api/v1/app-version", null),
  };
  if (tick % 3 === 1) {
    await evaluateAlerts(metrics, services);
  }
  if (tick % 30 === 0) {
    await cleanup();
  }
  if (tick % 15 === 0) {
    console.log(`[metrics-agent] cpu=${metrics.cpu_percent}% mem=${metrics.mem_percent}% disk=${metrics.disk_percent}% api_p95=${metrics.api_p95_ms}ms`);
  }
}

console.log("[metrics-agent] 启动，采集间隔", SAMPLE_INTERVAL_MS, "ms");
await sample();
setInterval(() => {
  sample().catch((error) => console.error("[metrics-agent] 采样异常：", error instanceof Error ? error.message : error));
}, SAMPLE_INTERVAL_MS);
