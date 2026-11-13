import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";
import { signPostMedia } from "@/lib/server/media";
import { isVideoMediaPath } from "@/lib/media-path";

const first = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;
const aiTypes = ["knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial"] as const;

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "ai.read");
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "queue";
    const contentType = params.get("type") || "";
    const search = (params.get("q") || "").trim().replace(/[%,_()."\\*]/g, "").slice(0, 60);
    const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(params.get("limit")) || 20));
    if (contentType && !aiTypes.includes(contentType as typeof aiTypes[number])) throw new ApiError(400, "AI 内容类型无效");
    if (status === "feedback") {
      const feedbackStatus = params.get("feedbackStatus") || "open";
      let request = db.from("ai_resource_feedback").select("id,post_id,reporter_id,kind,details,status,review_note,handled_by,handled_at,created_at,posts!inner(title,channel),profiles!ai_resource_feedback_reporter_id_fkey(nickname)", { count: "exact" }).order("created_at", { ascending: false });
      if (feedbackStatus !== "all") request = request.eq("status", feedbackStatus);
      const result = await request.range((page - 1) * limit, page * limit - 1);
      dbError(result.error);
      return { items: result.data || [], total: result.count || 0, page, limit };
    }
    let postQuery = db.from("posts").select(libraryFields, { count: "exact" }).eq("channel", "ai");
    if (contentType) postQuery = postQuery.eq("content_type", contentType);
    if (search) postQuery = postQuery.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    if (status === "queue") postQuery = postQuery.eq("status", "pending_review");
    else if (status === "published") postQuery = postQuery.eq("status", "published");
    else if (status === "hidden") postQuery = postQuery.eq("status", "hidden");
    else if (status !== "all") throw new ApiError(400, "AI 管理筛选无效");
    const [posts, revisions] = await Promise.all([
      status === "queue" ? postQuery.order("created_at", { ascending: true }).range(0, page * limit - 1) : postQuery.order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1),
      status === "queue" ? (() => {
        let revisionQuery = db.from("post_revisions").select("post_id,payload,created_at,posts!inner(id,title,status,author_id,channel,profiles!posts_author_id_fkey(nickname))", { count: "exact" }).eq("status", "pending").eq("posts.channel", "ai").eq("posts.status", "published");
        if (contentType) revisionQuery = revisionQuery.eq("payload->>contentType", contentType);
        if (search) revisionQuery = revisionQuery.or(`payload->>title.ilike.%${search}%,payload->>body.ilike.%${search}%`);
        return revisionQuery.order("created_at", { ascending: true }).range(0, page * limit - 1);
      })() : Promise.resolve({ data: [], error: null, count: 0 }),
    ]);
    dbError(posts.error); dbError(revisions.error);
    type NewPost = LibraryRow & { profiles?: { nickname: string } | { nickname: string }[] | null };
    const newRows = (posts.data || []) as unknown as NewPost[];
    const revisionRows = (revisions.data || []) as unknown as { post_id: string; payload: Record<string, unknown>; created_at: string; posts: { title: string; status: string; profiles: { nickname: string } | { nickname: string }[] | null } | { title: string; status: string; profiles: { nickname: string } | { nickname: string }[] | null }[] }[];
    const submissions = [
      ...newRows.map((post) => ({ kind: "new" as const, id: post.id, title: post.title, body: post.body, author: post.profiles?.nickname || "探索者", created_at: post.created_at, status: post.status, contentType: post.content_type || "knowledge_article", usageScenarios: post.usage_scenarios || [], resourceData: post.resource_data || {}, images: [] as string[], videos: [] as string[], originalTitle: null as string | null, featuredAt: post.featured_at || null, mediaPaths: (post.post_media || []).slice().sort((a, b) => a.sort_order - b.sort_order).map((media) => media.storage_path), coverUrl: post.image_url })),
      ...revisionRows.flatMap((revision) => {
        const post = first(revision.posts);
        if (!post || post.status !== "published") return [];
        const payload = revision.payload;
        const mediaPaths = Array.isArray(payload.mediaPaths) ? payload.mediaPaths.filter((path): path is string => typeof path === "string") : [];
        return [{ kind: "revision" as const, id: revision.post_id, title: String(payload.title || ""), body: String(payload.body || ""), author: first(post.profiles)?.nickname || "探索者", created_at: revision.created_at, status: "pending_review", contentType: String(payload.contentType || "knowledge_article"), usageScenarios: Array.isArray(payload.usageScenarios) ? payload.usageScenarios.filter((item): item is string => typeof item === "string") : [], resourceData: (payload.resourceData && typeof payload.resourceData === "object" ? payload.resourceData : {}) as Record<string, unknown>, images: [] as string[], videos: [] as string[], originalTitle: post.title, featuredAt: null as string | null, mediaPaths, coverUrl: typeof payload.coverUrl === "string" ? payload.coverUrl : null }];
      }),
    ].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const allPaths = [...new Set(submissions.flatMap((item) => "mediaPaths" in item ? item.mediaPaths : []))];
    const signed = allPaths.length ? await signPostMedia(db, allPaths, 600) : { data: [], error: null };
    dbError(signed.error);
    const signedByPath = new Map((signed.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
    const signedItems = submissions.map((item) => {
      if (!("mediaPaths" in item)) return item;
      return { ...item, images: [...(item.coverUrl ? [item.coverUrl] : []), ...item.mediaPaths.flatMap((path) => !isVideoMediaPath(path) && signedByPath.has(path) ? [signedByPath.get(path)!] : [])], videos: item.mediaPaths.flatMap((path) => isVideoMediaPath(path) && signedByPath.has(path) ? [signedByPath.get(path)!] : []) };
    });
    if (status === "queue") return { items: signedItems.slice((page - 1) * limit, page * limit), total: (posts.count || 0) + (revisions.count || 0), page, limit };
    const presented = await presentMany(db, newRows as LibraryRow[]);
    return { items: presented.map((item, index) => ({ ...item, status: newRows[index].status, featuredAt: newRows[index].featured_at || null })), total: posts.count || 0, page, limit };
  });
}
