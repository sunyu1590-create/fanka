import { NextRequest } from "next/server";
import { respond, ApiError, dbError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 首页趋势图数据源。范围与桶宽按实际采样能力设定：
 * - system_metrics 每 15 秒采样，5 分钟→30 秒桶、15 分钟→60 秒桶；
 * - 1 小时→5 分钟桶、24 小时→30 分钟桶；
 * - TCP 摘要每分钟一行，5 分钟范围只有约 5 个点，空档不补零；
 * - 访问日志保留 30 天，24 小时范围完整可用。
 */
const RANGES = {
  "5m": { ms: 5 * 60_000, bucket: 30, label: "5 分钟" },
  "15m": { ms: 15 * 60_000, bucket: 60, label: "15 分钟" },
  "1h": { ms: 60 * 60_000, bucket: 300, label: "1 小时" },
  "24h": { ms: 24 * 60 * 60_000, bucket: 1800, label: "24 小时" },
} as const;

const METRICS: Record<string, { unit: string; label: string; axis: "percent" | "bytes" | "count" }> = {
  cpu: { unit: "%", label: "CPU", axis: "percent" },
  mem: { unit: "%", label: "内存", axis: "percent" },
  disk: { unit: "%", label: "磁盘", axis: "percent" },
  net_rx: { unit: "B/s", label: "入站流量", axis: "bytes" },
  net_tx: { unit: "B/s", label: "出站流量", axis: "bytes" },
  tcp: { unit: "个", label: "TCP 连接", axis: "count" },
  requests: { unit: "次", label: "访问请求", axis: "count" },
  errors: { unit: "%", label: "错误率", axis: "percent" },
};

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "audit.read");
    const metric = req.nextUrl.searchParams.get("metric") || "cpu";
    const rangeKey = (req.nextUrl.searchParams.get("range") || "15m") as keyof typeof RANGES;
    const config = RANGES[rangeKey];
    const meta = METRICS[metric];
    if (!config) throw new ApiError(400, "时间范围无效");
    if (!meta) throw new ApiError(400, "未知指标");

    const to = new Date();
    const from = new Date(to.getTime() - config.ms);
    const { data, error } = await db.rpc("heika_admin_metric_series", {
      p_metric: metric,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket_seconds: config.bucket,
    });
    dbError(error);

    const points = (data || [])
      .map((row: { bucket: string; value: number | string | null }) => ({
        t: Date.parse(row.bucket),
        v: row.value == null ? null : Number(row.value),
      }))
      .filter((point: { t: number; v: number | null }) => Number.isFinite(point.t) && point.v != null && Number.isFinite(point.v));

    return {
      metric,
      range: { key: rangeKey, label: config.label, from: from.toISOString(), to: to.toISOString(), bucket_seconds: config.bucket },
      unit: meta.unit,
      label: meta.label,
      axis: meta.axis,
      points,
      note: points.length
        ? undefined
        : metric === "tcp"
          ? "该范围内没有 TCP 摘要样本（采集器每分钟写入一次，保留 24 小时）"
          : "该范围内暂无采集数据",
    };
  });
}
