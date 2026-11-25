import { NextRequest } from "next/server";
import { respond, ApiError, dbError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { dayKey } from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";

const LABELS: Record<Exclude<RangeKey, "custom">, string> = {
  today: "今日",
  yesterday: "昨日",
  "7d": "近 7 天",
  "30d": "近 30 天",
};

/** 业务时区固定 Asia/Shanghai，避免浏览器时区不同导致「今天」口径分裂。 */
function dayStart(offsetDays = 0) {
  const base = new Date(`${dayKey()}T00:00:00+08:00`);
  return new Date(base.getTime() - offsetDays * 24 * 3600 * 1000);
}

function parseRange(req: NextRequest) {
  const range = (req.nextUrl.searchParams.get("range") || "today") as RangeKey;
  const now = new Date();

  if (range === "custom") {
    const fromRaw = req.nextUrl.searchParams.get("from");
    const toRaw = req.nextUrl.searchParams.get("to");
    if (!fromRaw || !toRaw) throw new ApiError(400, "自定义范围需要 from 与 to");
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(400, "时间格式无效");
    if (to <= from) throw new ApiError(400, "结束时间必须晚于开始时间");
    if (to.getTime() - from.getTime() > 366 * 24 * 3600 * 1000) throw new ApiError(400, "自定义范围最长 366 天");
    return { key: range, label: "自定义", from, to };
  }

  if (range === "today") return { key: range, label: LABELS.today, from: dayStart(0), to: now };
  if (range === "yesterday") return { key: range, label: LABELS.yesterday, from: dayStart(1), to: dayStart(0) };
  if (range === "7d") return { key: range, label: LABELS["7d"], from: dayStart(6), to: now };
  if (range === "30d") return { key: range, label: LABELS["30d"], from: dayStart(29), to: now };
  throw new ApiError(400, "时间范围无效");
}

/**
 * 平台运营聚合。一次查询返回用户/访问/内容/互动/会员，
 * 数据全部来自真实业务表与访问日志，不做任何估算或补零。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const range = parseRange(req);
    const { data, error } = await db.rpc("heika_admin_ops_summary", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });
    dbError(error);
    return {
      range: { key: range.key, label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
      summary: data,
    };
  });
}
