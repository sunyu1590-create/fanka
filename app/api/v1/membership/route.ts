import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const service = adminClient();
    const now = new Date().toISOString();
    const [periods, plans, flip, experience] = await Promise.all([
      service.from("user_membership_periods").select("tier,starts_at,ends_at,source").eq("user_id", user!.id).is("revoked_at", null).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("starts_at", { ascending: false }).limit(1),
      db.from("membership_plans").select("tier,display_name,daily_flips,duration_days,support_price_cents,currency,benefits").eq("enabled", true).order("daily_flips"),
      db.rpc("get_daily_flip_state"),
      db.rpc("my_experience_summary"),
    ]);
    for (const result of [periods, plans, flip, experience]) dbError(result.error);
    const active = periods.data?.[0];
    // Membership periods are the authority; the profile field is a compatibility
    // snapshot and can lag the expiry scheduler between runs.
    const tier = active?.tier || "free";
    const queued = await service.from("user_membership_periods").select("tier,starts_at,ends_at").eq("user_id", user!.id).is("revoked_at", null).gt("starts_at", now).order("starts_at", { ascending: true }).limit(1);
    dbError(queued.error);
    return {
      tier,
      expiresAt: active?.ends_at || null,
      nextMembership: queued.data?.[0] || null,
      dailyAllowance: flip.data?.allowance ?? 0,
      remaining: flip.data?.remaining ?? 0,
      used: flip.data?.used ?? 0,
      experience: experience.data?.total ?? 0,
      plans: plans.data || [],
    };
  });
}
