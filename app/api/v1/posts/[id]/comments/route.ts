import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const postId = uuid((await params).id);
    const sort = req.nextUrl.searchParams.get("sort") === "hot" ? "hot" : "new";
    const page = Math.max(1, Math.min(1000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("limit")) || 30));
    const start = (page - 1) * limit;
    const hotWindow = 100;
    let query = db.from("comments").select("id,author_id,parent_id,body,created_at", { count: "exact" })
      .eq("post_id", postId).eq("status", "visible").order("created_at", { ascending: false }).order("id", { ascending: true });
    if (sort === "new") query = query.range(start, start + limit - 1);
    else query = query.limit(hotWindow);
    const { data, error, count } = await query;
    dbError(error);
    const comments = data || [];
    const commentIds = comments.map((item) => item.id);
    const authorIds = [...new Set(comments.map((item) => item.author_id))];
    const [profiles, reactions] = await Promise.all([
      authorIds.length ? db.from("profiles").select("id,nickname,avatar_url").in("id", authorIds) : Promise.resolve({ data: [], error: null }),
      commentIds.length ? db.from("comment_reactions").select("comment_id,user_id,kind").in("comment_id", commentIds).eq("kind", "like") : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(profiles.error); dbError(reactions.error);
    const authorById = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
    const reactionRows = (reactions.data || []) as { comment_id: string; user_id: string; kind: string }[];
    const countById = new Map<string, number>();
    const ownLikes = new Set<string>();
    for (const reaction of reactionRows) {
      countById.set(reaction.comment_id, (countById.get(reaction.comment_id) || 0) + 1);
      if (user?.id === reaction.user_id) ownLikes.add(reaction.comment_id);
    }
    let result = comments.map((comment) => ({
      ...comment,
      author: authorById.get(comment.author_id) || null,
      likeCount: countById.get(comment.id) || 0,
      liked: ownLikes.has(comment.id),
    }));
    if (sort === "hot") {
      result = result.sort((a, b) => b.likeCount - a.likeCount || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(start, start + limit);
    }
    const total = count || 0;
    const hasMore = sort === "hot" ? start + result.length < Math.min(total, hotWindow) : start + comments.length < total;
    return { items: result, total, has_more: hasMore, hot_window_limited: sort === "hot" && total > hotWindow, page, limit };
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const postId = uuid((await params).id);
    const parentId = body.parent_id ? uuid(body.parent_id, "回复目标") : null;
    if (parentId) {
      const { data: parent, error: parentError } = await db.from("comments").select("id,post_id,status").eq("id", parentId).maybeSingle();
      dbError(parentError);
      if (!parent || parent.post_id !== postId || parent.status !== "visible") throw new ApiError(400, "回复目标无效或已删除");
    }
    const { data, error } = await db.from("comments").insert({ post_id: postId, author_id: user!.id, body: textField(body.body, "评论", 1, 1000), parent_id: parentId }).select("id,author_id,parent_id,body,created_at").single();
    dbError(error);
    const { data: profile } = await db.from("profiles").select("id,nickname,avatar_url").eq("id", user!.id).maybeSingle();
    return { ...data, author: profile || null, likeCount: 0, liked: false };
  });
}
