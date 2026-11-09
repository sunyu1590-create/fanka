import { NextRequest } from "next/server";
import { dbError, jsonBody, respond, ApiError, textField, uuid } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requirePermission } from "@/lib/server/require-permission";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "reports.manage");
    const { data, error: read } = await db
      .from("dm_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    dbError(read);
    return data;
  });
}
export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "reports.manage");
    const b = await jsonBody(req);
    if (!["resolved", "dismissed"].includes(String(b.status)))
      throw new ApiError(400, "处理状态无效");
    const reviewNote = textField(b.review_note, "处理说明", 3, 500);
    const { data, error: write } = await db
      .from("dm_reports")
      .update({ status: b.status, review_note: reviewNote, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", uuid(b.id))
      .select()
      .single();
    dbError(write);
    await recordModerationAudit(db, { actorId: user.id, action: b.status === "resolved" ? "dm_report_resolved" : "dm_report_dismissed", targetType: "report", targetId: data.id, reason: reviewNote });
    return data;
  });
}
