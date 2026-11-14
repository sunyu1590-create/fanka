import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req); const body = await jsonBody(req); const id = uuid((await params).id, "批次 ID");
    if (typeof body.active !== "boolean") throw new ApiError(400, "批次状态无效");
    const result = await db.rpc("admin_set_membership_batch_active", { p_batch_id: id, p_active: body.active }); dbError(result.error);
    await recordModerationAudit(db, { actorId: user.id, action: body.active ? "membership_batch_resumed" : "membership_batch_paused", targetType: "membership_batch", targetId: id, reason: body.active ? "恢复卡密批次" : "停用卡密批次" });
    return { active: result.data };
  });
}
