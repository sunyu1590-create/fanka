import { NextRequest } from "next/server";
import { respond, ApiError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };

/**
 * 审核质量统计：通过率、复审率、人工推翻率、耗时与 Token、违规类型分布。
 * 数据来自每次审核写入的 ai_moderation_decisions，不按目标通过率倒推。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "ai.read");
    const range = req.nextUrl.searchParams.get("range") || "7d";
    const days = RANGES[range] || 7;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const admin = adminClient();
    const { data: stats, error } = await admin.rpc("admin_moderation_stats", { p_since: since });
    if (error) throw new ApiError(500, "审核统计读取失败（请确认控制中心迁移已执行）");

    const { data: recent } = await db.from("ai_moderation_decisions")
      .select("id,post_id,decision,risk_level,risk_types,reason,reason_code,policy_version,model,elapsed_ms,input_tokens,output_tokens,human_decision,human_at,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(80);

    const totals = (stats?.totals || {}) as Record<string, number>;
    const total = Number(totals.total || 0);
    return {
      range,
      since,
      totals: {
        ...totals,
        pass_rate: total ? Number(totals.pass || 0) / total : null,
        review_rate: total ? Number(totals.review || 0) / total : null,
        reject_rate: total ? Number(totals.reject || 0) / total : null,
        override_rate: totals.human_reviewed ? Number(totals.human_overridden || 0) / Number(totals.human_reviewed) : null,
        tokens: Number(totals.input_tokens || 0) + Number(totals.output_tokens || 0),
      },
      risk_types: stats?.risk_types || [],
      policies: stats?.policies || [],
      recent: recent || [],
      note: total ? undefined : "该时间范围内还没有 AI 审核记录",
    };
  });
}
