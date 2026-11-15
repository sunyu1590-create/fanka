import { NextRequest } from "next/server";
import { ApiError, dbError, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const batchId = uuid((await params).id, "批次 ID");
    const batch = await db.from("redeem_code_batches").select("id").eq("id", batchId).maybeSingle();
    dbError(batch.error);
    if (!batch.data) throw new ApiError(404, "卡密批次不存在");
    // The CloudBase database intentionally stores only SHA-256 hashes. Never
    // expose hashes or pretend that the original plaintext can be re-exported.
    const result = await db.from("redeem_codes").select("id,status,tier,duration_days,created_at,redeemed_at,expires_at")
      .eq("batch_id", batchId).order("created_at", { ascending: false }).limit(500);
    dbError(result.error);
    return { items: (result.data || []).map((code) => ({ ...code, status: code.status === "unused" ? "available" : code.status })) };
  });
}
