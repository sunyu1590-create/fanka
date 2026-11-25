import { NextRequest } from "next/server";
import { respond, dbError, ApiError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { requestMetricsSnapshot } from "@/lib/server/request-metrics";

export const runtime = "nodejs";

const RANGES: Record<string, { hours: number; bucketMinutes: number }> = {
  "15m": { hours: 0.25, bucketMinutes: 1 },
  "1h": { hours: 1, bucketMinutes: 1 },
  "24h": { hours: 24, bucketMinutes: 15 },
  "7d": { hours: 24 * 7, bucketMinutes: 120 },
};

/**
 * 系统监控数据。GET 无参数 = 总览（最新一条 system_metrics + 实时请求指标 + 告警摘要）；
 * ?range=15m|1h|24h|7d = 历史趋势（采集器写入的真实历史，无数据时返回空数组，不伪造曲线）。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "audit.read");
    const range = req.nextUrl.searchParams.get("range");

    if (range) {
      const config = RANGES[range];
      if (!config) throw new ApiError(400, "时间范围无效");
      const since = new Date(Date.now() - config.hours * 3600 * 1000).toISOString();
      const { data, error } = await db
        .from("system_metrics")
        .select("captured_at,cpu_percent,mem_percent,disk_percent,load1,net_rx_rate,net_tx_rate,api_requests,api_errors,api_avg_ms,api_p95_ms,upload_success_rate,upload_tasks,upload_failed")
        .gte("captured_at", since)
        .order("captured_at", { ascending: true })
        .limit(2000);
      dbError(error);
      return { range, bucket_minutes: config.bucketMinutes, points: data || [], note: (data || []).length ? undefined : "该时间范围内暂无历史数据（监控采集器尚未积累足够样本）" };
    }

    const [{ data: latest, error: latestError }, { data: alertRows, error: alertError }] = await Promise.all([
      db.from("system_metrics").select("*").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("system_alerts").select("id,alert_type,level,title,detail,status,first_seen_at,last_seen_at,occurrences").neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(20),
    ]);
    dbError(latestError);
    dbError(alertError);
    // request-metrics 里的 error_rate 是百分数（0-100），管理端统一按 0-1 小数渲染，
    // 在接口层换算一次，避免 0.44% 被显示成 44.0%。
    const rawLive = requestMetricsSnapshot();
    const asRatio = (window: typeof rawLive.m1) => ({ ...window, error_rate: Number(window.error_rate) / 100 });
    return {
      current: latest || null,
      live_requests: { ...rawLive, m1: asRatio(rawLive.m1), m5: asRatio(rawLive.m5), m15: asRatio(rawLive.m15) },
      open_alerts: alertRows || [],
      has_history: Boolean(latest),
    };
  });
}
