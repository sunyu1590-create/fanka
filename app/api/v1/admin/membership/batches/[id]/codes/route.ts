import { NextRequest } from "next/server";
import { ApiError, dbError, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statusLabel = (status: string) => status === "unused" ? "available" : status === "redeemed" ? "redeemed" : "disabled";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const id = uuid((await params).id, "批次 ID");
    const batch = await db.from("redeem_code_batches")
      .select("id,label,tier,duration_days,quantity,expires_at,active,created_at")
      .eq("id", id).maybeSingle();
    dbError(batch.error);
    if (!batch.data) throw new ApiError(404, "卡密批次不存在");
    const codes = await db.from("redeem_codes")
      .select("id,tier,duration_days,status,expires_at,redeemed_at,created_at")
      .eq("batch_id", id).order("created_at", { ascending: true }).limit(1000);
    dbError(codes.error);
    return {
      batch: batch.data,
      items: (codes.data || []).map((code) => ({ ...code, status: statusLabel(code.status) })),
    };
  });
}
