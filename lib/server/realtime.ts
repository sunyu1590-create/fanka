/**
 * 管理员实时数据聚合层。
 *
 * 设计要点（对应 Control Center 2.1 第五～七节）：
 * - 全站只有一个聚合入口：所有后台页面共用 /api/v1/admin/realtime 的快照，
 *   前端不再各卡片独立轮询。
 * - 高频字段（CPU/内存/网络/活跃任务）走 1 秒快照；高成本统计（今日流量、
 *   资源容量、历史聚合）走 5 秒缓存，绝不每秒全表扫描。
 * - 快照在服务端做 900ms 单飞缓存：多个管理员同时在线也只触发一轮查询。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { requestMetricsSnapshot } from "./request-metrics";

export type RealtimeServer = {
  captured_at: string | null;
  cpu_percent: number | null;
  load1: number | null;
  mem_percent: number | null;
  mem_used: number | null;
  mem_total: number | null;
  disk_percent: number | null;
  disk_used: number | null;
  disk_total: number | null;
  net_rx_rate: number | null;
  net_tx_rate: number | null;
};

export type RealtimeTask = {
  key: string;
  kind: "upload" | "download" | "review" | "batch" | "scan" | "publish";
  title: string;
  status: string;
  progress: number | null;
  bytes_sent: number | null;
  file_size: number | null;
  updated_at: string;
  meta?: string | null;
};

export type RealtimeSnapshot = {
  ts: string;
  revision: number;
  server: RealtimeServer | null;
  live: { window_seconds: number; requests: number; avg_ms: number | null; p95_ms: number | null; error_rate: number | null };
  counts: {
    review: number;
    reviewAnomaly: number;
    report: number;
    uploadActive: number;
    uploadFailed: number;
    tasksRunning: number;
    scanRunning: number;
    alerts: number;
  };
  traffic: {
    day: string;
    uploadBytes: number;
    uploadFiles: number;
    downloadBytes: number;
    downloadRequests: number;
    ingestAt: string | null;
    firstDay: string | null;
  };
  tasks: RealtimeTask[];
  alerts: Array<{ id: string; level: string; title: string; detail: string; last_seen_at: string }>;
  processes: Array<{ service_key: string; label: string; scope: string; status: string; pid: number | null; process_count: number; cpu_percent: number | null; mem_bytes: number | null; started_at: string | null; captured_at: string }>;
};

type Cache = { at: number; value: RealtimeSnapshot; inflight: Promise<RealtimeSnapshot> | null };

const holder = globalThis as unknown as { __heikaRealtimeCache?: Cache };
if (!holder.__heikaRealtimeCache) holder.__heikaRealtimeCache = { at: 0, value: null as unknown as RealtimeSnapshot, inflight: null };

function dayKey(date = new Date()) {
  // 统一按业务时区（Asia/Shanghai）切日，避免不同页面「今天」口径不一致。
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function hash(input: string) {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) value = ((value << 5) - value + input.charCodeAt(index)) | 0;
  return Math.abs(value);
}

/** 今日流量与任务计数成本略高，单独 5 秒缓存。 */
type SlowCache = { at: number; traffic: RealtimeSnapshot["traffic"] };
const slowHolder = globalThis as unknown as { __heikaSlowCache?: SlowCache };
if (!slowHolder.__heikaSlowCache) slowHolder.__heikaSlowCache = { at: 0, traffic: { day: dayKey(), uploadBytes: 0, uploadFiles: 0, downloadBytes: 0, downloadRequests: 0, ingestAt: null, firstDay: null } };

async function slowStats(db: SupabaseClient, day: string) {
  const cache = slowHolder.__heikaSlowCache!;
  if (Date.now() - cache.at < 5_000) return cache.traffic;

  const since = `${day}T00:00:00+08:00`;
  const [uploads, traffic, meta, first] = await Promise.all([
    db.from("upload_tasks").select("status,file_size,bytes_sent").gte("created_at", since).limit(5000),
    db.from("media_traffic_daily").select("kind,requests,bytes").eq("day", day),
    db.from("media_traffic_meta").select("key,value").eq("key", "last_ingest_at").maybeSingle(),
    db.from("media_traffic_meta").select("key,value").eq("key", "first_ingest_at").maybeSingle(),
  ]);

  const uploadRows = uploads.data || [];
  const uploadBytes = uploadRows.filter((row) => row.status === "ready").reduce((sum, row) => sum + Number(row.file_size || 0), 0);
  let downloadBytes = 0;
  let downloadRequests = 0;
  for (const row of traffic.data || []) {
    if (row.kind === "apk" || row.kind === "attachment" || row.kind === "image" || row.kind === "video") {
      downloadBytes += Number(row.bytes || 0);
      downloadRequests += Number(row.requests || 0);
    }
  }
  const trafficValue: RealtimeSnapshot["traffic"] = {
    day,
    uploadBytes,
    uploadFiles: uploadRows.filter((row) => row.status === "ready").length,
    downloadBytes,
    downloadRequests,
    ingestAt: meta.data?.value || null,
    firstDay: first.data?.value ? String(first.data.value).slice(0, 10) : null,
  };
  cache.at = Date.now();
  cache.traffic = trafficValue;
  return trafficValue;
}

async function build(db: SupabaseClient): Promise<RealtimeSnapshot> {
  const day = dayKey();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [metric, review, anomaly, uploads, failed, batches, scans, alerts, processes, traffic, reports] = await Promise.all([
    db.from("system_metrics").select("captured_at,cpu_percent,load1,mem_percent,mem_used,mem_total,disk_percent,disk_used,disk_total,net_rx_rate,net_tx_rate").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("ai_task_items").select("id", { count: "exact", head: true }).eq("status", "review").is("archived_at", null),
    db.from("ai_task_items").select("id", { count: "exact", head: true }).eq("status", "review").is("post_id", null).is("archived_at", null),
    db.from("upload_tasks").select("task_key,file_name,status,progress,bytes_sent,file_size,updated_at,client_type").in("status", ["uploading", "queued", "verifying", "created", "preparing", "compressing", "retrying"]).order("updated_at", { ascending: false }).limit(8),
    db.from("upload_tasks").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since24h),
    db.from("ai_task_batches").select("id,task_type,status,total_count,completed_count,review_count,current_post_id,updated_at").in("status", ["running", "queued", "paused"]).order("updated_at", { ascending: false }).limit(4),
    db.from("admin_resource_scans").select("id,status,scanned_count,orphan_count,duplicate_count,created_at").in("status", ["running", "queued"]).order("created_at", { ascending: false }).limit(2),
    db.from("system_alerts").select("id,level,title,detail,last_seen_at").neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(5),
    db.from("system_processes").select("service_key,label,scope,status,pid,process_count,cpu_percent,mem_bytes,started_at,captured_at").order("cpu_percent", { ascending: false }).limit(24),
    slowStats(db, day),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const tasks: RealtimeTask[] = [];
  for (const row of uploads.data || []) {
    tasks.push({
      key: `upload:${row.task_key}`,
      kind: "upload",
      title: row.file_name || `上传任务 ${String(row.task_key).slice(0, 8)}`,
      status: String(row.status),
      progress: row.progress == null ? null : Number(row.progress),
      bytes_sent: row.bytes_sent == null ? null : Number(row.bytes_sent),
      file_size: row.file_size == null ? null : Number(row.file_size),
      updated_at: String(row.updated_at),
      meta: row.client_type || null,
    });
  }
  for (const row of batches.data || []) {
    const total = Number(row.total_count || 0);
    tasks.push({
      key: `batch:${row.id}`,
      kind: row.task_type === "review_pending" ? "review" : "batch",
      title: row.task_type === "review_pending" ? "AI 内容审核" : row.task_type === "classification" ? "AI 自动分类" : "AI 总结生成",
      status: String(row.status),
      progress: total ? Math.round((Number(row.completed_count || 0) / total) * 100) : null,
      bytes_sent: null,
      file_size: null,
      updated_at: String(row.updated_at),
      meta: `${Number(row.completed_count || 0)}/${total}`,
    });
  }
  for (const row of scans.data || []) {
    tasks.push({
      key: `scan:${row.id}`,
      kind: "scan",
      title: "资源健康扫描",
      status: String(row.status),
      progress: null,
      bytes_sent: null,
      file_size: null,
      updated_at: String(row.created_at),
      meta: `已扫描 ${Number(row.scanned_count || 0)} 项`,
    });
  }

  const counts = {
    review: review.count || 0,
    reviewAnomaly: anomaly.count || 0,
    report: reports.count || 0,
    uploadActive: (uploads.data || []).length,
    uploadFailed: failed.count || 0,
    tasksRunning: tasks.filter((task) => ["running", "queued", "uploading", "verifying", "retrying", "preparing", "compressing"].includes(task.status)).length,
    scanRunning: (scans.data || []).length,
    alerts: (alerts.data || []).length,
  };

  // 卡片标注「5 分钟窗口」就必须取 m5，否则刚重启后 m1 为空、页面显示「暂无采样」，
  // 而同一时刻 m5 里明明有真实请求。m1 仅作为 m5 不可用时的兜底。
  type MetricsWindow = { requests: number; avg_ms: number | null; p95_ms: number | null; error_rate: number };
  const liveRaw = requestMetricsSnapshot() as { m1?: MetricsWindow; m5?: MetricsWindow };
  const liveWindow = liveRaw.m5 ?? liveRaw.m1;
  const live = {
    window_seconds: 300,
    requests: Number(liveWindow?.requests || 0),
    avg_ms: liveWindow?.avg_ms ?? null,
    p95_ms: liveWindow?.p95_ms ?? null,
    // request-metrics 的 error_rate 是百分数（0-100），前端按 0-1 小数渲染，这里换算一次，
    // 否则 0.44% 会被显示成 44.0%。
    error_rate: liveWindow?.error_rate == null ? null : Number(liveWindow.error_rate) / 100,
  };
  const revision = hash(JSON.stringify([
    counts,
    uploads.data?.map((row) => `${row.task_key}:${row.status}:${row.progress}:${row.bytes_sent}`),
    batches.data?.map((row) => `${row.id}:${row.completed_count}:${row.status}`),
    alerts.data?.map((row) => `${row.id}:${row.last_seen_at}`),
    traffic.uploadBytes,
    traffic.downloadBytes,
  ]));

  return {
    ts: new Date().toISOString(),
    revision,
    server: metric.data
      ? {
          captured_at: metric.data.captured_at,
          cpu_percent: metric.data.cpu_percent == null ? null : Number(metric.data.cpu_percent),
          load1: metric.data.load1 == null ? null : Number(metric.data.load1),
          mem_percent: metric.data.mem_percent == null ? null : Number(metric.data.mem_percent),
          mem_used: metric.data.mem_used == null ? null : Number(metric.data.mem_used),
          mem_total: metric.data.mem_total == null ? null : Number(metric.data.mem_total),
          disk_percent: metric.data.disk_percent == null ? null : Number(metric.data.disk_percent),
          disk_used: metric.data.disk_used == null ? null : Number(metric.data.disk_used),
          disk_total: metric.data.disk_total == null ? null : Number(metric.data.disk_total),
          net_rx_rate: metric.data.net_rx_rate == null ? null : Number(metric.data.net_rx_rate),
          net_tx_rate: metric.data.net_tx_rate == null ? null : Number(metric.data.net_tx_rate),
        }
      : null,
    live,
    counts,
    traffic,
    tasks,
    alerts: (alerts.data || []).map((row) => ({ id: row.id, level: row.level, title: row.title, detail: row.detail, last_seen_at: row.last_seen_at })),
    processes: (processes.data || []).map((row) => ({
      service_key: row.service_key,
      label: row.label,
      scope: row.scope,
      status: row.status,
      pid: row.pid == null ? null : Number(row.pid),
      process_count: Number(row.process_count || 1),
      cpu_percent: row.cpu_percent == null ? null : Number(row.cpu_percent),
      mem_bytes: row.mem_bytes == null ? null : Number(row.mem_bytes),
      started_at: row.started_at || null,
      captured_at: row.captured_at,
    })),
  };
}

/**
 * 取实时快照。900ms 内的并发请求共享同一份结果（单飞），
 * 多管理员同时刷新后台也只产生一轮数据库查询。
 */
export async function realtimeSnapshot(db: SupabaseClient): Promise<RealtimeSnapshot> {
  const cache = holder.__heikaRealtimeCache!;
  if (cache.value && Date.now() - cache.at < 900) return cache.value;
  if (cache.inflight) return cache.inflight;
  cache.inflight = build(db)
    .then((value) => { cache.value = value; cache.at = Date.now(); return value; })
    .finally(() => { cache.inflight = null; });
  return cache.inflight;
}

export { dayKey };
