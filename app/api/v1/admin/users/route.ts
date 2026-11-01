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
    let request = db.from("profiles").select("id,nickname,bio,role,created_at,role_updated_at", { count: "exact" }).order("created_at", { ascending: false }).limit(limit);
    if (query) request = request.ilike("nickname", `%${query}%`);
    const { data, error, count } = await request;
    dbError(error);
    return { items: data || [], total: count || 0, limit };
  });
}
