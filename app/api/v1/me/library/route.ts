import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";

type IdRow = { post_id: string };

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const params = req.nextUrl.searchParams;
    const kind = params.get("kind") || "bookmarks";
    if (!["bookmarks", "liked", "recent", "own"].includes(kind)) throw new ApiError(400, "收藏分类无效");
    const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(params.get("limit")) || 24));
    const from = (page - 1) * limit;

    if (kind === "own") {
      const { data, error } = await db.from("posts").select(libraryFields).eq("author_id", user!.id)
        .order("updated_at", { ascending: false }).order("id", { ascending: false }).range(from, from + limit);
      dbError(error);
      const rows = (data || []) as unknown as LibraryRow[];
      const hasMore = rows.length > limit;
      return { items: await presentMany(db, rows.slice(0, limit)), has_more: hasMore, next_page: hasMore ? page + 1 : null };
    }

    let query = db.from(kind === "bookmarks" ? "bookmarks" : "user_interactions")
      .select("post_id")
      .eq("user_id", user!.id)
      .order(kind === "recent" ? "viewed_at" : "post_id", { ascending: kind !== "recent" })
      .order("post_id", { ascending: true })
      .range(from, from + limit);
    if (kind === "liked") query = query.eq("liked", true);
    if (kind === "recent") query = query.not("viewed_at", "is", null);
    const { data: idsData, error: idsError } = await query;
    dbError(idsError);
    const rows = (idsData || []) as IdRow[];
    const hasMore = rows.length > limit;
    const ids = rows.slice(0, limit).map((row) => row.post_id);
    if (!ids.length) return { items: [], has_more: false, next_page: null };
    const { data: posts, error: postsError } = await db.from("posts").select(libraryFields).in("id", ids).eq("status", "published");
    dbError(postsError);
    const presented = await presentMany(db, (posts || []) as unknown as LibraryRow[]);
    const byId = new Map(presented.map((post) => [post.cloudId, post]));
    return {
      items: ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []),
      has_more: hasMore,
      next_page: hasMore ? page + 1 : null,
    };
  });
}
