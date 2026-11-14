import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, respond, uuid } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requireAdmin } from "@/lib/server/require-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const id = uuid((await params).id, "卡密编号");
    const service = adminClient();
    const { data, error } = await service.from("redeem_codes").update({ status: "disabled", disabled_at: new Date().toISOString(), disabled_by: user.id }).eq("id", id).eq("status", "available").select("id,batch_id,code_suffix,status").maybeSingle();
    if (error) throw new ApiError(400, "卡密停用失败");
    if (!data) throw new ApiError(409, "卡密已兑换、已停用或不存在");
    await recordModerationAudit(db, { actorId: user.id, action: "membership_code_disabled", targetType: "redeem_code", targetId: id, reason: `停用末四位 ${data.code_suffix}`, details: { batchId: data.batch_id } });
    return { id: data.id, status: data.status };
  });
}
