import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "reports.manage");
    const id = uuid((await params).id, "反馈");
    const body = await jsonBody(req);
    if (!["in_progress", "resolved", "dismissed"].includes(String(body.status))) throw new ApiError(400, "处理状态无效");
    const note = body.review_note === "" || body.review_note == null ? null : textField(body.review_note, "处理说明", 1, 1000);
    const { data, error } = await db.from("user_feedback").update({ status: body.status, review_note: note, handled_by: user.id, handled_at: new Date().toISOString() })
      .eq("id", id).select("id,status,review_note,handled_at").maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "反馈不存在");
    await recordModerationAudit(db, { actorId: user.id, action: `user_feedback_${String(body.status)}`, targetType: "user_feedback", targetId: id, reason: note || "更新反馈处理状态" });
    return data;
  });
}
