import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

const tiers = new Set(["free", "plus", "pro"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tier: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const tier = (await params).tier;
    if (!tiers.has(tier)) throw new ApiError(400, "会员档位无效");
    const body = await jsonBody(req);
    const dailyFlips = Number(body.dailyFlips);
    const priceCents = Number(body.priceCents);
    if (!Number.isInteger(dailyFlips) || dailyFlips < 1 || dailyFlips > 100) throw new ApiError(400, "每日翻卡次数需为 1–100");
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 1000000) throw new ApiError(400, "方案金额无效");
    if (typeof body.enabled !== "boolean") throw new ApiError(400, "方案状态无效");
    let durationDays: number | null = null;
    if (tier !== "free") {
      const raw = body.durationDays === undefined || body.durationDays === null ? 30 : Number(body.durationDays);
      if (!Number.isInteger(raw) || raw < 1 || raw > 7300) throw new ApiError(400, "权益天数需为 1–7300 天");
      durationDays = raw;
    }
    if (tier === "free" && (priceCents !== 0 || !body.enabled)) throw new ApiError(400, "Free 方案必须免费且保持启用");
    const patch: Record<string, unknown> = {
      daily_flip_allowance: dailyFlips,
      price_cents: tier === "free" ? 0 : priceCents,
      active: body.enabled,
      updated_at: new Date().toISOString(),
    };
    if (durationDays !== null) patch.duration_days = durationDays;
    // Plan rows are service-role writable only; the admin check above already
    // gates access, so the privileged client performs the update.
    const updated = await adminClient().from("membership_plans").update(patch).eq("tier", tier)
      .select("tier,name,daily_flip_allowance,price_cents,currency,duration_days,benefits,active,sort_order,updated_at").maybeSingle();
    dbError(updated.error);
    if (!updated.data) throw new ApiError(404, "会员方案不存在");
    await recordModerationAudit(db, {
      actorId: user.id, action: "membership_plan_updated", targetType: "membership_plan", targetId: tier,
      reason: `调整 ${tier.toUpperCase()} 方案：每日 ${dailyFlips} 次 / ${priceCents} 分 / ${body.enabled ? "启用" : "停用"}`,
      details: { tier, dailyFlips, priceCents, durationDays, enabled: body.enabled },
    });
    return updated.data;
  });
}
