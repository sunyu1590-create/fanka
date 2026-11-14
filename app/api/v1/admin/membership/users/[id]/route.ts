import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req); const body = await jsonBody(req);
    const userId = uuid((await params).id, "用户 ID");
    const tier = String(body.tier || "");
    if (!["free", "plus", "pro"].includes(tier)) throw new ApiError(400, "会员等级无效");
    const days = tier === "free" || body.days === null ? null : Number(body.days);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new ApiError(400, "有效天数需为 1–3650 天");
    const reason = textField(body.reason, "操作原因", 3, 500);
    const result = await db.rpc("admin_set_membership", { p_user_id: userId, p_tier: tier, p_days: days, p_reason: reason });
    dbError(result.error);
    await recordModerationAudit(db, { actorId: user.id, action: tier === "free" ? "membership_revoked" : "membership_granted", targetType: "user", targetId: userId, reason, details: { tier, days } });
    return result.data;
  });
}
