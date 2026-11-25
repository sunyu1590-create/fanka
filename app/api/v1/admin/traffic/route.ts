import { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";
import { dayKey } from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Asia/Shanghai";

function addDays(day: string, delta: number) {
  const [y, m, d] = day.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}
const startOfDay = (day: string) => new Date(`${day}T00:00:00+08:00`);

type Bounds = { key: string; label: string; fromDay: string; toDay: string; from: Date; to: Date };

function resolveBounds(range: string, fromParam: string | null, toParam: string | null): Bounds {
  const today = dayKey();
  if (range === "custom") {
    if (!fromParam || !toParam || !/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) throw new ApiError(400, "自定义日期范围无效");
    if (fromParam > toParam) throw new ApiError(400, "开始日期不能晚于结束日期");
    return {
      key: "custom", label: `${fromParam} 至 ${toParam}`, fromDay: fromParam, toDay: toParam,
      from: startOfDay(fromParam), to: new Date(startOfDay(addDays(toParam, 1)).getTime() - 1),
    };
  }
  if (range === "yesterday") {
    const day = addDays(today, -1);
    return { key: range, label: "昨天", fromDay: day, toDay: day, from: startOfDay(day), to: new Date(startOfDay(today).getTime() - 1) };
  }
  if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30;
    const start = addDays(today, -(days - 1));
    return { key: range, label: `最近 ${days} 天`, fromDay: start, toDay: today, from: startOfDay(start), to: new Date() };
  }
  return { key: "today", label: "今天", fromDay: today, toDay: today, from: startOfDay(today), to: new Date() };
}

function daysBetween(fromDay: string, toDay: string) {
  const list: string[] = [];
  let cursor = fromDay;
  let guard = 0;
  while (cursor <= toDay && guard < 400) {
    list.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return list;
}

const KIND_LABEL: Record<string, string> = {
  image: "图片", video: "视频", audio: "音频", attachment: "附件", apk: "APK", other: "其他",
};

type KindRow = { kind: string; requests: number; bytes: number; completed: number; failed: number };
type MediaPathRow = { path: string; kind: string; requests: number; bytes: number; downloads: number };
type HttpTotals = { requests: number; bytes: number; errors: number; avg_ms: number; p95_ms: number; paths: number };
type HttpRow = { path: string; requests: number; bytes: number; errors: number; avg_ms: number; p95_ms: number };

/**
 * 流量分析中心。
 *
 * 三种口径严格分开，不互相替代：
 * 1. 网络层：网卡累计计数器日增量（含数据库、系统更新、SSH 等全部进出流量）
 * 2. 应用层：Caddy 访问日志里的真实响应字节（HTTP 出网）
 * 3. 存储层：对象存储当前对象大小（是容量，不是流量）
 *
 * 账号维度只能统计「上行」：边缘日志没有账号身份，按账号归因下行流量会算到共享 IP 上，
 * 这里如实只给上传侧真实字节，并把原因写进返回结果。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "network.read");
    const db = adminClient();
    const params = req.nextUrl.searchParams;
    const bounds = resolveBounds(params.get("range") || "today", params.get("from"), params.get("to"));
    const limit = Math.max(5, Math.min(100, Number(params.get("limit")) || 20));
    const days = daysBetween(bounds.fromDay, bounds.toDay);

    const [nic, http, kinds, paths, ipRows, uploadRows] = await Promise.all([
      db.rpc("heika_nic_traffic", { p_from: bounds.from.toISOString(), p_to: bounds.to.toISOString() }),
      db.rpc("heika_http_stats", { p_from: bounds.from.toISOString(), p_to: bounds.to.toISOString(), p_limit: 60 }),
      db.rpc("heika_media_kind_stats", { p_from: bounds.fromDay, p_to: bounds.toDay }),
      db.rpc("heika_media_path_stats", { p_from: bounds.fromDay, p_to: bounds.toDay, p_limit: limit }),
      db.from("ip_access_stats")
        .select("ip,requests,bytes_in,bytes_out,status_4xx,status_5xx,avg_ms,last_seen,client")
        .gte("day", bounds.fromDay)
        .lte("day", bounds.toDay)
        .order("last_seen", { ascending: false })
        .limit(5000),
      db.from("upload_tasks")
        .select("user_id,file_size,bytes_sent,status,created_at")
        .gte("created_at", bounds.from.toISOString())
        .lte("created_at", bounds.to.toISOString())
        .limit(10_000),
    ]);

    if (nic.error) throw new ApiError(503, "网络层流量暂不可用");
    if (http.error || kinds.error || paths.error) throw new ApiError(503, "应用层流量暂不可用");
    if (ipRows.error) throw new ApiError(503, "IP 访问统计暂不可用");

    // ---- 网络层 ----
    const nicDays = (nic.data || []) as { day: string; rx: number; tx: number; samples: number }[];
    const nicRx = nicDays.reduce((sum, row) => sum + Number(row.rx || 0), 0);
    const nicTx = nicDays.reduce((sum, row) => sum + Number(row.tx || 0), 0);
    const nicByDay = new Map(nicDays.map((row) => [String(row.day).slice(0, 10), row]));

    // ---- 应用层总览（IP 汇总表覆盖全部边缘请求）----
    const ips = (ipRows.data || []) as { ip: string; requests: number; bytes_in: number; bytes_out: number; status_4xx: number; status_5xx: number; avg_ms: number; last_seen: string; client: string | null }[];
    const byIp = new Map<string, { ip: string; requests: number; bytesIn: number; bytesOut: number; errors: number; avgMs: number; lastSeen: string; client: string | null }>();
    for (const row of ips) {
      const key = String(row.ip);
      const entry = byIp.get(key) || { ip: key, requests: 0, bytesIn: 0, bytesOut: 0, errors: 0, avgMs: 0, lastSeen: row.last_seen, client: row.client || null };
      const requests = Number(row.requests || 0);
      entry.requests += requests;
      entry.bytesIn += Number(row.bytes_in || 0);
      entry.bytesOut += Number(row.bytes_out || 0);
      entry.errors += Number(row.status_4xx || 0) + Number(row.status_5xx || 0);
      entry.avgMs += Number(row.avg_ms || 0) * requests;
      if (row.last_seen > entry.lastSeen) entry.lastSeen = row.last_seen;
      entry.client = row.client || entry.client;
      byIp.set(key, entry);
    }
    const ipList = [...byIp.values()].map((row) => ({
      ...row,
      avgMs: row.requests ? Math.round(row.avgMs / row.requests) : 0,
      errorRate: row.requests ? Number(((row.errors / row.requests) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.bytesOut - a.bytesOut);

    const appRequests = ipList.reduce((sum, row) => sum + row.requests, 0);
    const appBytesOut = ipList.reduce((sum, row) => sum + row.bytesOut, 0);
    const appBytesIn = ipList.reduce((sum, row) => sum + row.bytesIn, 0);
    const appErrors = ipList.reduce((sum, row) => sum + row.errors, 0);
    const weightedMs = ipList.reduce((sum, row) => sum + row.avgMs * row.requests, 0);

    // ---- 按天时间线（应用层来自 IP 汇总，网络层来自网卡增量）----
    const series = days.map((day) => ({
      day,
      requests: 0,
      bytesOut: 0,
      errors: 0,
      nicRx: Number(nicByDay.get(day)?.rx || 0),
      nicTx: Number(nicByDay.get(day)?.tx || 0),
    }));
    // ip_access_stats 是 (day, ip) 主键，按天回填保证时间线准确。
    const dayRows = await db.from("ip_access_stats")
      .select("day,requests,bytes_out,status_4xx,status_5xx")
      .gte("day", bounds.fromDay)
      .lte("day", bounds.toDay)
      .limit(20_000);
    if (!dayRows.error) {
      const map = new Map<string, { requests: number; bytesOut: number; errors: number }>();
      for (const row of dayRows.data || []) {
        const key = String(row.day).slice(0, 10);
        const entry = map.get(key) || { requests: 0, bytesOut: 0, errors: 0 };
        entry.requests += Number(row.requests || 0);
        entry.bytesOut += Number(row.bytes_out || 0);
        entry.errors += Number(row.status_4xx || 0) + Number(row.status_5xx || 0);
        map.set(key, entry);
      }
      for (const point of series) {
        const entry = map.get(point.day);
        if (entry) Object.assign(point, entry);
      }
    }

    // ---- 资源类型 ----
    const kindRows = (kinds.data || []) as KindRow[];
    const httpTotals = (http.data?.totals || {}) as HttpTotals;
    const apiBytes = Number(httpTotals.bytes || 0);
    const mediaBytes = kindRows.reduce((sum, row) => sum + Number(row.bytes || 0), 0);
    const denominator = mediaBytes + apiBytes;
    const kindList = [
      ...kindRows.map((row) => ({
        kind: row.kind,
        label: KIND_LABEL[row.kind] || row.kind,
        requests: Number(row.requests || 0),
        bytes: Number(row.bytes || 0),
        failed: Number(row.failed || 0),
        share: denominator ? Number(((Number(row.bytes || 0) / denominator) * 100).toFixed(1)) : 0,
      })),
      {
        kind: "api", label: "接口与页面",
        requests: Number(httpTotals.requests || 0),
        bytes: apiBytes,
        failed: Number(httpTotals.errors || 0),
        share: denominator ? Number(((apiBytes / denominator) * 100).toFixed(1)) : 0,
      },
    ].sort((a, b) => b.bytes - a.bytes);

    // ---- 账号维度（只统计真实可归因的上行）----
    const uploads = (uploadRows.data || []) as { user_id: string; file_size: number; bytes_sent: number; status: string }[];
    const byAccount = new Map<string, { accountId: string; tasks: number; ready: number; fileBytes: number; sentBytes: number }>();
    for (const row of uploads) {
      const key = row.user_id;
      const entry = byAccount.get(key) || { accountId: key, tasks: 0, ready: 0, fileBytes: 0, sentBytes: 0 };
      entry.tasks += 1;
      if (row.status === "ready") {
        entry.ready += 1;
        entry.fileBytes += Number(row.file_size || 0);
      }
      entry.sentBytes += Number(row.bytes_sent || 0);
      byAccount.set(key, entry);
    }
    const accountIds = [...byAccount.keys()].slice(0, 60);
    let accounts: { accountId: string; nickname: string | null; tasks: number; ready: number; fileBytes: number; sentBytes: number }[] = [];
    if (accountIds.length) {
      const profiles = await db.from("profiles").select("id,nickname").in("id", accountIds);
      const names = new Map((profiles.data || []).map((row) => [row.id as string, row.nickname as string]));
      accounts = [...byAccount.values()]
        .map((row) => ({ ...row, nickname: names.get(row.accountId) || null }))
        .sort((a, b) => b.fileBytes - a.fileBytes)
        .slice(0, 30);
    }

    return {
      range: { key: bounds.key, label: bounds.label, from: bounds.fromDay, to: bounds.toDay, days: days.length },
      overview: {
        app: {
          requests: appRequests,
          bytesOut: appBytesOut,
          bytesIn: appBytesIn,
          errors: appErrors,
          errorRate: appRequests ? Number(((appErrors / appRequests) * 100).toFixed(2)) : 0,
          avgMs: appRequests ? Math.round(weightedMs / appRequests) : 0,
          uniqueIps: ipList.length,
          p95Ms: Number(httpTotals.p95_ms || 0),
        },
        nic: {
          rx: nicRx,
          tx: nicTx,
          total: nicRx + nicTx,
          sampledDays: nicDays.length,
          // 网卡出网 / 应用层响应字节：差值就是数据库、SSH、系统更新等非 HTTP 流量。
          nonHttpTx: Math.max(0, nicTx - appBytesOut),
        },
        storageNote: "存储容量是对象大小快照，与流量不是同一口径。",
      },
      series,
      kinds: kindList,
      ips: ipList.slice(0, limit),
      resources: ((paths.data || []) as MediaPathRow[]).map((row) => ({
        path: row.path,
        kind: row.kind,
        label: KIND_LABEL[row.kind] || row.kind,
        requests: Number(row.requests || 0),
        bytes: Number(row.bytes || 0),
        downloads: Number(row.downloads || 0),
      })),
      endpoints: ((http.data?.rows || []) as HttpRow[]).map((row) => ({
        path: row.path,
        requests: Number(row.requests || 0),
        bytes: Number(row.bytes || 0),
        errors: Number(row.errors || 0),
        avgMs: Number(row.avg_ms || 0),
        p95Ms: Number(row.p95_ms || 0),
      })).slice(0, limit),
      accounts,
      coverage: {
        ipDays: "IP 汇总保留 180 天，HTTP 明细保留 30 天，资源日聚合长期保留。",
        accountNote: "边缘访问日志不含账号身份，账号维度只统计真实可归因的上行（媒体/附件上传）；下行流量按 IP 统计，不摊到账号，避免共享 IP 误判。",
        nicNote: "网络层为网卡累计计数器的日增量，含非 HTTP 流量；计数器在重启后归零，跨重启的日期会偏小。",
      },
    };
  });
}
