import { NextRequest } from "next/server";
import { ApiError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

/** 仅用于审核服务异常后的手动重试；不改变审核策略，也不能用来「人工放行」。 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "ai.manage");
    const id = uuid((await params).id);
    await jsonBody(req).catch(() => ({}));
    const job = await db.from("ai_revision_reviews").select("id,post_id,status").eq("id", id).maybeSingle();
    if (job.error) throw new ApiError(400, "审核记录读取失败");
    if (!job.data) throw new ApiError(404, "审核记录不存在");
    if (!["error", "superseded"].includes(String(job.data.status))) throw new ApiError(409, "只有审核异常或被新版本替代的任务可以重新排队");

    const { data, error } = await adminClient().rpc("retry_ai_revision_review", { p_job_id: id });
    if (error) throw new ApiError(400, "重新排队失败，请稍后再试");
    if (!data?.requeued) throw new ApiError(409, "任务状态已变化，请刷新后重试");

    await recordModerationAudit(db, {
      actorId: user.id,
      action: "ai_revision_review_retried",
      targetType: "post",
      targetId: String(job.data.post_id),
      reason: "管理员手动重新排队 AI 版本审核",
    });
    return { retried: true, jobId: id };
  });
}
