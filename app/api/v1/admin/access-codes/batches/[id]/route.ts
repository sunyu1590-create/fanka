import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const id = uuid((await params).id, "批次");
    const body = await jsonBody(req);
    if (typeof body.active !== "boolean") throw new ApiError(400, "批次状态无效");
    const result = await adminClient().from("access_code_batches").update({ active: body.active, updated_at: new Date().toISOString() }).eq("id", id).select("id,active,label,code_kind").maybeSingle();
    dbError(result.error);
    if (!result.data) throw new ApiError(404, "批次不存在");
    await recordModerationAudit(db, { actorId: user.id, action: "access_code_batch_status_changed", targetType: "access_code_batch", targetId: id, reason: body.active ? "恢复邀请码批次" : "停用邀请码批次" });
    return result.data;
  });
}
