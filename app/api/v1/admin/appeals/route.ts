import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "appeals.manage");
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "open";
    if (!["open", "accepted", "rejected", "all"].includes(status)) throw new ApiError(400, "申诉状态无效");
    const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(params.get("limit")) || 20));
    let query = db.from("moderation_appeals").select("id,appellant_id,target_type,target_id,target_title,reason,status,review_note,handled_at,created_at,profiles!moderation_appeals_appellant_id_fkey(nickname)", { count: "exact" }).order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const result = await query.range((page - 1) * limit, page * limit - 1);
    dbError(result.error);
    return { items: result.data || [], total: result.count || 0, page, limit };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "appeals.manage");
    const body = await jsonBody(req);
    if (body.status !== "accepted" && body.status !== "rejected") throw new ApiError(400, "申诉决定无效");
    const id = uuid(body.id, "申诉");
    const reviewNote = textField(body.review_note, "处理说明", 3, 500);
    const result = await db.rpc("resolve_moderation_appeal", { p_id: id, p_decision: body.status, p_review_note: reviewNote });
    dbError(result.error);
    const data = result.data as { id: string; status: string; target_type: string; target_id: string };
    await recordModerationAudit(db, { actorId: user.id, action: body.status === "accepted" ? "moderation_appeal_accepted" : "moderation_appeal_rejected", targetType: data.target_type, targetId: data.target_id, reason: reviewNote });
    return data;
  });
}
