import { NextRequest } from "next/server";
import { dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req); const body = await jsonBody(req);
    const id = uuid((await params).id, "订单 ID"); const reason = textField(body.reason, body.action === "reject" ? "异常说明" : "人工核验说明", 3, 500);
    const rejected = body.action === "reject";
    const result = await db.rpc(rejected ? "admin_reject_afdian_order" : "admin_verify_afdian_order", { p_order_id: id, p_reason: reason }); dbError(result.error);
    await recordModerationAudit(db, { actorId: user.id, action: rejected ? "afdian_order_marked_invalid" : "afdian_order_manually_verified", targetType: "afdian_order", targetId: id, reason });
    return result.data;
  });
}
