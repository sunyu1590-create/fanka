import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requirePermission } from "@/lib/server/require-permission";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "reports.manage");
    const body = await jsonBody(req);
    if (body.status !== "resolved" && body.status !== "dismissed") throw new ApiError(400, "处理状态无效");
    const reviewNote = textField(body.review_note, "处理说明", 3, 500);
    const { data, error } = await db.from("reports").update({
      status: body.status,
      review_note: reviewNote,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }).eq("id", uuid((await params).id)).select("id,status,review_note,reviewed_at").single();
    dbError(error);
    if (!data) throw new ApiError(404, "举报不存在或已处理");
    await recordModerationAudit(db, { actorId: user.id, action: body.status === "resolved" ? "report_resolved" : "report_dismissed", targetType: "report", targetId: data.id, reason: reviewNote });
    return data;
  });
}
