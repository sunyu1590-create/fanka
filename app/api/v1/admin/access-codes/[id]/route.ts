import { NextRequest } from "next/server";
import { ApiError, dbError, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const id = uuid((await params).id, "邀请码");
    const result = await adminClient().from("access_codes").update({ status: "disabled" }).eq("id", id).eq("status", "unused").select("id").maybeSingle();
    dbError(result.error);
    if (!result.data) throw new ApiError(409, "邀请码不存在、已兑换或已停用");
    await recordModerationAudit(db, { actorId: user.id, action: "access_code_disabled", targetType: "access_code", targetId: id, reason: "管理员停用未兑换邀请码" });
    return { disabled: true };
  });
}
