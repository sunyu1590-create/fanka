import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(profileError);
    if (!profile || profile.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const page = Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("limit")) || 20));
    const { data, error, count } = await db.from("posts")
      .select("id,title,body,status,created_at,image_url,profiles!posts_author_id_fkey(nickname),post_media(storage_path,sort_order)", { count: "exact" })
      .eq("status", "pending_review")
      .order("created_at", { ascending: true })
      .range((page - 1) * limit, page * limit - 1);
    dbError(error);
    const rows = data || [];
    const paths = [...new Set(rows.flatMap((post) => (post.post_media || []).map((media: { storage_path: string }) => media.storage_path)))];
    const signed = paths.length ? await db.storage.from("post-covers").createSignedUrls(paths, 600) : { data: [], error: null };
    dbError(signed.error);
    const signedByPath = new Map((signed.data || []).map((item) => [item.path, item.signedUrl]));
    return {
      items: rows.map((post) => ({
        id: post.id,
        title: post.title,
        body: post.body,
        status: post.status,
        created_at: post.created_at,
        author: post.profiles?.[0]?.nickname || "探索者",
        images: [
          ...(post.image_url ? [post.image_url] : []),
          ...(post.post_media || []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order).flatMap((media: { storage_path: string }) => {
            const url = signedByPath.get(media.storage_path);
            return url ? [url] : [];
          }),
        ],
      })),
      total: count || 0,
      page,
      limit,
    };
  });
}
