import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requireAdmin } from "@/lib/server/require-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const id = uuid((await params).id, "用户编号");
    const body = await jsonBody(req);
    if (!["free", "plus", "pro"].includes(String(body.tier))) throw new ApiError(400, "会员等级无效");
    const tier = String(body.tier);
    const durationDays = tier === "free" ? null : Number(body.durationDays);
    if (tier !== "free" && (!Number.isInteger(durationDays) || durationDays! < 1 || durationDays! > 7300)) throw new ApiError(400, "有效天数需为 1–7300 天");
    const reason = textField(body.reason, "操作原因", 3, 500);
    const { data, error } = await adminClient().rpc("admin_adjust_membership", { p_user_id: id, p_actor_id: user.id, p_tier: tier, p_duration_days: durationDays, p_reason: reason });
    dbError(error);
    await recordModerationAudit(db, { actorId: user.id, action: tier === "free" ? "membership_revoked" : "membership_adjusted", targetType: "user", targetId: id, reason, details: data as Record<string, unknown> });
    return data;
  });
}
