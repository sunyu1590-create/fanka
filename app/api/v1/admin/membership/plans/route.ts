import { NextRequest } from "next/server";
import { dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const result = await db.from("membership_plans")
      .select("tier,name,daily_flip_allowance,price_cents,currency,duration_days,active,sort_order,updated_at")
      .order("sort_order");
    dbError(result.error);
    return { items: result.data || [] };
  });
}
