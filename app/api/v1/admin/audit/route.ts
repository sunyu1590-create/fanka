import { NextRequest } from "next/server";
import { dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const page = Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit")) || 50));
    const { data, error, count } = await db.from("moderation_audit_logs")
      .select("id,actor_id,action,target_type,target_id,reason,details,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    dbError(error);
    const rows = data || [];
    const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length ? await db.from("profiles").select("id,nickname").in("id", actorIds) : { data: [], error: null };
    dbError(actors.error);
    const names = new Map((actors.data || []).map((actor) => [actor.id, actor.nickname || "管理员"]));
    return { items: rows.map((row) => ({ ...row, actor: row.actor_id ? names.get(row.actor_id) || "管理员" : "系统" })), total: count || 0, page, limit };
  });
}
