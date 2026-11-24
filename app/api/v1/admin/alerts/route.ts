import { NextRequest } from "next/server";
import { respond, dbError, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export const runtime = "nodejs";

/** 系统告警中心：列表（含历史）与处理（确认 / 处理中 / 恢复）。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "audit.read");
    const status = req.nextUrl.searchParams.get("status");
    let query = db.from("system_alerts").select("id,alert_type,level,title,detail,metric_snapshot,status,first_seen_at,last_seen_at,resolved_at,occurrences,handle_note").order("last_seen_at", { ascending: false }).limit(200);
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    dbError(error);
    return { alerts: data || [] };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "audit.read");
    const body = await jsonBody(req);
    const id = String(body.id || "");
    const action = String(body.action || "");
    if (!id) throw new ApiError(400, "告警编号无效");
    const patch: Record<string, unknown> = { handled_by: user.id };
    if (action === "acknowledge") patch.status = "acknowledged";
    else if (action === "start") patch.status = "resolving";
    else if (action === "resolve") {
      patch.status = "resolved";
      patch.resolved_at = new Date().toISOString();
    } else throw new ApiError(400, "操作无效");
    if (typeof body.note === "string") patch.handle_note = body.note.slice(0, 500);
    const { data, error } = await db.from("system_alerts").update(patch).eq("id", id).select("id,status").maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "告警不存在");
    return { alert: data };
  });
}
