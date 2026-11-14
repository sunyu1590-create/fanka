import { NextRequest } from "next/server";
import { dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const [statsResult, plansResult, batchesResult, ordersResult] = await Promise.all([
      db.rpc("admin_membership_summary"),
      db.from("membership_plans").select("tier,price_cents,currency,duration_days,daily_flip_allowance").eq("active", true).order("sort_order"),
      db.rpc("admin_membership_batches"),
      db.from("afdian_orders").select("id,provider_order_id,user_id,tier,duration_days,amount_cents,currency,status,verified_at,processed_at,failure_reason,created_at").order("created_at", { ascending: false }).limit(30),
    ]);
    for (const result of [statsResult, plansResult, batchesResult, ordersResult]) dbError(result.error);
    return {
      stats: statsResult.data || {}, plans: plansResult.data || [],
      batches: batchesResult.data || [], orders: ordersResult.data || [],
    };
  });
}
