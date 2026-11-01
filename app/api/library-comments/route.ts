import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  textField,
  ApiError,
} from "@/lib/server/api";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const clientId = Number(req.nextUrl.searchParams.get("id"));
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
    const limit = Math.max(1, Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 40));
    if (!Number.isSafeInteger(clientId) || clientId < 1) throw new ApiError(400, "内容编号无效");
    const { data: post, error } = await db
      .from("posts")
      .select("id")
      .eq("client_id", Number(req.nextUrl.searchParams.get("id")))
      .single();
    dbError(error);
    const { data, error: read, count } = await db
      .from("comments")
      .select("id,client_id,body,author_id,created_at,parent_id,comment_reactions(user_id)", { count: "exact" })
      .eq("post_id", post!.id)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    dbError(read);
    const rows = data || [];
    const authorIds = [...new Set(rows.map((row) => row.author_id))];
    const parentIds = [...new Set(rows.flatMap((row) => row.parent_id ? [row.parent_id] : []))];
    const [profilesResult, parentsResult] = await Promise.all([
      authorIds.length ? db.from("profiles").select("id,nickname,avatar_url").in("id", authorIds) : Promise.resolve({ data: [], error: null }),
      parentIds.length ? db.from("comments").select("id,client_id").in("id", parentIds) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(profilesResult.error);
    dbError(parentsResult.error);
    const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
    const parentClientIds = new Map((parentsResult.data || []).map((parent) => [parent.id, Number(parent.client_id)]));
    return {
      items: rows.map((c) => ({
      id: Number(c.client_id),
      cloudId: c.id,
      post: clientId,
      body: c.body,
      authorId: c.author_id,
      name: profiles.get(c.author_id)?.nickname?.trim() || "探索者",
      avatar: profiles.get(c.author_id)?.avatar_url || undefined,
      parent: c.parent_id ? parentClientIds.get(c.parent_id) : undefined,
      time: new Date(c.created_at).getTime(),
      likes: c.comment_reactions.length,
      liked: !!user && c.comment_reactions.some((r: { user_id: string }) => r.user_id === user.id),
    })), total: count || 0, offset, limit };
  });
}
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const b = await jsonBody(req);
    const { data: post, error } = await db
      .from("posts")
      .select("id")
      .eq("client_id", Number(b.post))
      .single();
    dbError(error);
    if (b.action === "delete") {
      const { error } = await db
        .from("comments")
        .delete()
        .eq("client_id", Number(b.id))
        .eq("author_id", user!.id);
      dbError(error);
      return { removed: true };
    }
    if (b.action === "like") {
      const { data: comment, error } = await db
        .from("comments")
        .select("id")
        .eq("client_id", Number(b.id))
        .single();
      dbError(error);
      const values = {
        comment_id: comment!.id,
        user_id: user!.id,
        kind: "like",
      };
      const result = b.value
        ? await db.from("comment_reactions").upsert(values)
        : await db.from("comment_reactions").delete().match(values);
      dbError(result.error);
      return { saved: true };
    }
    let parent: string | null = null;
    if (b.parent) {
      const { data, error } = await db
        .from("comments")
        .select("id")
        .eq("client_id", Number(b.parent))
        .eq("post_id", post!.id)
        .single();
      dbError(error);
      parent = data!.id;
    }
    const { data, error: write } = await db
      .from("comments")
      .insert({
        post_id: post!.id,
        author_id: user!.id,
        parent_id: parent,
        body: textField(b.body, "评论", 1, 1000),
      })
      .select("id,client_id,body,created_at")
      .single();
    dbError(write);
    if (!data) throw new ApiError(500, "评论未保存");
    const { data: profile } = await db
      .from("profiles")
      .select("nickname,avatar_url")
      .eq("id", user!.id)
      .maybeSingle();
    return {
      id: Number(data.client_id),
      cloudId: data.id,
      post: Number(b.post),
      body: data.body,
      authorId: user!.id,
      name: profile?.nickname || "探索者",
      avatar: profile?.avatar_url || undefined,
      parent: b.parent || undefined,
      time: new Date(data.created_at).getTime(),
      likes: 0,
    };
  });
}
