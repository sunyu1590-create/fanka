import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { costReport } from "@/lib/server/cost";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const token = process.env.AI_TASK_WORKER_TOKEN;
  if (!token || token.length < 16) return false;
  const header = req.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== token.length) return false;
  let diff = 0;
  for (let index = 0; index < token.length; index += 1) diff |= token.charCodeAt(index) ^ provided.charCodeAt(index);
  return diff === 0;
}

/** 由监控采集器每 5 分钟调用：按管理员配置的预算生成/恢复告警，绝不因此限制任何业务。 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const db = adminClient();
    const report = await costReport(db);
    const checked: Array<{ key: string; state: string }> = [];
    for (const budget of report.budgets) {
      if (!budget.limit || budget.limit <= 0) continue;
      const type = `budget_${budget.key}`;
      const over = budget.ratio != null && budget.ratio >= 1;
      const { data: existing } = await db.from("system_alerts").select("id,status,occurrences").eq("alert_type", type).neq("status", "resolved").limit(1).maybeSingle();
      if (over) {
        const detail = `${budget.label} ${budget.used.toFixed(2)} / ${budget.limit} ${budget.unit}`;
        if (existing) {
          await db.from("system_alerts").update({ detail, last_seen_at: new Date().toISOString(), occurrences: Number(existing.occurrences || 1) + 1 }).eq("id", existing.id);
        } else {
          await db.from("system_alerts").insert({ alert_type: type, level: budget.key === "monthly" ? "critical" : "warning", title: `${budget.label}超出预算`, detail, status: "open", metric_snapshot: { used: budget.used, limit: budget.limit, unit: budget.unit } });
        }
        checked.push({ key: budget.key, state: "alert" });
      } else if (existing) {
        await db.from("system_alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", existing.id);
        checked.push({ key: budget.key, state: "resolved" });
      }
    }
    return Response.json({ data: { checked, configured: report.configured } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "budget check failed" }, { status: 500 });
  }
}
