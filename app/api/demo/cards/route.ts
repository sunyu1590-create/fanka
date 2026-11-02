import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  ApiError,
} from "@/lib/server/api";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";
import { cardRarityTier } from "@/lib/progression";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    if (req.nextUrl.searchParams.get("mode") !== "discover") {
      const { data, error } = await db
        .from("posts")
        .select("client_id")
        .eq("status", "published")
        .order("client_id")
        .limit(1000);
      dbError(error);
      return data!.map((row) => ({ id: Number(row.client_id) }));
    }
    const page = Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(48, Number(req.nextUrl.searchParams.get("limit")) || 24));
    const tag = (req.nextUrl.searchParams.get("tag") || "").trim().slice(0, 24);
    let tagId: number | undefined;
    if (tag && tag !== "全部") {
      const { data: topic, error: tagError } = await db
        .from("interest_tags")
        .select("id")
        .eq("name", tag)
        .eq("active", true)
        .maybeSingle();
      dbError(tagError);
      if (!topic) return { items: [], total: 0, page, limit };
      tagId = Number(topic.id);
    }
    let query = db
      .from("posts")
      .select(libraryFields, { count: "exact" })
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .order("client_id", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (tagId !== undefined) query = query.eq("tag_id", tagId);
    const { data, error, count } = await query;
    dbError(error);
    const rows = (data as unknown as LibraryRow[] || []);
    const { data: stats, error: statsError } = rows.length
      ? await db
        .from("post_rating_stats")
        .select("post_id,rating_count,rating_sum")
        .in("post_id", rows.map((row) => row.id))
      : { data: [], error: null };
    dbError(statsError);
    const byPost = new Map((stats || []).map((stat) => [stat.post_id, stat]));
    return {
      items: rows.map((row) => {
        const stat = byPost.get(row.id);
        const ratingCount = stat?.rating_count || 0;
        const average = ratingCount ? stat!.rating_sum / ratingCount : 0;
        return { ...present(row), rarityTier: cardRarityTier(average, ratingCount) };
      }),
      total: count || 0,
      page,
      limit,
    };
  });
}
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const body = await jsonBody(req);
    if (Array.isArray(body.ids)) {
      const ids = [...new Set(body.ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100);
      if (!ids.length) return { items: [] };
      const { data, error } = await db
        .from("posts")
        .select(libraryFields)
        .eq("status", "published")
        .in("client_id", ids);
      dbError(error);
      const rows = (data || []) as unknown as LibraryRow[];
      if (!rows.length) return { items: [] };
      const { data: stats, error: statsError } = await db
        .from("post_rating_stats")
        .select("post_id,rating_count,rating_sum")
        .in("post_id", rows.map((row) => row.id));
      dbError(statsError);
      const byPost = new Map((stats || []).map((stat) => [stat.post_id, stat]));
      const items = rows.map((row) => {
        const stat = byPost.get(row.id);
        const count = stat?.rating_count || 0;
        const average = count ? stat!.rating_sum / count : 0;
        return { ...present(row), rarityTier: cardRarityTier(average, count) };
      });
      const byClientId = new Map(items.map((item) => [item.id, item]));
      return { items: ids.flatMap((id) => byClientId.has(id) ? [byClientId.get(id)!] : []) };
    }
    const id = Number(body.id);
    if (!Number.isSafeInteger(id)) throw new ApiError(400, "卡片无效");
    const { data, error } = await db
      .from("posts")
      .select(libraryFields)
      .eq("client_id", id)
      .single();
    dbError(error);
    const post = data as unknown as LibraryRow;
    const { data: stats, error: statsError } = await db
      .from("post_rating_stats")
      .select("rating_count,rating_sum")
      .eq("post_id", post.id)
      .maybeSingle();
    dbError(statsError);
    const count = stats?.rating_count || 0;
    const average = count ? stats!.rating_sum / count : 0;
    return { ...present(post), rarityTier: cardRarityTier(average, count) };
  });
}
