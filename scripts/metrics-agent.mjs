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
import os from "node:os";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WORKER_TOKEN = process.env.AI_TASK_WORKER_TOKEN || "";
const APP_BASE = process.env.METRICS_APP_URL || "http://app:3000";
const SAMPLE_INTERVAL_MS = 15_000;
const RETENTION_DAYS = 7;
const ALERT_RETENTION_DAYS = 30;
// 宿主机 /proc 只读挂载：容器内看到的只是容器自身，进程监控必须读宿主机视图。
const HOST_PROC = fs.existsSync("/host/proc/stat") ? "/host/proc" : "/proc";
const HOST_SCOPE = HOST_PROC === "/host/proc" ? "host" : "container";
const CADDY_LOG = process.env.CADDY_LOG_PATH || "/var/log/caddy/access.log";

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
      mem_total: total,
      mem_used: total ? total - available : null,
      mem_available: available,
      mem_percent: total ? Number((((total - available) / total) * 100).toFixed(1)) : null,
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
      disk_total: total,
      disk_used: used,
      disk_free: free,
      disk_percent: total ? Number(((used / total) * 100).toFixed(1)) : null,
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
    return { net_rx_bytes: rx, net_tx_bytes: tx, net_rx_rate: rxRate, net_tx_rate: txRate };
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
  if (!probe.ok) return { api_requests: null, api_errors: null, api_avg_ms: probe.latency_ms, api_p95_ms: null };
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


// ---------- 宿主机进程采集 ----------

const CLK_TCK = 100;

function readBootTime() {
  try {
    const match = /^btime\s+(\d+)/m.exec(fs.readFileSync(`${HOST_PROC}/stat`, "utf8"));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

let bootTime = null;
let prevProc = new Map();

/** 只按可核对的命令行归类真实服务，不猜测不存在的进程。 */
function serviceOf(cmd) {
  if (!cmd) return null;
  if (cmd.includes("ai-task-worker")) return { key: "ai-worker", label: "AI 任务 Worker", tone: "violet" };
  if (cmd.includes("metrics-agent")) return { key: "metrics", label: "监控采集器", tone: "blue" };
  if (cmd.includes("next-server") || cmd.includes("next start") || /(^|\s)server\.js(\s|$)/.test(cmd)) return { key: "web", label: "Web / API 服务", tone: "emerald" };
  if (/(^|\/)caddy(\s|$)/.test(cmd)) return { key: "caddy", label: "反向代理", tone: "blue" };
  if (cmd.includes("postgres")) return { key: "database", label: "数据库", tone: "gold" };
  if (cmd.includes("postgrest")) return { key: "rest", label: "数据 API", tone: "blue" };
  if (cmd.includes("storage-api") || cmd.includes("storage/server")) return { key: "storage", label: "对象存储服务", tone: "cyan" };
  if (cmd.includes("gotrue") || cmd.includes("auth-service")) return { key: "auth", label: "认证服务", tone: "amber" };
  if (cmd.includes("realtime")) return { key: "realtime", label: "实时服务", tone: "violet" };
  if (cmd.includes("ai-task")) return { key: "ai-worker", label: "AI 任务 Worker", tone: "violet" };
  return null;
}

function collectProcesses() {
  if (bootTime == null) bootTime = readBootTime();
  const now = Date.now();
  let entries = [];
  try {
    entries = fs.readdirSync(HOST_PROC);
  } catch {
    return null;
  }
  const next = new Map();
  const groups = new Map();
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    let stat = "";
    try {
      stat = fs.readFileSync(`${HOST_PROC}/${name}/stat`, "utf8");
    } catch {
      continue;
    }
    const close = stat.lastIndexOf(")");
    if (close < 0) continue;
    const rest = stat.slice(close + 2).split(" ");
    if (rest[0] === "Z") continue;
    const utime = Number(rest[11] || 0);
    const stime = Number(rest[12] || 0);
    const startTicks = Number(rest[19] || 0);
    const rssPages = Number(rest[21] || 0);
    let cmd = "";
    try {
      cmd = fs.readFileSync(`${HOST_PROC}/${name}/cmdline`, "utf8").replace(/\0/g, " ").trim();
    } catch {
      cmd = "";
    }
    const service = serviceOf(cmd);
    if (!service) continue;
    const ticks = utime + stime;
    const prev = prevProc.get(pid);
    let cpu = null;
    if (prev) {
      const seconds = (now - prev.at) / 1000;
      if (seconds > 0.2) cpu = Math.max(0, ((ticks - prev.ticks) / CLK_TCK / seconds) * 100);
    }
    next.set(pid, { ticks, at: now });
    const group = groups.get(service.key) || { ...service, cpu: 0, mem: 0, count: 0, mainPid: pid, mainCpu: -1, startedAt: null, pids: [] };
    group.cpu += cpu || 0;
    group.mem += rssPages * 4096;
    group.count += 1;
    group.pids.push(pid);
    if (startTicks && bootTime) {
      const started = new Date((bootTime + startTicks / CLK_TCK) * 1000).toISOString();
      if (!group.startedAt || started < group.startedAt) group.startedAt = started;
    }
    if ((cpu || 0) > group.mainCpu) {
      group.mainCpu = cpu || 0;
      group.mainPid = pid;
    }
    groups.set(service.key, group);
  }
  prevProc = next;
  return { scope: HOST_SCOPE, captured_at: new Date(now).toISOString(), groups: [...groups.values()] };
}

async function flushProcesses() {
  const snapshot = collectProcesses();
  if (!snapshot) return;
  const rows = snapshot.groups.map((group) => ({
    service_key: group.key,
    label: group.label,
    scope: snapshot.scope,
    status: "running",
    pid: group.mainPid,
    process_count: group.count,
    cpu_percent: Number(group.cpu.toFixed(1)),
    mem_bytes: Math.round(group.mem),
    started_at: group.startedAt,
    captured_at: snapshot.captured_at,
    // 只保留进程号，不落命令行参数，避免把密钥写进监控库。
    detail: { pids: group.pids.slice(0, 12), tone: group.tone },
  }));
  if (!rows.length) return;
  await rest("system_processes?on_conflict=service_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  }).catch((error) => console.error("[metrics-agent] 写入进程采样失败：", error instanceof Error ? error.message : error));
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  await rest(`system_processes?captured_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE" }).catch(() => {});
}

// ---------- 边缘访问日志 → 媒体流量 ----------

const MEDIA_KINDS = new Set(["image", "video", "audio", "attachment", "apk"]);
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (date) => dayFormatter.format(date);
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg|bmp|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|pdf|docx?|xlsx?|pptx?|txt|md|json|ya?ml|apk)$/i;

function classifyPath(uri) {
  const path = uri.split("?")[0];
  if (path.startsWith("/dl/")) {
    if (/\.apk$/i.test(path)) return "apk";
    if (/\.json$/i.test(path)) return "other";
    return "attachment";
  }
  if (path.startsWith("/storage/v1/object/")) {
    if (IMAGE_EXT.test(path)) return "image";
    if (VIDEO_EXT.test(path)) return "video";
    if (AUDIO_EXT.test(path)) return "audio";
    if (ARCHIVE_EXT.test(path)) return "attachment";
    return "other";
  }
  if (path.startsWith("/api/v1/attachments")) return "attachment";
  if (path.startsWith("/api/v1/media")) return "image";
  return "other";
}

let logCursor = { ino: null, offset: 0 };
let pendingLine = "";
const trafficAgg = { daily: new Map(), paths: new Map(), firstLineAt: null, lastLineAt: null };
// 控制中心 3.0：全量访问按 IP 聚合；HTTP 日志只保留业务请求摘要（不含 Cookie / Token / 正文）。
const ipAgg = new Map();
const httpAgg = [];

function ingestAccessLog() {
  let stat;
  try {
    stat = fs.statSync(CADDY_LOG);
  } catch {
    return 0;
  }
  if (!stat.isFile()) return 0;
  const ino = String(stat.ino);
  if (logCursor.ino !== ino || stat.size < logCursor.offset) {
    // 首次启动或日志轮转：从文件末尾开始，不把历史日志重复计入。
    logCursor = { ino, offset: stat.size };
    pendingLine = "";
    return 0;
  }
  if (stat.size === logCursor.offset) return 0;
  const length = stat.size - logCursor.offset;
  const buffer = Buffer.alloc(Math.min(length, 4 * 1024 * 1024));
  const fd = fs.openSync(CADDY_LOG, "r");
  let read = 0;
  try {
    read = fs.readSync(fd, buffer, 0, buffer.length, logCursor.offset);
  } finally {
    fs.closeSync(fd);
  }
  if (read <= 0) return 0;
  logCursor.offset += read;
  const text = pendingLine + buffer.subarray(0, read).toString("utf8");
  const lines = text.split("\n");
  pendingLine = lines.pop() || "";
  let count = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const uri = String(entry?.request?.uri || "");
    if (!uri) continue;
    const status = Number(entry?.status || 0);
    const bytes = Math.max(0, Number(entry?.size || 0));
    const at = entry?.ts ? new Date(Number(entry.ts) * 1000) : new Date();
    const day = dayKey(at);
    const ip = String(entry?.request?.remote_ip || "");
    const method = String(entry?.request?.method || "GET");
    const ms = Math.round(Number(entry?.duration || 0) * 1000);
    const userAgent = String(entry?.request?.headers?.["User-Agent"]?.[0] || "").slice(0, 300);
    const path = uri.split("?")[0].slice(0, 240);

    if (ip) {
      const key = `${day}|${ip}`;
      const row = ipAgg.get(key) || {
        day, ip, requests: 0, bytes_in: 0, bytes_out: 0, status_4xx: 0, status_5xx: 0,
        msSum: 0, first_seen: at.toISOString(), last_seen: at.toISOString(), paths: {},
      };
      row.requests += 1;
      row.bytes_out += bytes;
      row.bytes_in += Math.max(0, Number(entry?.request?.headers?.["Content-Length"]?.[0] || 0));
      if (status >= 500) row.status_5xx += 1;
      else if (status >= 400) row.status_4xx += 1;
      row.msSum += ms;
      if (at.toISOString() < row.first_seen) row.first_seen = at.toISOString();
      if (at.toISOString() > row.last_seen) row.last_seen = at.toISOString();
      if (Object.keys(row.paths).length < 30) row.paths[path] = (row.paths[path] || 0) + 1;
      ipAgg.set(key, row);
    }
    // 静态资源只计入 IP 流量，不单独写 HTTP 日志，避免日志表被冲垮。
    if (httpAgg.length < 500 && !/^\/(_next|assets|favicon|icons)\b/.test(path) && ip) {
      httpAgg.push({ ts: at.toISOString(), ip, method, path, status, ms, bytes, ua: userAgent });
    }

    const kind = classifyPath(uri);
    if (!MEDIA_KINDS.has(kind)) continue;
    const ok = status === 200 || status === 206 || status === 304;
    const dailyKey = `${day}|${kind}`;
    const daily = trafficAgg.daily.get(dailyKey) || { requests: 0, bytes: 0, completed: 0, failed: 0 };
    daily.requests += 1;
    daily.bytes += bytes;
    if (ok) daily.completed += 1; else daily.failed += 1;
    trafficAgg.daily.set(dailyKey, daily);
    const cleanPath = uri.split("?")[0].slice(0, 240);
    const pathKey = `${day}\u0001${cleanPath}`;
    const row = trafficAgg.paths.get(pathKey) || { kind, requests: 0, bytes: 0, downloads: 0 };
    row.requests += 1;
    row.bytes += bytes;
    if (ok && (kind === "apk" || kind === "attachment")) row.downloads += 1;
    trafficAgg.paths.set(pathKey, row);
    if (!trafficAgg.firstLineAt) trafficAgg.firstLineAt = at.toISOString();
    trafficAgg.lastLineAt = at.toISOString();
    count += 1;
  }
  return count;
}

/** 按天累加 IP 统计；RPC 内部做 upsert + 增量，避免覆盖当天已有数据。 */
async function flushIpStats() {
  if (!ipAgg.size) return;
  const entries = [...ipAgg.entries()].slice(0, 300);
  const rows = entries.map(([, value]) => ({
    day: value.day,
    ip: value.ip,
    requests: value.requests,
    bytes_in: value.bytes_in,
    bytes_out: value.bytes_out,
    status_4xx: value.status_4xx,
    status_5xx: value.status_5xx,
    avg_ms: value.requests ? Math.round(value.msSum / value.requests) : 0,
    first_seen: value.first_seen,
    last_seen: value.last_seen,
    paths: value.paths,
  }));
  await rest("rpc/heika_ip_stats_inc", { method: "POST", body: JSON.stringify({ p_rows: rows }) });
  for (const [key] of entries) ipAgg.delete(key);
}

async function flushHttpLogs() {
  if (!httpAgg.length) return;
  const rows = httpAgg.splice(0, 500);
  await rest("http_access_logs", { method: "POST", body: JSON.stringify(rows) });
}

// ---------- TCP 连接快照（宿主机 /proc/net/tcp + 进程映射） ----------

const TCP_STATES = {
  "01": "ESTABLISHED", "02": "SYN_SENT", "03": "SYN_RECV", "04": "FIN_WAIT1", "05": "FIN_WAIT2",
  "06": "TIME_WAIT", "07": "CLOSE", "08": "CLOSE_WAIT", "09": "LAST_ACK", "0A": "LISTEN", "0B": "CLOSING",
};

function hexToIp(hex, v6 = false) {
  if (v6) {
    if (hex.length !== 32) return null;
    const groups = [];
    for (let index = 0; index < 32; index += 4) {
      const word = hex.slice(index, index + 4);
      // 内核按 4 字节小端分组输出，需要逐组翻转字节序。
      groups.push(`${word.slice(2, 4)}${word.slice(0, 2)}`);
    }
    return groups.join(":").replace(/(^|:)(0:)+/, (match) => (match.startsWith(":") ? "::" : "::"));
  }
  if (hex.length !== 8) return null;
  return [6, 4, 2, 0].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(".");
}

function socketInodeMap() {
  // 只扫描监听与已建立连接的 socket inode，避免遍历整棵 /proc。
  const map = new Map();
  let pids = [];
  try {
    pids = fs.readdirSync(HOST_PROC).filter((name) => /^\d+$/.test(name));
  } catch {
    return map;
  }
  for (const pid of pids) {
    let fds = [];
    try {
      fds = fs.readdirSync(`${HOST_PROC}/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        const link = fs.readlinkSync(`${HOST_PROC}/${pid}/fd/${fd}`);
        const match = /^socket:\[(\d+)\]$/.exec(link);
        if (!match) continue;
        let name = "";
        try {
          name = fs.readFileSync(`${HOST_PROC}/${pid}/comm`, "utf8").trim();
        } catch { /* 进程退出 */ }
        map.set(match[1], { pid: Number(pid), process: name.slice(0, 60) });
      } catch { /* 无权限或已关闭 */ }
    }
  }
  return map;
}

function collectTcpSnapshot() {
  const inodes = socketInodeMap();
  const rows = [];
  for (const [file, v6] of [[`${HOST_PROC}/net/tcp`, false], [`${HOST_PROC}/net/tcp6`, true]]) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 10) continue;
      const [local, remote, stateHex] = fields;
      const state = TCP_STATES[stateHex];
      if (!state) continue;
      const [localHex, localPortHex] = local.split(":");
      const [remoteHex, remotePortHex] = remote.split(":");
      const localIp = hexToIp(localHex, v6);
      const remoteIp = hexToIp(remoteHex, v6);
      const localPort = parseInt(localPortHex, 16);
      const remotePort = parseInt(remotePortHex, 16);
      const direction = localPort === 443 || localPort === 80 || localPort === 3000 ? "inbound" : (remotePort === 443 || remotePort === 80 ? "outbound" : "local");
      const socket = inodes.get(fields[9]);
      rows.push({
        state,
        local_ip: localIp,
        local_port: Number.isFinite(localPort) ? localPort : null,
        remote_ip: remoteIp,
        remote_port: Number.isFinite(remotePort) ? remotePort : null,
        process: socket?.process || null,
        pid: socket?.pid || null,
        direction,
        // 内核不暴露单连接累计字节；这里明确留空，不用估算值冒充。
        bytes_sent: null,
        bytes_recv: null,
      });
    }
  }
  return rows;
}

async function flushTcpSnapshot() {
  const rows = collectTcpSnapshot();
  if (!rows.length) return;
  lastTcpTotal = rows.length;
  const capturedAt = new Date().toISOString();
  const counts = rows.reduce((acc, row) => {
    acc[row.state] = (acc[row.state] || 0) + 1;
    return acc;
  }, {});
  // 只保留最有诊断价值的 200 条明细；完整状态分布写在 SUMMARY 行里，
  // 避免 60 秒一次的全量连接把 2C2G 服务器磁盘写满。
  const priority = { ESTABLISHED: 0, LISTEN: 1, CLOSE_WAIT: 2, SYN_RECV: 3, SYN_SENT: 4, TIME_WAIT: 5 };
  const detail = rows
    .filter((row) => row.state !== "TIME_WAIT" || rows.filter((item) => item.state === "TIME_WAIT").length < 300)
    .sort((a, b) => (priority[a.state] ?? 9) - (priority[b.state] ?? 9))
    .slice(0, 200)
    .map((row) => ({ ...row, captured_at: capturedAt }));
  detail.push({
    captured_at: capturedAt,
    state: "SUMMARY",
    local_ip: null,
    local_port: null,
    remote_ip: null,
    remote_port: null,
    process: null,
    pid: null,
    direction: null,
    bytes_sent: null,
    bytes_recv: null,
    meta: { counts, total: rows.length },
  });
  await rest("tcp_snapshots", { method: "POST", body: JSON.stringify(detail) });
}

async function flushTraffic() {
  if (!trafficAgg.daily.size && !trafficAgg.paths.size) return;
  const daily = [...trafficAgg.daily.entries()].map(([key, value]) => {
    const [day, kind] = key.split("|");
    return { day, source: "edge", kind, requests: value.requests, bytes: value.bytes, completed: value.completed, failed: value.failed };
  });
  // 单次最多提交 400 条路径，避免一次请求体过大；其余留到下一轮。
  const pathEntries = [...trafficAgg.paths.entries()].slice(0, 400);
  const paths = pathEntries.map(([key, value]) => {
    const [day, path] = key.split("\u0001");
    return { day, path, kind: value.kind, requests: value.requests, bytes: value.bytes, download_requests: value.downloads };
  });
  await rest("rpc/heika_media_traffic_inc", {
    method: "POST",
    body: JSON.stringify({ p_daily: daily, p_paths: paths }),
  });
  trafficAgg.daily.clear();
  for (const [key] of pathEntries) trafficAgg.paths.delete(key);
  if (!trafficAgg.paths.size) trafficAgg.paths.clear();
}

// ---------- 告警规则 ----------

/**
 * 阈值来自 alert_rules 表，管理员在管理中心改完即生效，不在代码里写死。
 * 支持：持续时间（连续满足才触发）、冷却（恢复后一段时间不重复告警）、
 * 降噪（同一规则只保留一条未恢复记录，重复命中累加 occurrences）。
 */
const METRIC_LABELS = {
  cpu_percent: "CPU 使用率", mem_percent: "内存使用率", disk_percent: "磁盘使用率",
  tcp_total: "TCP 连接总数", api_error_rate: "API 错误率", api_p95_ms: "API P95 耗时",
  upload_fail_rate: "上传失败率", net_tx_rate: "出网速率", cert_days_left: "HTTPS 证书剩余天数",
};

function compare(value, operator, threshold) {
  switch (operator) {
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    default: return false;
  }
}

let rulesCache = { at: 0, rows: [] };
let ruleState = new Map();
let lastTcpTotal = null;
let certDaysLeft = null;

async function loadAlertRules() {
  if (Date.now() - rulesCache.at < 5 * 60_000 && rulesCache.rows.length) return rulesCache.rows;
  const rows = await rest("alert_rules?select=id,metric,operator,threshold,duration_seconds,cooldown_seconds,level,enabled&enabled=eq.true").catch(() => null);
  if (Array.isArray(rows)) rulesCache = { at: Date.now(), rows };
  return rulesCache.rows;
}

/** 真实指标取值；拿不到就返回 null，规则不会因为缺数据而误报。 */
function metricValue(metric, metrics, services) {
  switch (metric) {
    case "cpu_percent": return metrics.cpu_percent ?? null;
    case "mem_percent": return metrics.mem_percent ?? null;
    case "disk_percent": return metrics.disk_percent ?? null;
    case "tcp_total": return lastTcpTotal;
    case "api_error_rate": return metrics.api_requests > 0 && metrics.api_errors != null ? (metrics.api_errors / metrics.api_requests) * 100 : null;
    case "api_p95_ms": return metrics.api_p95_ms ?? null;
    case "upload_fail_rate": return metrics.upload_tasks >= 10 && metrics.upload_success_rate != null ? 100 - metrics.upload_success_rate : null;
    case "net_tx_rate": return metrics.net_tx_rate ?? null;
    case "cert_days_left": return certDaysLeft;
    case "service_down": return services && Object.values(services).some((item) => item && item.ok === false) ? 1 : 0;
    default: return null;
  }
}

function metricDetail(metric, value, metrics, services) {
  if (metric === "service_down") {
    return Object.entries(services || {}).filter(([, item]) => item?.ok === false).map(([name, item]) => `${name}: ${item?.detail || "不可用"}`).join("; ") || "服务不可用";
  }
  const label = METRIC_LABELS[metric] || metric;
  if (metric === "api_error_rate") return `${label} ${value.toFixed(1)}%（${metrics.api_errors}/${metrics.api_requests}）`;
  if (metric === "cert_days_left") return `${label} ${Math.floor(value)} 天`;
  return `${label} ${typeof value === "number" ? Number(value.toFixed(1)) : value}`;
}

/** 读取本机 HTTPS 证书剩余天数；连不上就留空，不猜测。 */
async function probeCertificate() {
  const target = process.env.HEIKA_CERT_HOST || "moonclean.shop";
  const [host, portRaw] = target.split(":");
  const port = Number(portRaw || 443);
  const tls = await import("node:tls");
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert?.valid_to) return resolve(null);
        const days = (new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000;
        resolve(Number.isFinite(days) ? days : null);
      } catch {
        resolve(null);
      }
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
  });
}

async function evaluateAlerts(metrics, services) {
  const rules = await loadAlertRules();
  if (!rules.length) return;
  const now = Date.now();
  for (const rule of rules) {
    const value = metricValue(rule.metric, metrics, services);
    if (value == null || !Number.isFinite(Number(value))) {
      ruleState.delete(rule.id);
      continue;
    }
    const hit = compare(Number(value), rule.operator, Number(rule.threshold));
    const state = ruleState.get(rule.id) || { since: null, cooledUntil: 0 };
    if (!hit) {
      ruleState.set(rule.id, { since: null, cooledUntil: state.cooledUntil });
      await resolveAlert(rule);
      continue;
    }
    if (!state.since) state.since = now;
    const held = (now - state.since) / 1000;
    if (held < Number(rule.duration_seconds || 0)) {
      ruleState.set(rule.id, state);
      continue;
    }
    if (state.cooledUntil && now < state.cooledUntil) continue;
    ruleState.set(rule.id, state);
    await fireAlert(rule, value, metrics, services, state);
  }
}

async function resolveAlert(rule) {
  const existing = await rest(`system_alerts?alert_type=eq.${encodeURIComponent("rule:" + rule.metric)}&status=in.(open,acknowledged,resolving)&limit=1`).catch(() => null);
  const row = Array.isArray(existing) ? existing[0] : null;
  if (!row) return;
  await rest(`system_alerts?id=eq.${row.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString(), handle_note: "指标已恢复到阈值以内（自动）" }),
  }).catch(() => {});
  ruleState.set(rule.id, { since: null, cooledUntil: Date.now() + Number(rule.cooldown_seconds || 0) * 1000 });
}

async function fireAlert(rule, value, metrics, services) {
  const type = `rule:${rule.metric}`;
  const existing = await rest(`system_alerts?alert_type=eq.${encodeURIComponent(type)}&status=in.(open,acknowledged,resolving,ignored)&limit=1`).catch(() => null);
  const row = Array.isArray(existing) ? existing[0] : null;
  const detail = metricDetail(rule.metric, Number(value), metrics, services);
  const snapshot = { ...metrics, services, rule: { metric: rule.metric, operator: rule.operator, threshold: rule.threshold } };
  if (row) {
    await rest(`system_alerts?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        last_seen_at: new Date().toISOString(),
        occurrences: (row.occurrences || 1) + 1,
        metric_snapshot: snapshot,
        detail,
      }),
    }).catch(() => {});
    return;
  }
  await rest("system_alerts", {
    method: "POST",
    body: JSON.stringify({
      alert_type: type,
      level: rule.level || "warn",
      title: `${METRIC_LABELS[rule.metric] || rule.metric} 触发阈值`,
      detail,
      metric_snapshot: snapshot,
      status: "open",
    }),
  }).catch(() => {});
  console.warn(`[metrics-agent] 新告警：${rule.metric} ${rule.operator} ${rule.threshold} — ${detail}`);
}

async function cleanup() {
  const metricsCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  await rest(`system_metrics?captured_at=lt.${encodeURIComponent(metricsCutoff)}`, { method: "DELETE" }).catch(() => {});
  const alertCutoff = new Date(Date.now() - ALERT_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  await rest(`system_alerts?status=eq.resolved&resolved_at=lt.${encodeURIComponent(alertCutoff)}`, { method: "DELETE" }).catch(() => {});
  // 监控自身也要有保留期限：TCP 明细 24 小时、HTTP 日志 30 天、IP 日聚合 180 天。
  const tcpCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await rest(`tcp_snapshots?captured_at=lt.${encodeURIComponent(tcpCutoff)}`, { method: "DELETE" }).catch(() => {});
  const httpCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  await rest(`http_access_logs?ts=lt.${encodeURIComponent(httpCutoff)}`, { method: "DELETE" }).catch(() => {});
  const ipCutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await rest(`ip_access_stats?day=lt.${ipCutoff}`, { method: "DELETE" }).catch(() => {});
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
  // 进程与流量：真实宿主机进程表 + 边缘访问日志增量，1 秒界面刷新读的是这里写入的数据。
  await flushProcesses().catch((error) => console.error("[metrics-agent] 进程采集异常：", error instanceof Error ? error.message : error));
  try {
    ingestAccessLog();
    await flushTraffic();
    await flushIpStats();
    await flushHttpLogs();
  } catch (error) {
    console.error("[metrics-agent] 流量汇总异常：", error instanceof Error ? error.message : error);
  }
  if (tick % 4 === 1) {
    await flushTcpSnapshot().catch((error) => console.error("[metrics-agent] TCP 快照异常：", error instanceof Error ? error.message : error));
  }
  if (tick % 20 === 1) {
    certDaysLeft = await probeCertificate().catch(() => null);
  }
  if (tick % 3 === 1) {
    await evaluateAlerts(metrics, services);
  }
  if (tick % 20 === 0) {
    await fetch(`${APP_BASE}/api/v1/internal/budget-check`, {
      method: "POST",
      headers: WORKER_TOKEN ? { Authorization: `Bearer ${WORKER_TOKEN}` } : {},
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
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
