import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const [membership, plans] = await Promise.all([
      user ? db.rpc("get_my_membership_status") : Promise.resolve({ data: null, error: null }),
      db.from("membership_plans").select("tier,name,daily_flip_allowance,price_cents,currency,duration_days,benefits,active,sort_order").eq("active", true).order("sort_order"),
    ]);
    dbError(membership.error);
    dbError(plans.error);
    return { membership: membership.data, plans: plans.data || [] };
  });
}
