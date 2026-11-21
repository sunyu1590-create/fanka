import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

const KINDS = ["serial", "tutorial", "resource"] as const;
const CHANNELS = ["community", "ai"] as const;
const STATUSES = ["ongoing", "completed"] as const;
const safeText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const publicFields = "id,creator_id,title,description,cover_url,kind,channel,category_id,status,is_public,review_status,review_note,pending_public,updated_at,created_at";

type SeriesRow = {
  id: string; creator_id: string; title: string; description: string; cover_url: string | null;
  kind: string; channel: string; category_id: number | null; status: string; is_public: boolean;
  review_status: string; review_note: string | null; pending_public: Record<string, unknown> | null;
  updated_at: string; created_at: string;
};

function presentSeries(row: SeriesRow, extra: Record<string, unknown> = {}) {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    kind: row.kind,
    channel: row.channel,
    categoryId: row.category_id,
    status: row.status,
    isPublic: row.is_public,
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    pendingPublic: row.pending_public,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    ...extra,
  };
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const params = req.nextUrl.searchParams;
    const id = params.get("id");
    const creator = params.get("creator");
    const queryText = (params.get("q") || "").trim().slice(0, 60);
    const scope = params.get("scope");

    const loadSeries = async (seriesId: string) => {
      const { data, error } = await db.from("post_series").select(publicFields).eq("id", seriesId).maybeSingle();
      dbError(error);
      return (data || null) as SeriesRow | null;
    };

    if (id) {
      const series = await loadSeries(uuid(id, "合集"));
      if (!series) throw new ApiError(404, "合集不存在");
      const isOwner = !!user && user.id === series.creator_id;
      if (!isOwner && (series.review_status !== "approved" || !series.is_public)) throw new ApiError(404, "合集暂不可见");
      let itemQuery = db.from("posts")
        .select("id,client_id,title,body,image_url,status,series_order,created_at,author_id")
        .eq("series_id", series.id)
        .order("series_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (!isOwner) itemQuery = itemQuery.eq("status", "published");
      const items = await itemQuery;
      dbError(items.error);
      const postIds = (items.data || []).map((row) => row.id);
      const media = postIds.length
        ? await db.from("post_media").select("post_id,storage_path,sort_order").in("post_id", postIds).order("sort_order", { ascending: true })
        : { data: [], error: null };
      dbError(media.error);
      const mediaByPost = new Map<string, string[]>();
      for (const row of media.data || []) {
        const list = mediaByPost.get(row.post_id) || [];
        list.push(row.storage_path);
        mediaByPost.set(row.post_id, list);
      }
      const profile = await db.from("profiles").select("id,nickname,avatar_url").eq("id", series.creator_id).maybeSingle();
      dbError(profile.error);
      const followCount = await db.from("collection_follows").select("user_id", { count: "exact", head: true }).eq("series_id", series.id);
      const following = user
        ? await db.from("collection_follows").select("notify").eq("series_id", series.id).eq("user_id", user.id).maybeSingle()
        : { data: null, error: null };
      const progress = user
        ? await db.from("collection_progress").select("post_id,updated_at").eq("series_id", series.id).eq("user_id", user.id).maybeSingle()
        : { data: null, error: null };
      const chapters = (items.data || []).map((row, index) => ({
        id: row.id,
        clientId: row.client_id,
        title: row.title,
        excerpt: String(row.body || "").replace(/[#*`>_[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90),
        image: row.image_url || null,
        status: row.status,
        order: row.series_order,
        chapter: index + 1,
        date: String(row.created_at || "").slice(0, 10),
        mediaPaths: mediaByPost.get(String(row.id)) || [],
      }));
      return presentSeries(series, {
        isOwner,
        creator: profile.data ? { id: profile.data.id, nickname: profile.data.nickname, avatarUrl: profile.data.avatar_url } : null,
        chapters,
        publishedCount: chapters.filter((chapter) => chapter.status === "published").length,
        followCount: followCount.count || 0,
        following: !!following.data,
        notify: following.data ? (following.data as { notify: boolean }).notify : true,
        progressPostId: progress.data ? (progress.data as { post_id: string | null }).post_id : null,
      });
    }

    if (queryText) {
      const clean = queryText.replace(/[%,()]/g, "");
      const { data, error } = await db.from("post_series").select(publicFields)
        .eq("review_status", "approved").eq("is_public", true)
        .or(`title.ilike.%${clean}%,description.ilike.%${clean}%`)
        .order("updated_at", { ascending: false }).limit(12);
      dbError(error);
      return { items: ((data || []) as SeriesRow[]).map((row) => presentSeries(row)) };
    }

    const creatorId = creator ? uuid(creator, "创作者") : user?.id;
    if (!creatorId) return { items: [] };
    const isSelf = !!user && user.id === creatorId;
    let query = db.from("post_series").select(publicFields)
      .eq("creator_id", creatorId)
      .order("updated_at", { ascending: false })
      .limit(scope === "all" ? 100 : 50);
    if (!isSelf) query = query.eq("review_status", "approved").eq("is_public", true);
    const { data, error } = await query;
    dbError(error);
    const rows = (data || []) as SeriesRow[];
    const ids = rows.map((row) => row.id);
    const counts = ids.length
      ? await db.from("posts").select("series_id,status").in("series_id", ids).eq("status", "published")
      : { data: [], error: null as null };
    const countBySeries = new Map<string, number>();
    for (const row of counts.data || []) countBySeries.set(String(row.series_id), (countBySeries.get(String(row.series_id)) || 0) + 1);
    return { items: rows.map((row) => presentSeries(row, { publishedCount: countBySeries.get(row.id) || 0 })) };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const action = typeof body.action === "string" ? body.action : "save";

    const loadOwned = async (seriesId: string) => {
      const { data, error } = await db.from("post_series").select(publicFields).eq("id", seriesId).maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "合集不存在");
      if ((data as SeriesRow).creator_id !== user!.id) throw new ApiError(403, "只有合集作者可以修改");
      return data as SeriesRow;
    };

    if (action === "delete") {
      const series = await loadOwned(uuid(body.id, "合集"));
      // 删除合集默认保留其中作品：只解除关联，不删除 posts 行。
      const cleared = await db.from("posts").update({ series_id: null, series_order: null }).eq("series_id", series.id);
      dbError(cleared.error);
      const { error } = await db.from("post_series").delete().eq("id", series.id).eq("creator_id", user!.id);
      dbError(error);
      return { deleted: true };
    }

    if (action === "add_items" || action === "reorder") {
      const seriesId = uuid(body.id, "合集");
      await loadOwned(seriesId);
      const rawIds = Array.isArray(body.postIds) ? body.postIds : [];
      const postIds = rawIds.map((value: unknown) => uuid(value, "作品"));
      if (!postIds.length) throw new ApiError(400, "请选择要加入合集的作品");
      const owned = await db.from("posts").select("id").in("id", postIds).eq("author_id", user!.id);
      dbError(owned.error);
      if ((owned.data || []).length !== postIds.length) throw new ApiError(403, "只能移动自己的作品");
      if (action === "reorder") {
        for (let index = 0; index < postIds.length; index += 1) {
          const { error } = await db.from("posts").update({ series_order: index + 1 }).eq("id", postIds[index]).eq("series_id", seriesId).eq("author_id", user!.id);
          dbError(error);
        }
      } else {
        const base = await db.from("posts").select("id", { count: "exact", head: true }).eq("series_id", seriesId);
        let next = base.count || 0;
        for (const postId of postIds) {
          next += 1;
          const { error } = await db.from("posts").update({ series_id: seriesId, series_order: next }).eq("id", postId).eq("author_id", user!.id);
          dbError(error);
        }
      }
      await db.from("post_series").update({ updated_at: new Date().toISOString() }).eq("id", seriesId);
      return { ok: true, count: postIds.length };
    }

    if (action === "remove_item") {
      const seriesId = uuid(body.id, "合集");
      await loadOwned(seriesId);
      const postId = uuid(body.postId, "作品");
      const { error } = await db.from("posts").update({ series_id: null, series_order: null }).eq("id", postId).eq("series_id", seriesId).eq("author_id", user!.id);
      dbError(error);
      return { removed: true };
    }

    if (action === "follow" || action === "notify") {
      const seriesId = uuid(body.id, "合集");
      if (action === "follow" && body.value === false) {
        const { error } = await db.from("collection_follows").delete().eq("user_id", user!.id).eq("series_id", seriesId);
        dbError(error);
        return { following: false };
      }
      const { error } = await db.from("collection_follows").upsert(
        { user_id: user!.id, series_id: seriesId, notify: body.notify !== false && body.value !== false },
        { onConflict: "user_id,series_id" },
      );
      dbError(error);
      return { following: true, notify: body.notify !== false && body.value !== false };
    }

    if (action === "progress") {
      const seriesId = uuid(body.id, "合集");
      const postId = uuid(body.postId, "章节");
      const { error } = await db.rpc("record_collection_progress", { p_series_id: seriesId, p_post_id: postId });
      dbError(error);
      return { recorded: true };
    }

    // save（新建或更新）
    const title = textField(body.title, "合集名称", 2, 48);
    const description = safeText(body.description, 240);
    const coverUrl = safeText(body.coverUrl, 600) || null;
    const kind = (KINDS as readonly string[]).includes(String(body.kind)) ? String(body.kind) : "serial";
    const channel = (CHANNELS as readonly string[]).includes(String(body.channel)) ? String(body.channel) : "community";
    const status = (STATUSES as readonly string[]).includes(String(body.status)) ? String(body.status) : "ongoing";
    const categoryId = Number(body.categoryId) || null;

    if (body.id) {
      const series = await loadOwned(uuid(body.id, "合集"));
      const publicChanged = series.title !== title
        || series.description !== description
        || (series.cover_url || "") !== (coverUrl || "")
        || series.kind !== kind
        || series.channel !== channel
        || (series.category_id || null) !== categoryId;
      if (!publicChanged) {
        const { data, error } = await db.from("post_series").update({ status, updated_at: new Date().toISOString() }).eq("id", series.id).select(publicFields).single();
        dbError(error);
        return presentSeries(data as SeriesRow);
      }
      // 公开信息变更：线上版本保持不变，新信息进入待审快照。
      const pending = { title, description, cover_url: coverUrl, kind, channel, category_id: categoryId };
      const { data, error } = await db.from("post_series").update({
        status,
        pending_public: pending,
        pending_review_note: null,
        review_status: "pending",
        updated_at: new Date().toISOString(),
      }).eq("id", series.id).select(publicFields).single();
      dbError(error);
      return presentSeries(data as SeriesRow, { awaitingReview: true });
    }

    const { data, error } = await db.from("post_series").insert({
      creator_id: user!.id,
      title,
      description,
      cover_url: coverUrl,
      kind,
      channel,
      category_id: categoryId,
      status,
      review_status: "pending",
      updated_at: new Date().toISOString(),
    }).select(publicFields).single();
    dbError(error);
    return presentSeries(data as SeriesRow, { awaitingReview: true });
  });
}
