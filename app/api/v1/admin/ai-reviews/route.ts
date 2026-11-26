import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

const STATUS_FILTERS: Record<string, string[]> = {
  all: [],
  pending: ["queued", "running"],
  queued: ["queued"],
  running: ["running"],
  approved: ["approved"],
  rejected: ["rejected"],
  error: ["error"],
};

function rangeStart(range: string) {
  const now = Date.now();
  if (range === "7d") return new Date(now - 7 * 86400_000);
  if (range === "30d") return new Date(now - 30 * 86400_000);
  if (range === "all") return new Date(0);
  return new Date(new Date().setHours(0, 0, 0, 0));
}

const cut = (value: unknown, limit: number) => (typeof value === "string" ? value.slice(0, limit) : "");

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "ai.read");
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "all";
    const range = params.get("range") || "today";
    const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(params.get("limit")) || 20));
    const search = (params.get("q") || "").trim().replace(/[%,_()."\\*]/g, "").slice(0, 60);
    if (!(status in STATUS_FILTERS)) throw new ApiError(400, "审核状态筛选无效");
    const from = rangeStart(range);

    let query = db.from("ai_revision_reviews")
      .select("id,post_id,status,attempts,max_attempts,changed_fields,verdict,reason,suggestions,risk_level,risk_types,model,policy_version,input_tokens,output_tokens,elapsed_ms,error_message,created_at,started_at,finished_at,payload,posts!inner(title,body,status,channel,interest_tags!posts_tag_id_fkey(name),profiles!posts_author_id_fkey(nickname))", { count: "exact" })
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: false });
    if (STATUS_FILTERS[status].length > 0) query = query.in("status", STATUS_FILTERS[status]);
    if (search) query = query.or(`payload->>title.ilike.%${search}%,posts.title.ilike.%${search}%`);
    const result = await query.range((page - 1) * limit, page * limit - 1);
    dbError(result.error);

    const stats = await db.rpc("heika_admin_ai_review_stats", { p_from: from.toISOString() });
    dbError(stats.error);

    type Row = {
      id: string; post_id: string; status: string; attempts: number; max_attempts: number; changed_fields: string[] | null;
      verdict: string | null; reason: string | null; suggestions: unknown; risk_level: string | null; risk_types: string[] | null;
      model: string | null; policy_version: string | null; input_tokens: number; output_tokens: number; elapsed_ms: number;
      error_message: string | null; created_at: string; started_at: string | null; finished_at: string | null;
      payload: Record<string, unknown>;
      posts: { title: string; body: string; status: string; interest_tags: { name: string } | { name: string }[] | null; profiles: { nickname: string } | { nickname: string }[] | null } | { title: string; body: string; status: string; interest_tags: { name: string } | { name: string }[] | null; profiles: { nickname: string } | { nickname: string }[] | null }[];
    };
    const first = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;

    const items = ((result.data || []) as unknown as Row[]).map((row) => {
      const post = first(row.posts);
      const payload = row.payload || {};
      const resourceData = payload.resourceData && typeof payload.resourceData === "object" ? payload.resourceData as Record<string, unknown> : {};
      const attachments = Array.isArray(resourceData.attachments) ? resourceData.attachments : [];
      return {
        id: row.id,
        postId: row.post_id,
        title: cut(payload.title, 120) || post?.title || "未命名作品",
        author: first(post?.profiles)?.nickname || "探索者",
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        changedFields: row.changed_fields || [],
        verdict: row.verdict,
        reason: row.reason,
        suggestions: Array.isArray(row.suggestions) ? row.suggestions : [],
        riskLevel: row.risk_level,
        riskTypes: row.risk_types || [],
        model: row.model,
        policyVersion: row.policy_version,
        tokens: row.input_tokens + row.output_tokens,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        elapsedMs: row.elapsed_ms,
        error: row.error_message,
        createdAt: row.created_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        live: post?.status || null,
        before: {
          title: cut(post?.title, 120),
          body: cut(post?.body, 280),
          category: first(post?.interest_tags)?.name || "",
        },
        after: {
          title: cut(payload.title, 120),
          body: cut(payload.body, 280),
          category: cut(payload.tag, 60),
          contentType: cut(payload.contentType, 40),
          topics: Array.isArray(payload.topics) ? payload.topics.slice(0, 5) : [],
          mediaCount: Array.isArray(payload.mediaPaths) ? payload.mediaPaths.length : 0,
          attachments: attachments.length,
        },
      };
    });

    return { items, total: result.count || 0, page, limit, stats: stats.data || null, range };
  });
}
