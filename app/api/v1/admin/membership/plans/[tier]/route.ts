import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, dbError, jsonBody, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tier: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const tier = (await params).tier;
    if (tier !== "free" && tier !== "plus" && tier !== "pro") throw new ApiError(404, "会员方案不存在");
    const body = await jsonBody(req);
    const dailyFlips = Number(body.dailyFlips);
    const priceCents = Number(body.priceCents);
    const durationDays = tier === "free" ? null : Number(body.durationDays);
    if (!Number.isInteger(dailyFlips) || dailyFlips < 1 || dailyFlips > 100) throw new ApiError(400, "每日翻卡额度需为 1–100 次");
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 1_000_000 || (tier === "free" && priceCents !== 0)) throw new ApiError(400, "方案金额无效");
    if (tier !== "free" && (!Number.isInteger(durationDays) || durationDays! < 1 || durationDays! > 7300)) throw new ApiError(400, "会员期限需为 1–7300 天");
    if (typeof body.enabled !== "boolean" || (tier === "free" && !body.enabled)) throw new ApiError(400, "Free 方案必须保持启用");

    const { data, error } = await adminClient().from("membership_plans").update({
      daily_flips: dailyFlips,
      support_price_cents: priceCents,
      duration_days: durationDays,
      enabled: body.enabled,
      updated_at: new Date().toISOString(),
    }).eq("tier", tier).select("tier,display_name,daily_flips,duration_days,support_price_cents,currency,benefits,enabled").single();
    dbError(error);
    await recordModerationAudit(db, { actorId: user.id, action: "membership_plan_updated", targetType: "membership_plan", targetId: tier, reason: `更新 ${tier.toUpperCase()} 方案额度、期限或支持金额`, details: data as Record<string, unknown> });
    return data;
  });
}
