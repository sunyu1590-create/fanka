import { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { loadHistory } from "@/lib/server/nexus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 历史回放：只读 system_metrics 的真实快照，范围上限 7 天（采集器保留期）。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "audit.read");
    const params = req.nextUrl.searchParams;
    const to = params.get("to") ? new Date(String(params.get("to"))) : new Date();
    const from = params.get("from") ? new Date(String(params.get("from"))) : new Date(to.getTime() - 3600_000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new ApiError(400, "时间参数无效");
    if (to.getTime() <= from.getTime()) throw new ApiError(400, "结束时间必须晚于开始时间");
    if (to.getTime() - from.getTime() > 7 * 86_400_000) throw new ApiError(400, "单次最多回放 7 天");
    const bucket = Math.max(30, Math.min(3600, Number(params.get("bucket") || Math.max(60, Math.round((to.getTime() - from.getTime()) / 600 / 1000)))));
    return loadHistory(db, from.toISOString(), to.toISOString(), bucket);
  });
}
