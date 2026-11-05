import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: actor, error: actorError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(actorError);
    if (actor?.role !== "admin") throw new ApiError(403, "需要管理员权限");

    const query = (req.nextUrl.searchParams.get("query") || "").trim().replace(/[%,_]/g, "").slice(0, 40);
    const limit = Math.max(1, Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 50));
    let request = db.from("profiles").select("id,nickname,bio,role,membership_tier,created_at,role_updated_at", { count: "exact" }).order("created_at", { ascending: false }).limit(limit);
    if (query) request = request.ilike("nickname", `%${query}%`);
    const { data, error, count } = await request;
    dbError(error);
    const rows = data || [];
    const restrictions = rows.length ? await db.from("community_restrictions")
      .select("user_id,active,restricted_until,reason,updated_at")
      .in("user_id", rows.map((row) => row.id)) : { data: [], error: null };
    dbError(restrictions.error);
    const byUser = new Map((restrictions.data || []).map((item) => [item.user_id, item]));
    return { items: rows.map((row) => ({ ...row, community_restriction: byUser.get(row.id) || null })), total: count || 0, limit };
  });
}
