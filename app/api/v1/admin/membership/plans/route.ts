import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const { data, error } = await adminClient().from("membership_plans").select("tier,display_name,daily_flips,duration_days,support_price_cents,currency,benefits,enabled").order("daily_flips");
    dbError(error);
    return { items: data || [] };
  });
}
