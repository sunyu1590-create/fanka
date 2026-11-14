import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req); const body = await jsonBody(req);
    const orderId = textField(body.providerOrderId, "爱发电订单号", 4, 120);
    const userId = uuid(body.userId, "用户 ID"); const tier = String(body.tier || "");
    const days = Number(body.days), amountCents = Number(body.amountCents);
    if (tier !== "plus" && tier !== "pro") throw new ApiError(400, "会员档位无效");
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ApiError(400, "会员有效天数无效");
    if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 10000000) throw new ApiError(400, "订单金额无效");
    const providerUserRef = body.providerUserRef === undefined || body.providerUserRef === null || body.providerUserRef === "" ? null : textField(body.providerUserRef, "爱发电用户标识", 1, 120);
    const result = await db.rpc("admin_record_afdian_order", { p_order_id: orderId, p_user_id: userId, p_tier: tier, p_days: days, p_amount_cents: amountCents, p_provider_user_ref: providerUserRef });
    dbError(result.error);
    await recordModerationAudit(db, { actorId: user.id, action: "afdian_order_recorded", targetType: "afdian_order", targetId: (result.data as { id: string }).id, reason: `登记 ${tier.toUpperCase()} 爱发电订单，等待人工核验`, details: { userId, tier, days, amountCents } });
    return result.data;
  });
}
