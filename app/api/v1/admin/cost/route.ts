import { NextRequest } from "next/server";
import { respond, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";
import { costReport } from "@/lib/server/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "audit.read");
    return costReport(adminClient());
  });
}

const NUMERIC_FIELDS = [
  "server_monthly", "storage_per_gb_month", "egress_per_gb",
  "ai_input_per_million", "ai_output_per_million",
  "egress_free_gb", "storage_free_gb", "ai_free_amount",
  "budget_monthly", "budget_egress_gb", "budget_storage_gb", "budget_ai",
] as const;

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "content.manage");
    const body = await jsonBody(req);
    const patch: Record<string, string | number | null> = { updated_at: new Date().toISOString(), updated_by: user.id };
    if (body.currency !== undefined) {
      const currency = String(body.currency).toUpperCase();
      if (!["CNY", "USD", "HKD"].includes(currency)) throw new ApiError(400, "币种无效");
      patch.currency = currency;
    }
    for (const field of NUMERIC_FIELDS) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0 || value > 10_000_000) throw new ApiError(400, `${field} 必须是非负数字`);
      patch[field] = Number(value.toFixed(4));
    }
    const db = adminClient();
    const { data, error } = await db.from("admin_cost_settings").update(patch).eq("id", 1).select().single();
    if (error) throw new ApiError(503, "成本配置保存失败");
    await db.from("admin_action_logs").insert({ actor_id: user.id, action: "cost.update", target: "admin_cost_settings", detail: patch });
    return data;
  });
}
