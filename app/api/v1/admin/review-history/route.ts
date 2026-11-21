import { NextRequest } from "next/server";
import { dbError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

type DecisionRow = {
  id: number;
  decision: string;
  reason: string;
  created_at: string;
  actor_id: string | null;
  post_id: string | null;
};

/**
 * 人工复审历史：已完成的结果默认折叠，这里提供时间、频道、结果筛选与作品/作者搜索。
 * 记录来自 ai_review_decisions，每次处理同时写入 moderation_audit_logs，历史与日志都不删除。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Math.min(5000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(params.get("limit")) || 10));
    const channel = params.get("channel");
    const result = params.get("result");
    const days = Math.max(0, Math.min(365, Number(params.get("days")) || 0));
    const keyword = (params.get("q") || "").trim().replace(/[%,()]/g, "").slice(0, 40);

    // 先按关键词定位候选作品（标题或作者昵称），再回到结果表分页，保证总数与分页一致。
    let allowedPostIds: string[] | null = null;
    if (keyword) {
      const authors = await db.from("profiles").select("id").ilike("nickname", `%${keyword}%`).limit(50);
      dbError(authors.error);
      const authorIds = (authors.data || []).map((row) => row.id);
      const postQuery = authorIds.length
        ? db.from("posts").select("id").or(`title.ilike.%${keyword}%,author_id.in.(${authorIds.join(",")})`).limit(500)
        : db.from("posts").select("id").ilike("title", `%${keyword}%`).limit(500);
      const posts = await postQuery;
      dbError(posts.error);
      allowedPostIds = (posts.data || []).map((row) => row.id);
      if (!allowedPostIds.length) return { items: [], total: 0, page, limit };
    }

    let query = db.from("ai_review_decisions")
      .select("id,decision,reason,created_at,actor_id,post_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (allowedPostIds) query = query.in("post_id", allowedPostIds);
    if (result === "published" || result === "hidden" || result === "revision") query = query.eq("decision", result);
    if (days > 0) query = query.gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());

    if (channel === "ai" || channel === "community") {
      const channelPosts = await db.from("posts").select("id").eq("channel", channel).limit(2000);
      dbError(channelPosts.error);
      const ids = (channelPosts.data || []).map((row) => row.id);
      if (!ids.length) return { items: [], total: 0, page, limit };
      query = query.in("post_id", allowedPostIds ? allowedPostIds.filter((id) => ids.includes(id)) : ids);
    }

    const { data, error, count } = await query;
    dbError(error);
    const rows = (data || []) as DecisionRow[];

    const postIds = [...new Set(rows.map((row) => row.post_id).filter((id): id is string => Boolean(id)))];
    const posts = postIds.length ? await db.from("posts").select("id,title,channel,author_id").in("id", postIds) : { data: [], error: null };
    dbError(posts.error);
    const postById = new Map((posts.data || []).map((row) => [row.id, row]));
    const authorIds = [...new Set((posts.data || []).map((row) => row.author_id).filter((id): id is string => Boolean(id)))];
    const profiles = authorIds.length ? await db.from("profiles").select("id,nickname").in("id", authorIds) : { data: [], error: null };
    dbError(profiles.error);
    const nicknameById = new Map((profiles.data || []).map((row) => [row.id, row.nickname || "探索者"]));
    const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length ? await db.from("profiles").select("id,nickname").in("id", actorIds) : { data: [], error: null };
    dbError(actors.error);
    const actorById = new Map((actors.data || []).map((row) => [row.id, row.nickname || "管理员"]));

    return {
      items: rows.map((row) => {
        const post = row.post_id ? postById.get(row.post_id) : undefined;
        return {
          id: row.id,
          postId: row.post_id,
          title: post?.title || "作品已删除",
          channel: post?.channel || "community",
          author: post?.author_id ? nicknameById.get(post.author_id) || "探索者" : "—",
          decision: row.decision,
          reason: row.reason,
          actor: row.actor_id ? actorById.get(row.actor_id) || "管理员" : "系统",
          createdAt: row.created_at,
        };
      }),
      total: count || 0,
      page,
      limit,
    };
  });
}
