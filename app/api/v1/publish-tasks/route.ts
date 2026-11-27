import { NextRequest } from "next/server";
import { context, respond, ApiError, dbError, jsonBody } from "@/lib/server/api";

export const runtime = "nodejs";

const VALID_STATUSES = new Set([
  "draft_snapshot_saved", "task_created", "waiting_for_media", "uploading_media", "verifying_media",
  "submitting_content", "ai_classifying", "ai_reviewing", "waiting_for_human_review", "publishing",
  "published", "failed", "rejected", "cancelled",
]);

const TASK_FIELDS = "id,task_key,post_id,title,status,media_paths,cover_path,error_message,client_type,idempotency_key,content_hash,created_at,updated_at,finished_at";

/** 我的发布任务列表（任务中心）。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data, error } = await db
      .from("publish_tasks")
      .select(TASK_FIELDS)
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(100);
    dbError(error);
    return { tasks: data || [] };
  });
}

/** 创建发布任务（发布点击时即登记；服务端状态为最终事实）。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const taskKey = String(body.task_key || "").slice(0, 120);
    if (!taskKey) throw new ApiError(400, "任务编号无效");
    const title = String(body.title || "").slice(0, 80);
    const status = String(body.status || "task_created");
    if (!VALID_STATUSES.has(status)) throw new ApiError(400, "任务状态无效");
    const mediaPaths = Array.isArray(body.media_paths) ? body.media_paths.filter((path: unknown): path is string => typeof path === "string").slice(0, 9) : [];
    const coverPath = typeof body.cover_path === "string" ? body.cover_path.slice(0, 300) : null;
    const clientType = typeof body.client_type === "string" ? body.client_type.slice(0, 32) : null;
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.slice(0, 120) : null;
    const contentHash = typeof body.content_hash === "string" ? body.content_hash.slice(0, 64) : null;

    // 幂等：同一个幂等键若已存在，内容指纹相同则直接返回原任务（不得重复创建作品），
    // 内容指纹不同则拒绝复用——防止内容变化后错误沿用旧发布结果。
    if (idempotencyKey) {
      const { data: existing } = await db
        .from("publish_tasks")
        .select(TASK_FIELDS)
        .eq("user_id", user!.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        if (contentHash && existing.content_hash && existing.content_hash !== contentHash) {
          throw new ApiError(409, "该发布请求的内容已发生变化，请使用新的发布请求");
        }
        return { task: existing, replay: true };
      }
    }

    const { data, error } = await db
      .from("publish_tasks")
      .upsert({
        user_id: user!.id, task_key: taskKey, title, status, media_paths: mediaPaths,
        cover_path: coverPath, client_type: clientType,
        idempotency_key: idempotencyKey, content_hash: contentHash,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,task_key" })
      .select(TASK_FIELDS)
      .single();
    dbError(error);
    return { task: data };
  });
}

/** 更新发布任务状态（幂等；只允许本人任务）。 */
export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const taskKey = req.nextUrl.searchParams.get("task_key") || "";
    if (!taskKey) throw new ApiError(400, "任务编号无效");
    const body = await jsonBody(req);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.status === "string") {
      if (!VALID_STATUSES.has(body.status)) throw new ApiError(400, "任务状态无效");
      patch.status = body.status;
      if (["published", "failed", "rejected", "cancelled"].includes(body.status)) patch.finished_at = new Date().toISOString();
    }
    if (typeof body.title === "string") patch.title = body.title.slice(0, 80);
    if (typeof body.post_id === "string") patch.post_id = body.post_id || null;
    if (typeof body.error_message === "string") patch.error_message = body.error_message.slice(0, 500) || null;
    const { data, error } = await db
      .from("publish_tasks")
      .update(patch)
      .eq("user_id", user!.id)
      .eq("task_key", taskKey)
      .select(TASK_FIELDS)
      .maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "发布任务不存在");
    return { task: data };
  });
}

/** 清理已结束任务记录。 */
export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const taskKey = req.nextUrl.searchParams.get("task_key");
    const { error } = taskKey
      ? await db.from("publish_tasks").delete().eq("user_id", user!.id).eq("task_key", taskKey)
      : await db.from("publish_tasks").delete().eq("user_id", user!.id).in("status", ["published", "cancelled"]);
    dbError(error);
    return { removed: true };
  });
}
