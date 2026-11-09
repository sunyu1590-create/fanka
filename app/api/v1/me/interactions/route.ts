import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const ids = [...new Set((req.nextUrl.searchParams.get("ids") || "").split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100);
    if (!ids.length) return {};
    const { data: posts, error: postError } = await db.from("posts").select("id,client_id").eq("status", "published").in("client_id", ids);
    dbError(postError);
    if (!posts?.length) return {};
    const postIds = posts.map((post) => post.id);
    const [interactions, bookmarks] = await Promise.all([
      db.from("user_interactions").select("post_id,liked").eq("user_id", user!.id).in("post_id", postIds),
      db.from("bookmarks").select("post_id").eq("user_id", user!.id).in("post_id", postIds),
    ]);
    dbError(interactions.error); dbError(bookmarks.error);
    const likedIds = new Set((interactions.data || []).filter((row) => row.liked).map((row) => row.post_id));
    const savedIds = new Set((bookmarks.data || []).map((row) => row.post_id));
    return Object.fromEntries(posts.map((post) => [post.client_id, { liked: likedIds.has(post.id), saved: savedIds.has(post.id) }]));
  });
}
