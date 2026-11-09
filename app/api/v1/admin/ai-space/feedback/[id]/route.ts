import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "ai.review");
    const id = uuid((await params).id);
    const body = await jsonBody(req);
    if (body.status !== "resolved" && body.status !== "dismissed") throw new ApiError(400, "反馈处理状态无效");
    const note = textField(body.review_note, "处理说明", 3, 500);
    const result = await db.from("ai_resource_feedback").update({ status: body.status, review_note: note, handled_by: user.id, handled_at: new Date().toISOString() }).eq("id", id).eq("status", "open").select("id,status,post_id").maybeSingle();
    dbError(result.error);
    if (!result.data) throw new ApiError(404, "反馈不存在或已处理");
    await recordModerationAudit(db, { actorId: user.id, action: body.status === "resolved" ? "ai_resource_feedback_resolved" : "ai_resource_feedback_dismissed", targetType: "ai_resource_feedback", targetId: id, reason: note });
    return result.data;
  });
}
