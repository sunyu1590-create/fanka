import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { dbError, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireAdmin(req);
    const batchId = uuid((await params).id, "批次编号");
    const { data, error } = await adminClient().from("redeem_codes").select("id,code_suffix,tier,duration_days,status,created_at,redeemed_at,expires_at").eq("batch_id", batchId).order("created_at", { ascending: true }).limit(1000);
    dbError(error);
    return { items: data || [] };
  });
}
