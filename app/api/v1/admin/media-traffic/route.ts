import { NextRequest } from "next/server";
import { respond, dbError, ApiError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";
import { dayKey } from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Asia/Shanghai";

function dayOf(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function addDays(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, date));
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}
function startOfDay(day: string) {
  return new Date(`${day}T00:00:00+08:00`);
}

type Bounds = { key: string; label: string; fromDay: string; toDay: string; from: Date; to: Date };

function resolveBounds(range: string, fromParam: string | null, toParam: string | null): Bounds {
  const today = dayKey();
  if (range === "custom") {
    if (!fromParam || !toParam || !/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) throw new ApiError(400, "自定义日期范围无效");
    if (fromParam > toParam) throw new ApiError(400, "开始日期不能晚于结束日期");
    if ((startOfDay(toParam).getTime() - startOfDay(fromParam).getTime()) / 86_400_000 > 366) throw new ApiError(400, "自定义范围最多 366 天");
    return { key: "custom", label: `${fromParam} 至 ${toParam}`, fromDay: fromParam, toDay: toParam, from: startOfDay(fromParam), to: new Date(startOfDay(addDays(toParam, 1)).getTime() - 1) };
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
  if (range === "month" || range === "lastMonth") {
    if (range === "month") {
      const start = `${today.slice(0, 7)}-01`;
      return { key: range, label: "本月", fromDay: start, toDay: today, from: startOfDay(start), to: new Date() };
    }
    const firstThisMonth = `${today.slice(0, 7)}-01`;
    const lastMonthEnd = addDays(firstThisMonth, -1);
    const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
    return { key: range, label: "上个月", fromDay: lastMonthStart, toDay: lastMonthEnd, from: startOfDay(lastMonthStart), to: new Date(startOfDay(firstThisMonth).getTime() - 1) };
  }
  if (range === "all") {
    return { key: range, label: "历史累计", fromDay: "2020-01-01", toDay: today, from: startOfDay("2020-01-01"), to: new Date() };
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

/**
 * 媒体流量与上传统计。
 * - 上传：upload_tasks 的真实任务行（任务数、成功文件、失败、客户端上报传输字节）
 * - 下载/访问：反向代理访问日志的日聚合（真实响应字节），按资源类型分列
 * - 存储：对象存储真实对象数/字节，与流量严格分开
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "audit.read");
    const db = adminClient();
    const params = req.nextUrl.searchParams;
    const bounds = resolveBounds(params.get("range") || "today", params.get("from"), params.get("to"));

    const [uploadRows, trafficRows, storage] = await Promise.all([
      db.from("upload_tasks")
        .select("status,file_size,bytes_sent,attempts,created_at,client_type")
        .gte("created_at", bounds.from.toISOString())
        .lte("created_at", bounds.to.toISOString())
        .order("created_at", { ascending: true })
        .limit(20_000),
      db.from("media_traffic_daily")
        .select("day,kind,requests,bytes,completed,failed")
        .gte("day", bounds.fromDay)
        .lte("day", bounds.toDay),
      db.rpc("heika_storage_summary"),
    ]);
    dbError(uploadRows.error);
    dbError(trafficRows.error);
    if (storage.error) throw new ApiError(503, "存储容量统计暂不可用");

    const uploads = uploadRows.data || [];
    const ready = uploads.filter((row) => row.status === "ready");
    const failed = uploads.filter((row) => row.status === "failed");
    const firstTryReady = ready.filter((row) => Number(row.attempts || 1) <= 1);
    const retryRows = uploads.filter((row) => Number(row.attempts || 1) > 1);
    const fileBytes = ready.reduce((sum, row) => sum + Number(row.file_size || 0), 0);
    const transferredBytes = uploads.reduce((sum, row) => sum + Number(row.bytes_sent || 0), 0);
    const retryExtraBytes = retryRows.reduce((sum, row) => sum + Math.max(0, Number(row.bytes_sent || 0) - Number(row.file_size || 0)), 0);

    const uploadSeries = daysBetween(bounds.fromDay, bounds.toDay).map((day) => {
      const rows = uploads.filter((row) => dayOf(row.created_at) === day);
      return {
        day,
        tasks: rows.length,
        ready: rows.filter((row) => row.status === "ready").length,
        failed: rows.filter((row) => row.status === "failed").length,
        bytes: rows.filter((row) => row.status === "ready").reduce((sum, row) => sum + Number(row.file_size || 0), 0),
      };
    });

    const downloadKinds = new Set(["image", "video", "attachment", "apk"]);
    const traffic = (trafficRows.data || []).filter((row) => downloadKinds.has(String(row.kind)));
    const byKind = new Map<string, { kind: string; requests: number; bytes: number; failed: number; completed: number }>();
    for (const row of traffic) {
      const key = String(row.kind);
      const entry = byKind.get(key) || { kind: key, requests: 0, bytes: 0, failed: 0, completed: 0 };
      entry.requests += Number(row.requests || 0);
      entry.bytes += Number(row.bytes || 0);
      entry.failed += Number(row.failed || 0);
      entry.completed += Number(row.completed || 0);
      byKind.set(key, entry);
    }
    const downloadSeries = daysBetween(bounds.fromDay, bounds.toDay).map((day) => {
      const rows = traffic.filter((row) => String(row.day) === day);
      return {
        day,
        requests: rows.reduce((sum, row) => sum + Number(row.requests || 0), 0),
        bytes: rows.reduce((sum, row) => sum + Number(row.bytes || 0), 0),
      };
    });

    const downloadBytes = traffic.reduce((sum, row) => sum + Number(row.bytes || 0), 0);
    const downloadRequests = traffic.reduce((sum, row) => sum + Number(row.requests || 0), 0);
    const downloadFailed = traffic.reduce((sum, row) => sum + Number(row.failed || 0), 0);
    const [coverage, ingest] = await Promise.all([
      db.from("media_traffic_meta").select("key,value").eq("key", "first_ingest_at").maybeSingle(),
      db.from("media_traffic_meta").select("key,value").eq("key", "last_ingest_at").maybeSingle(),
    ]);

    return {
      range: { key: bounds.key, label: bounds.label, from: bounds.fromDay, to: bounds.toDay, days: daysBetween(bounds.fromDay, bounds.toDay).length },
      upload: {
        tasks: uploads.length,
        ready: ready.length,
        failed: failed.length,
        fileBytes,
        transferredBytes,
        retryExtraBytes,
        retryTasks: retryRows.length,
        firstRate: uploads.length ? Number(((firstTryReady.length / uploads.length) * 100).toFixed(1)) : null,
        finalRate: uploads.length ? Number(((ready.length / uploads.length) * 100).toFixed(1)) : null,
        series: uploadSeries,
      },
      download: {
        requests: downloadRequests,
        bytes: downloadBytes,
        failed: downloadFailed,
        byKind: [...byKind.values()].sort((a, b) => b.bytes - a.bytes),
        series: downloadSeries,
      },
      storage: {
        bytes: Number(storage.data?.bytes || 0),
        objects: Number(storage.data?.objects || 0),
        byKind: storage.data?.by_kind || [],
        byBucket: storage.data?.by_bucket || [],
        capturedAt: storage.data?.captured_at || null,
      },
      coverage: {
        firstDay: coverage.data?.value ? String(coverage.data.value).slice(0, 10) : null,
        ingestAt: ingest.data?.value || null,
        note: "下载/访问字节来自反向代理访问日志的真实响应字节；上传字节为客户端上报的 bytes_sent。二者与存储容量是三种口径。",
      },
    };
  });
}
