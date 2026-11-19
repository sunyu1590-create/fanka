import { NextRequest } from "next/server";
import { ApiError, jsonBody, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const admin = adminClient();
    const [batches, reviewItems, metrics] = await Promise.all([
      admin.from("ai_task_batches").select("*").order("created_at", { ascending: false }).limit(30),
      admin.from("ai_task_items").select("id,batch_id,post_id,status,result,result_history,error_message,updated_at,created_at").eq("status", "review").order("updated_at", { ascending: false }).limit(100),
      admin.rpc("get_ai_resource_summary"),
    ]);
    if (batches.error || reviewItems.error || metrics.error) throw new ApiError(503, "AI 任务数据暂不可用，请确认数据库迁移已由部署人员应用");
    const batchIds = (batches.data || []).map((batch) => batch.id);
    const classificationBatchIds = (batches.data || []).filter((batch) => batch.task_type === "classification").map((batch) => batch.id);
    const [usage, classificationRows] = await Promise.all([
      batchIds.length ? admin.rpc("get_ai_task_usage", { p_batch_ids: batchIds }) : Promise.resolve({ data: {}, error: null }),
      classificationBatchIds.length
        ? admin.from("ai_task_items").select("id,batch_id,post_id,status,result,result_history,error_message,updated_at").in("batch_id", classificationBatchIds).order("updated_at", { ascending: false }).limit(100)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (usage.error) throw new ApiError(503, "批量任务 Token 用量暂不可读取");
    if (classificationRows.error) throw new ApiError(503, "自动分类记录暂不可读取");
    const postIds = [...new Set((reviewItems.data || []).map((item) => item.post_id).filter((id): id is string => Boolean(id)))];
    const posts = postIds.length
      ? await admin.from("posts").select("id,title,body,channel,status,author_id,profiles!posts_author_id_fkey(nickname)").in("id", postIds)
      : { data: [], error: null };
    if (posts.error) throw new ApiError(503, "人工复审作品暂不可读取");
    const postById = new Map((posts.data || []).map((post) => [post.id, post]));
    const items = (reviewItems.data || []).map((item) => ({ ...item, post: item.post_id ? postById.get(item.post_id) || null : null }));
    const currentPostIds = [...new Set((batches.data || []).map((batch) => batch.current_post_id).filter((id): id is string => Boolean(id)))];
    const currentPosts = currentPostIds.length
      ? await admin.from("posts").select("id,title").in("id", currentPostIds)
      : { data: [], error: null };
    if (currentPosts.error) throw new ApiError(503, "当前 AI 任务进度暂不可读取");
    const titleByPostId = new Map((currentPosts.data || []).map((post) => [post.id, post.title]));
    const usageByBatch = (usage.data || {}) as Record<string, unknown>;
    const classifiedPostIds = [...new Set((classificationRows.data || []).map((item) => item.post_id).filter((id): id is string => Boolean(id)))];
    const classifiedPosts = classifiedPostIds.length
      ? await admin.from("posts").select("id,title,channel").in("id", classifiedPostIds)
      : { data: [], error: null };
    if (classifiedPosts.error) throw new ApiError(503, "自动分类作品信息暂不可读取");
    const classifiedPostById = new Map((classifiedPosts.data || []).map((post) => [post.id, post]));
    const classificationItems = (classificationRows.data || []).map((item) => ({ ...item, post: item.post_id ? classifiedPostById.get(item.post_id) || null : null }));
    return { batches: (batches.data || []).map((batch) => ({ ...batch, current_post_title: batch.current_post_id ? titleByPostId.get(batch.current_post_id) || null : null, task_usage: usageByBatch[batch.id] || null })), reviewItems: items, classificationItems, metrics: metrics.data || {} };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const taskType = body.taskType;
    if (!["summary_all", "summary_incremental", "review_pending"].includes(String(taskType))) throw new ApiError(400, "AI 任务类型无效");
    const admin = adminClient();
    const purpose = taskType === "review_pending" ? "review" : "summary";
    const config = await admin.from("ai_model_configs").select("model").eq("purpose", purpose).single();
    if (config.error || !config.data?.model) throw new ApiError(503, "AI 模型配置暂不可用，请确认管理配置和数据库迁移");
    const inserted = await admin.from("ai_task_batches").insert({
      task_type: taskType,
      created_by: user.id,
      status: "queued",
      config_snapshot: { model: config.data.model },
    }).select("id,task_type,status,config_snapshot,created_at").single();
    if (inserted.error) {
      if (inserted.error.code === "23505") throw new ApiError(409, "同类 AI 批量任务正在运行或等待中");
      throw new ApiError(503, "无法创建 AI 批量任务");
    }
    const queued = taskType === "review_pending"
      ? await admin.rpc("enqueue_ai_review_items", { p_batch_id: inserted.data.id })
      : await admin.rpc("enqueue_ai_summary_items", { p_batch_id: inserted.data.id, p_include_existing: taskType === "summary_all" && body.includeExisting === true });
    if (queued.error) {
      await admin.from("ai_task_batches").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", inserted.data.id);
      throw new ApiError(503, "任务已记录，但无法建立处理队列；请检查数据库迁移");
    }
    return { ...inserted.data, totalCount: queued.data || 0 };
  });
}
