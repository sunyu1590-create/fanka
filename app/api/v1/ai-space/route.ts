import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";
import { AI_CONTENT_TYPES, validateAiResourceData, safeResourceLink, type AiContentType } from "@/lib/ai-resources";
import { splitPostMediaPaths } from "@/lib/media-path";
import { signPostMedia } from "@/lib/server/media";
import { cardRarityTier } from "@/lib/progression";

const safeQuery = (value: string) => value.replace(/[%,_()."\\*]/g, "").slice(0, 60);
const validType = (value: unknown): value is AiContentType => AI_CONTENT_TYPES.includes(value as AiContentType);

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const params = req.nextUrl.searchParams;
    const queryText = safeQuery((params.get("q") || "").trim());
    const type = params.get("type");
    const sort = params.get("sort") || "latest";
    const categoryId = Number(params.get("category")) || null;
    const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(24, Number(params.get("limit")) || 12));
    if (type && !validType(type)) throw new ApiError(400, "AI 内容类型无效");
    let savedIds: string[] | null = null;
    if (params.get("saved") === "1") {
      if (!user) throw new ApiError(401, "登录后查看收藏的 AI 资源");
      const saved = await db.from("bookmarks").select("post_id,posts!inner(channel)").eq("user_id", user.id).eq("posts.channel", "ai").order("created_at", { ascending: false }).limit(500);
      dbError(saved.error);
      savedIds = (saved.data || []).map((row) => row.post_id);
      if (!savedIds.length) return { items: [], total: 0, page, limit };
    }
    let categoryIds = categoryId ? [categoryId] : null;
    if (categoryId) {
      const category = await db.from("interest_tags").select("id,parent_id,channel,kind").eq("id", categoryId).eq("channel", "ai").eq("kind", "category").eq("active", true).maybeSingle();
      dbError(category.error);
      if (category.data && !category.data.parent_id) {
        const children = await db.from("interest_tags").select("id").eq("parent_id", categoryId).eq("channel", "ai").eq("kind", "category").eq("active", true).eq("moderation_status", "approved").is("merged_into_id", null);
        dbError(children.error);
        categoryIds = [categoryId, ...(children.data || []).map((item) => item.id)];
      }
    }
    let request = db.from("posts").select(libraryFields, { count: "exact" }).eq("channel", "ai").eq("status", "published");
    if (type) request = request.eq("content_type", type);
    if (categoryIds) request = request.in("tag_id", categoryIds);
    if (queryText) request = request.or(`title.ilike.%${queryText}%,body.ilike.%${queryText}%`);
    if (sort === "featured") request = request.not("featured_at", "is", null).order("featured_at", { ascending: false });
    else if (sort === "popular") request = request.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    else request = request.order("created_at", { ascending: false });
    if (savedIds) request = request.in("id", savedIds);
    const { data, error, count } = await request.range((page - 1) * limit, page * limit - 1);
    dbError(error);
    const rows = (data || []) as unknown as LibraryRow[];
    if (!rows.length) return { items: [], total: count || 0, page, limit };
    const ids = rows.map((row) => row.id);
    const [ratings, likes, bookmarks] = await Promise.all([
      db.from("post_rating_stats").select("post_id,rating_count,rating_sum").in("post_id", ids),
      db.from("post_like_stats").select("post_id,like_count").in("post_id", ids),
      user ? db.from("bookmarks").select("post_id").eq("user_id", user.id).in("post_id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(ratings.error); dbError(likes.error); dbError(bookmarks.error);
    const ratingMap = new Map((ratings.data || []).map((item) => [item.post_id, item]));
    const likeMap = new Map((likes.data || []).map((item) => [item.post_id, item.like_count]));
    const savedSet = new Set((bookmarks.data || []).map((item) => item.post_id));
    const presented = await presentMany(db, rows);
    return {
      items: rows.map((row, index) => {
        const rating = ratingMap.get(row.id);
        const ratingCount = rating?.rating_count || 0;
        const average = ratingCount ? rating!.rating_sum / ratingCount : 0;
        return { ...presented[index], rarityTier: cardRarityTier(average, ratingCount), ratingAverage: average, ratingCount, likeCount: likeMap.get(row.id) || 0, saved: savedSet.has(row.id) };
      }),
      total: count || 0, page, limit,
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const action = body.action === "submit" ? "submit" : body.action === "draft" ? "draft" : null;
    if (!action) throw new ApiError(400, "AI 内容操作无效");
    const contentType = validType(body.contentType) ? body.contentType : "knowledge_article";
    const title = action === "submit" ? textField(body.title, "标题", 1, 80) : String(body.title || "").trim().slice(0, 80) || "新建 AI 内容";
    const content = action === "submit" ? textField(body.body, "正文", 1, 5000) : String(body.body || "").trim().slice(0, 5000) || "待补充正文";
    const categoryName = typeof body.category === "string" ? body.category.trim() : "";
    if (!categoryName) throw new ApiError(400, "请选择 AI 分类");
    const category = await db.from("interest_tags").select("id,name").eq("name", categoryName).eq("channel", "ai").eq("kind", "category").eq("active", true).eq("moderation_status", "approved").is("merged_into_id", null).maybeSingle();
    dbError(category.error);
    if (!category.data) throw new ApiError(400, "AI 分类已停用，请重新选择");
    const resourceResult = action === "submit" ? validateAiResourceData(contentType, body.resourceData) : (body.resourceData && typeof body.resourceData === "object" && !Array.isArray(body.resourceData) ? body.resourceData as Record<string, unknown> : {});
    if ("error" in resourceResult && typeof resourceResult.error === "string") throw new ApiError(400, resourceResult.error);
    if (Array.isArray(body.mediaPaths) && body.mediaPaths.some((path) => typeof path !== "string")) throw new ApiError(400, "媒体列表格式无效");
    const mediaPaths = Array.isArray(body.mediaPaths) ? [...new Set(body.mediaPaths.filter((path): path is string => typeof path === "string"))] : [];
    const split = splitPostMediaPaths(mediaPaths);
    if (split.images.length > 9 || split.videos.length > 1 || (split.videos.length && split.images.length) || mediaPaths.some((path) => !path.startsWith(`${user!.id}/`) || path.length > 300 || path.includes(".."))) throw new ApiError(400, "媒体无效；最多 9 张图片或 1 段视频");
    if (action === "submit" && mediaPaths.length) {
      const stored = await signPostMedia(db, mediaPaths, 60);
      if (stored.error || stored.data?.length !== mediaPaths.length || stored.data.some((item) => !item.signedUrl)) throw new ApiError(409, "媒体尚未同步完成，请重试上传");
    }
    const coverUrl = body.coverUrl ? safeResourceLink(body.coverUrl) : "";
    if (body.coverUrl && !coverUrl) throw new ApiError(400, "封面链接无效");
    const topicNames = Array.isArray(body.topics) ? [...new Set(body.topics.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 5) : [];
    if (topicNames.length) {
      const topicRows = await db.from("interest_tags").select("name").in("name", topicNames).eq("channel", "ai").eq("kind", "tag").eq("active", true).eq("moderation_status", "approved");
      dbError(topicRows.error);
      if ((topicRows.data || []).length !== topicNames.length) throw new ApiError(400, "AI 标签无效或尚未通过审核");
    }
    let current: { id: string; status: string } | null = null;
    if (body.id) {
      const id = uuid(body.id);
      const result = await db.from("posts").select("id,status").eq("id", id).eq("author_id", user!.id).eq("channel", "ai").maybeSingle();
      dbError(result.error);
      current = result.data;
      if (!current) throw new ApiError(404, "AI 内容不存在");
    }
    if (current?.status === "published") {
      if (action !== "submit") throw new ApiError(409, "已发布内容的修改需要提交审核");
      const oldMedia = Array.isArray(body.mediaPaths) ? mediaPaths : await db.from("post_media").select("storage_path").eq("post_id", current.id).order("sort_order").then((result) => {
        dbError(result.error); return (result.data || []).map((item) => item.storage_path);
      });
      const payload = { title, body: content, tag: categoryName, topics: topicNames, seriesId: null, poll: null, mediaPaths: oldMedia, coverUrl: coverUrl || null, channel: "ai", contentType, resourceData: resourceResult };
      const revision = await db.from("post_revisions").upsert({ post_id: current.id, author_id: user!.id, payload, status: "pending", review_note: null, reviewed_at: null, reviewed_by: null, updated_at: new Date().toISOString() }, { onConflict: "post_id" }).select("status,review_note").single();
      dbError(revision.error);
      if (!revision.data) throw new ApiError(500, "修改已提交但审核记录读取失败，请刷新后重试");
      const postResult = await db.from("posts").select(libraryFields).eq("id", current.id).single();
      dbError(postResult.error);
      const post = (await presentMany(db, [postResult.data as unknown as LibraryRow]))[0];
      return { ...post, pendingRevision: { status: revision.data.status, reviewNote: revision.data.review_note, payload } };
    }
    if (current && current.status !== "draft" && current.status !== "pending_review") throw new ApiError(409, "此 AI 內容目前不可編輯");
    const values = { channel: "ai", content_type: contentType, resource_data: resourceResult, tag_id: category.data.id, title, body: content, image_url: coverUrl || null, status: action === "submit" ? "pending_review" : "draft", updated_at: new Date().toISOString() };
    const saved = current
      ? await db.from("posts").update(values).eq("id", current.id).eq("author_id", user!.id).select(libraryFields).single()
      : await db.from("posts").insert({ ...values, author_id: user!.id, is_demo: false }).select(libraryFields).single();
    dbError(saved.error);
    const postId = (saved.data as unknown as LibraryRow).id;
    if (action === "submit") {
      const cleared = await db.from("post_media").delete().eq("post_id", postId); dbError(cleared.error);
      if (mediaPaths.length) { const inserted = await db.from("post_media").insert(mediaPaths.map((storage_path, sort_order) => ({ post_id: postId, storage_path, sort_order }))); dbError(inserted.error); }
      if (topicNames.length) {
        const topicRows = await db.from("interest_tags").select("id").in("name", topicNames).eq("channel", "ai").eq("kind", "tag").eq("active", true);
        dbError(topicRows.error);
        const replaced = await db.rpc("replace_post_topics", { p_post_id: postId, p_topic_ids: (topicRows.data || []).map((item) => item.id) }); dbError(replaced.error);
      }
    }
    const refreshed = await db.from("posts").select(libraryFields).eq("id", postId).single(); dbError(refreshed.error);
    return (await presentMany(db, [refreshed.data as unknown as LibraryRow]))[0];
  });
}
