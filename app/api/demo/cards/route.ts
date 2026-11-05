import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  ApiError,
} from "@/lib/server/api";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";
import { cardRarityTier } from "@/lib/progression";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    if (req.nextUrl.searchParams.get("mode") !== "discover") {
      const { data, error } = await db
        .from("posts")
        .select("client_id")
        .eq("status", "published")
        .eq("channel", "community")
        .order("client_id")
        .limit(1000);
      dbError(error);
      return data!.map((row) => ({ id: Number(row.client_id) }));
    }
    const limit = Math.max(1, Math.min(24, Number(req.nextUrl.searchParams.get("limit")) || 24));
    const tag = (req.nextUrl.searchParams.get("tag") || "").trim().slice(0, 24);
    const followingOnly = req.nextUrl.searchParams.get("following") === "1";
    const cursorCreatedAt = req.nextUrl.searchParams.get("cursorCreatedAt");
    const cursorPostId = req.nextUrl.searchParams.get("cursorPostId");
    if (Boolean(cursorCreatedAt) !== Boolean(cursorPostId)) throw new ApiError(400, "内容游标无效");
    if (cursorCreatedAt && (!Number.isFinite(Date.parse(cursorCreatedAt)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursorPostId || ""))) {
      throw new ApiError(400, "内容游标无效");
    }
    let followedCreatorIds: string[] | null = null;
    if (followingOnly) {
      if (!user) return { items: [], total: 0, hasMore: false, cursor: null, limit };
      const { data: follows, error: followsError } = await db.from("creator_follows").select("creator_id").eq("follower_id", user.id);
      dbError(followsError);
      followedCreatorIds = (follows || []).map((item) => item.creator_id);
      if (!followedCreatorIds.length) return { items: [], total: 0, hasMore: false, cursor: null, limit };
    }
    let tagId: number | undefined;
    if (tag && tag !== "全部") {
      const { data: topic, error: tagError } = await db
        .from("interest_tags")
        .select("id")
        .eq("name", tag)
        .eq("active", true)
        .maybeSingle();
      dbError(tagError);
      if (!topic) return { items: [], total: 0, hasMore: false, cursor: null, limit };
      tagId = Number(topic.id);
    }
    let rows: LibraryRow[];
    let total: number | null = 0;
    let hasMore = false;
    if (!followedCreatorIds) {
      const pageResult = await db.rpc("get_discover_cursor", {
        p_limit: limit,
        p_tag: tagId ?? null,
        p_cursor_created_at: cursorCreatedAt,
        p_cursor_id: cursorPostId,
      });
      dbError(pageResult.error);
      const payload = pageResult.data as { ids?: string[]; total?: number | null; has_more?: boolean };
      const ids = Array.isArray(payload?.ids) ? payload.ids : [];
      total = payload?.total == null ? null : Number(payload.total) || 0;
      hasMore = Boolean(payload?.has_more);
      if (!ids.length) return { items: [], total, hasMore: false, cursor: null, limit };
      const { data, error } = await db.from("posts").select(libraryFields).in("id", ids).eq("status", "published");
      dbError(error);
      const byId = new Map(((data || []) as unknown as LibraryRow[]).map((row) => [row.id, row]));
      rows = ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
    } else {
      let query = db
        .from("posts")
        .select(libraryFields, { count: cursorCreatedAt ? undefined : "exact" })
        .eq("status", "published")
        .eq("channel", "community")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (tagId !== undefined) query = query.eq("tag_id", tagId);
      query = query.in("author_id", followedCreatorIds);
      if (cursorCreatedAt && cursorPostId) {
        query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorPostId})`);
      }
      const { data, error, count } = await query.limit(limit + 1);
      dbError(error);
      const candidates = (data as unknown as LibraryRow[] || []);
      hasMore = candidates.length > limit;
      rows = candidates.slice(0, limit);
      total = cursorCreatedAt ? null : count || 0;
    }
    const [ratingResult, likesResult] = await Promise.all([
      rows.length
        ? db.from("post_rating_stats").select("post_id,rating_count,rating_sum").in("post_id", rows.map((row) => row.id))
        : Promise.resolve({ data: [], error: null }),
      rows.length
        ? db.from("post_like_stats").select("post_id,like_count").in("post_id", rows.map((row) => row.id))
        : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(ratingResult.error);
    dbError(likesResult.error);
    const stats = ratingResult.data || [];
    const likes = likesResult.data || [];
    const byPost = new Map((stats || []).map((stat) => [stat.post_id, stat]));
    const likesByPost = new Map((likes || []).map((stat) => [stat.post_id, stat.like_count]));
    const presentations = await presentMany(db, rows);
    return {
      items: rows.map((row, index) => {
        const stat = byPost.get(row.id);
        const ratingCount = stat?.rating_count || 0;
        const average = ratingCount ? stat!.rating_sum / ratingCount : 0;
        return {
          ...presentations[index],
          rarityTier: cardRarityTier(average, ratingCount),
          ratingAverage: average,
          ratingCount,
          likeCount: likesByPost.get(row.id) || 0,
        };
      }),
      total,
      hasMore,
      cursor: rows.length ? { createdAt: rows.at(-1)!.created_at, postId: rows.at(-1)!.id } : null,
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
        .eq("channel", "community")
        .in("client_id", ids);
      dbError(error);
      const rows = (data || []) as unknown as LibraryRow[];
      if (!rows.length) return { items: [] };
      const { data: stats, error: statsError } = await db
        .from("post_rating_stats")
        .select("post_id,rating_count,rating_sum")
        .in("post_id", rows.map((row) => row.id));
      dbError(statsError);
      const { data: likes, error: likesError } = await db
        .from("post_like_stats")
        .select("post_id,like_count")
        .in("post_id", rows.map((row) => row.id));
      dbError(likesError);
      const byPost = new Map((stats || []).map((stat) => [stat.post_id, stat]));
      const likesByPost = new Map((likes || []).map((stat) => [stat.post_id, stat.like_count]));
      const presentations = await presentMany(db, rows);
      const items = rows.map((row, index) => {
        const stat = byPost.get(row.id);
        const count = stat?.rating_count || 0;
        const average = count ? stat!.rating_sum / count : 0;
        return {
          ...presentations[index],
          rarityTier: cardRarityTier(average, count),
          ratingAverage: average,
          ratingCount: count,
          likeCount: likesByPost.get(row.id) || 0,
        };
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
      .eq("channel", "community")
      .single();
    dbError(error);
    const post = data as unknown as LibraryRow;
    const { data: stats, error: statsError } = await db
      .from("post_rating_stats")
      .select("rating_count,rating_sum")
      .eq("post_id", post.id)
      .maybeSingle();
    dbError(statsError);
    const { data: likes, error: likesError } = await db
      .from("post_like_stats")
      .select("like_count")
      .eq("post_id", post.id)
      .maybeSingle();
    dbError(likesError);
    const count = stats?.rating_count || 0;
    const average = count ? stats!.rating_sum / count : 0;
    return {
      ...(await presentMany(db, [post]))[0],
      rarityTier: cardRarityTier(average, count),
      ratingAverage: average,
      ratingCount: count,
      likeCount: likes?.like_count || 0,
    };
  });
}
