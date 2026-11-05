import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "all";
    if (!["all", "visible", "hidden"].includes(status)) throw new ApiError(400, "评论状态筛选无效");
    const queryText = (params.get("q") || "").trim().replace(/[%_,]/g, "").slice(0, 80);
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(50, Number(params.get("limit")) || 30));
    const service = adminClient();
    let query = service.from("comments").select("id,post_id,author_id,parent_id,body,status,created_at", { count: "exact" }).order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    if (queryText) query = query.ilike("body", `%${queryText}%`);
    const { data, error, count } = await query.range((page - 1) * limit, page * limit - 1);
    dbError(error);
    const rows = data || [];
    const [profiles, posts] = await Promise.all([
      rows.length ? service.from("profiles").select("id,nickname").in("id", [...new Set(rows.map((row) => row.author_id))]) : Promise.resolve({ data: [], error: null }),
      rows.length ? service.from("posts").select("id,title").in("id", [...new Set(rows.map((row) => row.post_id))]) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(profiles.error); dbError(posts.error);
    const nicknameById = new Map((profiles.data || []).map((profile) => [profile.id, profile.nickname || "探索者"]));
    const titleById = new Map((posts.data || []).map((post) => [post.id, post.title]));
    return {
      items: rows.map((row) => ({ ...row, author: nicknameById.get(row.author_id) || "探索者", post_title: titleById.get(row.post_id) || "作品已删除" })),
      total: count || 0, page, limit,
    };
  });
}
