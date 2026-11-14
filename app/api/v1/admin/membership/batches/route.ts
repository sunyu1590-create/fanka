import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { generateMembershipCode, hashMembershipCode } from "@/lib/membership-codes";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req); const body = await jsonBody(req);
    const tier = String(body.tier || "");
    if (tier !== "plus" && tier !== "pro") throw new ApiError(400, "卡密会员等级无效");
    const days = Number(body.days), quantity = Number(body.quantity);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ApiError(400, "有效天数需为 1–3650 天");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new ApiError(400, "每批可生成 1–500 个卡密");
    const label = textField(body.label, "批次名称", 1, 100);
    let expiresAt: string | null = null;
    if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "") {
      if (typeof body.expiresAt !== "string" || !Number.isFinite(Date.parse(body.expiresAt))) throw new ApiError(400, "卡密截止日期无效");
      expiresAt = new Date(body.expiresAt).toISOString();
      if (Date.parse(expiresAt) <= Date.now()) throw new ApiError(400, "卡密截止日期必须晚于当前时间");
    }
    const codes = Array.from({ length: quantity }, generateMembershipCode);
    const result = await db.rpc("admin_create_membership_batch", { p_tier: tier, p_days: days, p_label: label, p_expires_at: expiresAt, p_code_hashes: codes.map(hashMembershipCode) });
    dbError(result.error);
    const batch = result.data as { batchId: string; quantity: number };
    await recordModerationAudit(db, { actorId: user.id, action: "membership_codes_created", targetType: "membership_batch", targetId: batch.batchId, reason: `生成 ${quantity} 个 ${tier.toUpperCase()} 激活码`, details: { tier, days, quantity } });
    // Plaintext is returned once only. The database keeps hashes, so this list
    // must be copied or downloaded before leaving the result screen.
    return { ...batch, codes };
  });
}
