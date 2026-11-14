import { NextRequest } from "next/server";
import { dbError, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req); const id = uuid((await params).id, "卡密 ID");
    const result = await db.rpc("admin_disable_membership_code", { p_code_id: id }); dbError(result.error);
    await recordModerationAudit(db, { actorId: user.id, action: "membership_code_disabled", targetType: "membership_code", targetId: id, reason: "停用未兑换卡密" });
    return { disabled: Boolean(result.data) };
  });
}
