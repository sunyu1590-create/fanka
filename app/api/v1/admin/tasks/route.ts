import { NextRequest } from "next/server";
import { respond, ApiError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  group: "media" | "review" | "summary" | "classify" | "scan" | "publish";
  title: string;
  status: string;
  stage: string;
  progress: number | null;
  processed: number | null;
  total: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  link: string | null;
  meta: string | null;
};

const ACTIVE_UPLOAD = ["created", "preparing", "compressing", "queued", "uploading", "verifying", "retrying"];
const ACTIVE_BATCH = ["running", "queued", "paused"];

/**
 * 统一任务控制台：聚合现有各业务任务，不重建任务系统，也不伪造进度。
 * 有确定总量的任务给百分比；没有总量的只给真实状态与已处理数量。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "audit.read");
    const db = adminClient();
    const history = req.nextUrl.searchParams.get("history") === "1";

    const [uploads, batches, scans, publishes] = await Promise.all([
      db.from("upload_tasks")
        .select("task_key,file_name,status,progress,bytes_sent,file_size,client_type,error_message,created_at,updated_at,finished_at")
        .in("status", history ? ["ready", "failed", "cancelled"] : ACTIVE_UPLOAD)
        .order("updated_at", { ascending: false }).limit(history ? 30 : 20),
      db.from("ai_task_batches")
        .select("id,task_type,status,total_count,completed_count,review_count,failed_count,current_post_id,created_at,updated_at,completed_at")
        .in("status", history ? ["completed", "failed", "cancelled"] : ACTIVE_BATCH)
        .order("updated_at", { ascending: false }).limit(history ? 20 : 12),
      db.from("admin_resource_scans")
        .select("id,kind,status,scanned_count,orphan_count,duplicate_count,missing_count,created_at,finished_at,error_message")
        .in("status", history ? ["completed", "failed"] : ["running", "queued"])
        .order("created_at", { ascending: false }).limit(history ? 20 : 6),
      db.from("publish_tasks")
        .select("id,task_key,title,status,error_message,created_at,updated_at")
        .in("status", history ? ["completed", "failed"] : ["queued", "running", "processing"])
        .order("updated_at", { ascending: false }).limit(history ? 10 : 8),
    ]);
    for (const result of [uploads, batches, scans, publishes]) {
      if (result.error) throw new ApiError(503, "任务数据暂不可用");
    }

    const rows: TaskRow[] = [];
    for (const task of uploads.data || []) {
      const size = Number(task.file_size || 0);
      const sent = Number(task.bytes_sent || 0);
      rows.push({
        id: `upload:${task.task_key}`,
        group: "media",
        title: task.file_name || `上传任务 ${String(task.task_key).slice(0, 8)}`,
        status: String(task.status),
        stage: task.status === "verifying" ? "完整性校验" : task.status === "compressing" ? "图片压缩" : task.status === "queued" ? "等待上传" : task.status === "retrying" ? "重试中" : task.status === "uploading" ? "文件传输" : "准备中",
        progress: task.status === "ready" ? 100 : task.progress == null && size > 0 ? Math.min(99, Math.round((sent / size) * 100)) : task.progress == null ? null : Number(task.progress),
        processed: sent || null,
        total: size || null,
        error: task.error_message || null,
        created_at: task.created_at,
        updated_at: task.updated_at,
        link: "media-service",
        meta: task.client_type || null,
      });
    }
    for (const batch of batches.data || []) {
      const total = Number(batch.total_count || 0);
      rows.push({
        id: `batch:${batch.id}`,
        group: batch.task_type === "review_pending" ? "review" : batch.task_type === "classification" ? "classify" : "summary",
        title: batch.task_type === "review_pending" ? "AI 内容审核" : batch.task_type === "classification" ? "AI 自动分类" : batch.task_type === "summary_incremental" ? "AI 增量总结" : "AI 全量总结",
        status: String(batch.status),
        stage: batch.status === "paused" ? "已暂停" : batch.status === "queued" ? "排队中" : "模型处理中",
        progress: total ? Math.round((Number(batch.completed_count || 0) / total) * 100) : null,
        processed: Number(batch.completed_count || 0),
        total: total || null,
        error: Number(batch.failed_count || 0) > 0 ? `${batch.failed_count} 条失败` : null,
        created_at: batch.created_at,
        updated_at: batch.updated_at,
        link: "ai-batch",
        meta: Number(batch.review_count || 0) > 0 ? `${batch.review_count} 条待人工复审` : null,
      });
    }
    for (const scan of scans.data || []) {
      rows.push({
        id: `scan:${scan.id}`,
        group: "scan",
        title: "资源健康扫描",
        status: String(scan.status),
        stage: scan.status === "running" ? "遍历对象存储" : scan.status === "completed" ? "已完成" : "失败",
        progress: null,
        processed: Number(scan.scanned_count || 0),
        total: null,
        error: scan.error_message || null,
        created_at: scan.created_at,
        updated_at: scan.finished_at || scan.created_at,
        link: "storage",
        meta: Number(scan.orphan_count || 0) + Number(scan.duplicate_count || 0) > 0 ? `发现 ${Number(scan.orphan_count || 0) + Number(scan.duplicate_count || 0)} 项异常` : null,
      });
    }
    for (const task of publishes.data || []) {
      rows.push({
        id: `publish:${task.id}`,
        group: "publish",
        title: task.title || "作品发布",
        status: String(task.status),
        stage: task.status === "queued" ? "等待发布" : "发布处理中",
        progress: null,
        processed: null,
        total: null,
        error: task.error_message || null,
        created_at: task.created_at,
        updated_at: task.updated_at,
        link: null,
        meta: task.task_key ? String(task.task_key).slice(0, 12) : null,
      });
    }

    const groupMeta: Array<{ key: TaskRow["group"]; label: string }> = [
      { key: "media", label: "媒体传输" },
      { key: "review", label: "AI 审核" },
      { key: "summary", label: "AI 总结" },
      { key: "classify", label: "AI 分类" },
      { key: "scan", label: "资源扫描" },
      { key: "publish", label: "作品发布" },
    ];
    const groups = groupMeta.map((meta) => ({
      ...meta,
      count: rows.filter((row) => row.group === meta.key).length,
      items: rows.filter((row) => row.group === meta.key),
    }));

    return {
      updated_at: new Date().toISOString(),
      history,
      counts: {
        running: rows.filter((row) => ["running", "uploading", "verifying", "retrying", "preparing", "compressing", "processing"].includes(row.status)).length,
        queued: rows.filter((row) => ["queued", "created"].includes(row.status)).length,
        failed: rows.filter((row) => row.status === "failed").length,
        paused: rows.filter((row) => row.status === "paused").length,
        total: rows.length,
      },
      groups,
    };
  });
}
