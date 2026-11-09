import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { signPostMedia } from "@/lib/server/media";
import { isVideoMediaPath } from "@/lib/media-path";
import { requirePermission } from "@/lib/server/require-permission";

const reportFields = "id,post_id,comment_id,reason,status,created_at,review_note,reviewed_at";
type MediaRow = { storage_path: string; sort_order: number };
type PostRow = { id: string; title: string; body: string; status: string; image_url: string | null; post_media?: MediaRow[] };

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "reports.manage");
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "open";
    if (!["open", "resolved", "dismissed", "all"].includes(status)) throw new ApiError(400, "筛选状态无效");
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(params.get("limit")) || 20));
    let query = db.from("reports").select(reportFields, { count: "exact" }).order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error, count } = await query.range((page - 1) * limit, page * limit - 1);
    dbError(error);
    const rows = data || [];
    const postIds = [...new Set(rows.map((item) => item.post_id).filter((id): id is string => Boolean(id)))];
    const commentIds = [...new Set(rows.map((item) => item.comment_id).filter((id): id is string => Boolean(id)))];
    const [posts, comments] = await Promise.all([
      postIds.length ? db.from("posts").select("id,title,body,status,image_url,post_media(storage_path,sort_order)").in("id", postIds) : Promise.resolve({ data: [], error: null }),
      commentIds.length ? db.from("comments").select("id,body,status,post_id,posts(title)").in("id", commentIds) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(posts.error);
    dbError(comments.error);
    const postMap = new Map((posts.data as unknown as PostRow[]).map((post) => [post.id, post]));
    const mediaPaths = [...new Set((posts.data as unknown as PostRow[]).flatMap((post) => (post.post_media || []).map((item) => item.storage_path)))];
    const signed = mediaPaths.length ? await signPostMedia(db, mediaPaths, 600) : { data: [], error: null };
    dbError(signed.error);
    const signedByPath = new Map((signed.data || []).map((item) => [item.path, item.signedUrl]));
    const commentRows = (comments.data || []) as unknown as { id: string; body: string; status: string; posts: { title: string } | { title: string }[] | null }[];
    const commentMap = new Map(commentRows.map((comment) => [comment.id, comment]));
    return {
      items: rows.map((row) => {
        const post = row.post_id ? postMap.get(row.post_id) : undefined;
        const images = post ? [
          ...(post.image_url ? [post.image_url] : []),
          ...(post.post_media || []).sort((a, b) => a.sort_order - b.sort_order).flatMap((media) => {
            const url = signedByPath.get(media.storage_path);
            return url && !isVideoMediaPath(media.storage_path) ? [url] : [];
          }),
        ] : [];
        const videos = post ? (post.post_media || []).flatMap((media) => {
          const url = signedByPath.get(media.storage_path);
          return url && isVideoMediaPath(media.storage_path) ? [url] : [];
        }) : [];
        const comment = commentMap.get(row.comment_id || "");
        const commentPost = Array.isArray(comment?.posts) ? comment.posts[0] : comment?.posts;
        return {
          id: row.id,
          reason: row.reason,
          status: row.status,
          created_at: row.created_at,
          review_note: row.review_note,
          reviewed_at: row.reviewed_at,
          target: post ? { type: "post", title: post.title, body: post.body, status: post.status, images, videos }
            : { type: "comment", title: commentPost?.title || "评论", body: comment?.body || "评论内容已删除", status: comment?.status || "deleted", images: [], videos: [] },
        };
      }),
      total: count || 0,
      page,
      limit,
    };
  });
}
