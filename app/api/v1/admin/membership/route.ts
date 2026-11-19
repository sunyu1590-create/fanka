import { NextRequest } from "next/server";
import { dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CodeRow = { id: string; batch_id: string; status: string };

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const [statsResult, plansResult, batchesResult, codesResult, ordersResult] = await Promise.all([
      db.rpc("admin_membership_summary"),
      db.from("membership_plans").select("tier,name,price_cents,currency,duration_days,daily_flip_allowance,daily_attachment_allowance,active").order("sort_order"),
      db.from("redeem_code_batches").select("id,label,tier,duration_days,quantity,expires_at,active,created_at").order("created_at", { ascending: false }).limit(50),
      db.from("redeem_codes").select("id,batch_id,status").limit(5000),
      db.from("afdian_orders").select("id,provider_order_id,user_id,tier,duration_days,amount_cents,currency,status,verified_at,processed_at,failure_reason,created_at").order("created_at", { ascending: false }).limit(30),
    ]);
    for (const result of [statsResult, plansResult, batchesResult, codesResult, ordersResult]) dbError(result.error);

    // Batch rows are aggregated here because the database helper only exposes
    // per-batch code ids; both the web console and the native app need counts.
    const grouped = new Map<string, CodeRow[]>();
    for (const code of (codesResult.data || []) as CodeRow[]) {
      const list = grouped.get(code.batch_id);
      if (list) list.push(code);
      else grouped.set(code.batch_id, [code]);
    }
    const batches = ((batchesResult.data || []) as Array<Record<string, unknown> & { id: string }>).map((batch) => {
      const codes = grouped.get(batch.id) || [];
      const unused = codes.filter((code) => code.status === "unused").length;
      const redeemed = codes.filter((code) => code.status === "redeemed").length;
      return {
        ...batch,
        unused,
        redeemed,
        disabled: Math.max(codes.length - unused - redeemed, 0),
        codes: codes.map((code) => ({ id: code.id, status: code.status })),
      };
    });

    return {
      stats: statsResult.data || {}, plans: plansResult.data || [],
      batches, orders: ordersResult.data || [],
    };
  });
}
