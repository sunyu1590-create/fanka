import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const { data, error } = await adminClient().from("afdian_orders").select("id,provider_order_id,plan_id,amount_cents,payment_status,processing_status,redeem_batch_id,received_at,verified_at,issue_note").order("received_at", { ascending: false }).limit(100);
    dbError(error);
    return { items: data || [], automationEnabled: false };
  });
}
