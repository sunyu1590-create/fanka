import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

const TIERS = new Set(["free", "plus", "pro"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tier: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const tier = (await params).tier.toLowerCase();
    if (!TIERS.has(tier)) throw new ApiError(400, "会员方案无效");
    const body = await jsonBody(req);
    const daily = Number(body.dailyFlips);
    const price = Number(body.priceCents);
    const duration = tier === "free" ? null : Number(body.durationDays);
    if (!Number.isInteger(daily) || daily < 1 || daily > 13) throw new ApiError(400, "每日翻卡额度需为 1–13 次");
    if (!Number.isInteger(price) || price < 0 || price > 1000000 || (tier === "free" && price !== 0)) throw new ApiError(400, "方案金额无效");
    if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 3650)) throw new ApiError(400, "有效天数需为 1–3650 天");
    if (typeof body.enabled !== "boolean" || (tier === "free" && !body.enabled)) throw new ApiError(400, "Free 方案必须保持启用");

    const result = await db.from("membership_plans").update({
      daily_flip_allowance: daily,
      price_cents: price,
      duration_days: duration,
      active: body.enabled,
      updated_at: new Date().toISOString(),
    }).eq("tier", tier).select("tier,name,daily_flip_allowance,price_cents,currency,duration_days,active,sort_order,updated_at").single();
    dbError(result.error);
    await recordModerationAudit(db, {
      actorId: user.id,
      action: "membership_plan_updated",
      targetType: "membership_plan",
      targetId: tier,
      reason: `更新 ${tier.toUpperCase()} 会员方案`,
      details: { daily, price, duration, enabled: body.enabled },
    });
    return result.data;
  });
}
