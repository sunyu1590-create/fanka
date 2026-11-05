import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { signPostMedia } from "@/lib/server/media";
import { isVideoMediaPath } from "@/lib/media-path";

type MediaRow = { storage_path: string; sort_order: number };
const first = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(profileError);
    if (!profile || profile.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const page = Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("limit")) || 20));
    const from = (page - 1) * limit;
    const [newPosts, revisions] = await Promise.all([
      db.from("posts").select("id,title,body,status,created_at,image_url,profiles!posts_author_id_fkey(nickname),post_media(storage_path,sort_order)", { count: "exact" }).eq("status", "pending_review").order("created_at", { ascending: true }).range(0, from + limit - 1),
      db.from("post_revisions").select("post_id,payload,created_at,posts!inner(id,title,body,status,author_id,profiles!posts_author_id_fkey(nickname))", { count: "exact" }).eq("status", "pending").order("created_at", { ascending: true }).range(0, from + limit - 1),
    ]);
    dbError(newPosts.error); dbError(revisions.error);
    const newRows = (newPosts.data || []) as unknown as { id: string; title: string; body: string; status: string; created_at: string; image_url: string | null; profiles: { nickname: string } | { nickname: string }[] | null; post_media?: MediaRow[] }[];
    const revisionRows = (revisions.data || []) as unknown as { post_id: string; payload: Record<string, unknown>; created_at: string; posts: { title: string; status: string; profiles: { nickname: string } | { nickname: string }[] | null } | { title: string; status: string; profiles: { nickname: string } | { nickname: string }[] | null }[] }[];
    const submissions = [
      ...newRows.map((post) => ({ kind: "new" as const, id: post.id, title: post.title, body: post.body, status: post.status, created_at: post.created_at, author: first(post.profiles)?.nickname || "探索者", originalTitle: null, paths: (post.post_media || []).slice().sort((a, b) => a.sort_order - b.sort_order).map((item) => item.storage_path), coverUrl: post.image_url })),
      ...revisionRows.flatMap((revision) => {
        const post = first(revision.posts);
        if (!post || post.status !== "published") return [];
        const paths = Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.filter((path): path is string => typeof path === "string") : [];
        return [{ kind: "revision" as const, id: revision.post_id, title: String(revision.payload.title || ""), body: String(revision.payload.body || ""), status: "pending_review", created_at: revision.created_at, author: first(post.profiles)?.nickname || "探索者", originalTitle: post.title, paths, coverUrl: typeof revision.payload.coverUrl === "string" ? revision.payload.coverUrl : null }];
      }),
    ].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(from, from + limit);
    const allPaths = [...new Set(submissions.flatMap((submission) => submission.paths))];
    const signed = allPaths.length ? await signPostMedia(db, allPaths, 600) : { data: [], error: null };
    dbError(signed.error);
    const signedByPath = new Map((signed.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
    return {
      items: submissions.map((submission) => ({ id: submission.id, title: submission.title, body: submission.body, status: submission.status, created_at: submission.created_at, author: submission.author, originalTitle: submission.originalTitle, kind: submission.kind, images: [...(submission.coverUrl ? [submission.coverUrl] : []), ...submission.paths.flatMap((path) => !isVideoMediaPath(path) && signedByPath.has(path) ? [signedByPath.get(path)!] : [])], videos: submission.paths.flatMap((path) => isVideoMediaPath(path) && signedByPath.has(path) ? [signedByPath.get(path)!] : []) })),
      total: (newPosts.count || 0) + (revisions.count || 0),
      page,
      limit,
    };
  });
}
