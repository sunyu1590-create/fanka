import { NextRequest } from "next/server";
import { respond, dbError, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export const runtime = "nodejs";

/**
 * 媒体服务中心：
 * - ?view=overview  上传成功率（首次/最终口径分开）、队列状态计数、平均耗时
 * - ?view=tasks     上传任务检索（用户/作品/任务/状态/错误类型/时间范围/客户端）
 * - ?view=trace     单任务完整事件链路（按 task_key）
 * - POST action=verify  重新执行媒体完整性校验（对缺失对象标记，不伪造修复）
 * - POST action=mark    标记异常任务
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const view = req.nextUrl.searchParams.get("view") || "overview";

    if (view === "overview") {
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [all24h, byStatus, recentErrors] = await Promise.all([
        db.from("upload_tasks").select("status,attempts,duration_ms,bytes_sent", { count: "exact" }).gte("created_at", since24h).limit(5000),
        db.from("upload_tasks").select("status", { count: "exact", head: false }).gte("created_at", since24h),
        db.from("upload_tasks").select("task_key,file_name,error_code,error_message,status,client_type,updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(20),
      ]);
      dbError(all24h.error);
      dbError(byStatus.error);
      dbError(recentErrors.error);
      const rows = all24h.data || [];
      const ready = rows.filter((row) => row.status === "ready").length;
      const failed = rows.filter((row) => row.status === "failed").length;
      const firstTryReady = rows.filter((row) => row.status === "ready" && (row.attempts || 1) <= 1).length;
      const durations = rows.map((row) => row.duration_ms).filter((value): value is number => typeof value === "number" && value > 0).sort((a, b) => a - b);
      const counts: Record<string, number> = {};
      for (const row of byStatus.data || []) counts[row.status] = (counts[row.status] || 0) + 1;
      return {
        window: "24h",
        total_tasks: rows.length,
        ready,
        failed,
        // 首次成功率与最终成功率分开统计，不用重试后的成功掩盖首次故障。
        first_attempt_success_rate: rows.length ? Number(((firstTryReady / rows.length) * 100).toFixed(1)) : null,
        final_success_rate: rows.length ? Number(((ready / rows.length) * 100).toFixed(1)) : null,
        avg_duration_ms: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
        p95_duration_ms: durations.length ? durations[Math.min(durations.length - 1, Math.round(durations.length * 0.95))] : null,
        total_bytes: rows.reduce((sum, row) => sum + Number(row.bytes_sent || 0), 0),
        status_counts: counts,
        recent_failures: recentErrors.data || [],
        sample_note: `统计口径：24h 内创建的上传任务（样本 ${rows.length}）；取消与进行中的任务不计入最终失败。`,
      };
    }

    if (view === "tasks") {
      let query = db.from("upload_tasks").select("task_key,media_upload_id,post_id,file_name,file_size,mime_type,client_type,client_version,status,progress,bytes_sent,attempts,error_code,error_message,storage_path,verify_result,created_at,updated_at,finished_at,duration_ms").order("created_at", { ascending: false }).limit(100);
      const user = req.nextUrl.searchParams.get("user_id");
      const status = req.nextUrl.searchParams.get("status");
      const taskKey = req.nextUrl.searchParams.get("task_key");
      const clientType = req.nextUrl.searchParams.get("client_type");
      const errorType = req.nextUrl.searchParams.get("error_type");
      const from = req.nextUrl.searchParams.get("from");
      const to = req.nextUrl.searchParams.get("to");
      if (user) query = query.eq("user_id", user);
      if (status && status !== "all") query = query.eq("status", status);
      if (taskKey) query = query.ilike("task_key", `%${taskKey}%`);
      if (clientType) query = query.eq("client_type", clientType);
      if (errorType) query = query.eq("error_code", errorType);
      if (from) query = query.gte("created_at", new Date(from).toISOString());
      if (to) query = query.lte("created_at", new Date(to).toISOString());
      const { data, error } = await query;
      dbError(error);
      return { tasks: data || [] };
    }

    if (view === "trace") {
      const taskKey = req.nextUrl.searchParams.get("task_key");
      if (!taskKey) throw new ApiError(400, "任务编号无效");
      const { data, error } = await db.from("upload_tasks").select("*").eq("task_key", taskKey).maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "上传任务不存在");
      const { data: asset } = await db.from("media_assets").select("id,storage_path,thumbnail_path,retina_thumbnail_path,checksum_sha256,byte_size,status,post_id,verified_at:updated_at").eq("storage_path", data.storage_path || "").maybeSingle();
      return {
        task: data,
        media_asset: asset || null,
        chain: [
          { stage: "文件读取/压缩", status: "completed", note: data.client_type ? `客户端 ${data.client_type}${data.client_version ? ` ${data.client_version}` : ""}` : "客户端信息未上报" },
          { stage: "任务创建", status: "completed", at: data.created_at },
          { stage: "网络传输", status: data.status === "ready" ? "completed" : data.status, at: data.started_at, note: data.bytes_sent ? `${data.bytes_sent} 字节` : undefined },
          { stage: "完整性校验", status: data.verify_result === "ok" ? "completed" : data.verify_result || "unknown", note: data.verify_result === "ok" ? "对象存在且大小一致" : data.error_message || undefined },
          { stage: "媒体关联", status: asset?.post_id ? "completed" : "pending", note: asset?.post_id ? "已关联作品" : "未关联作品（staging 或已清理）" },
        ],
      };
    }

    throw new ApiError(400, "视图无效");
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const body = await jsonBody(req);
    const action = String(body.action || "");
    if (action === "mark") {
      const taskKey = String(body.task_key || "");
      const note = typeof body.note === "string" ? body.note.slice(0, 500) : "管理员标记为异常";
      if (!taskKey) throw new ApiError(400, "任务编号无效");
      const { data, error } = await db.from("upload_tasks").update({ error_message: note, updated_at: new Date().toISOString() }).eq("task_key", taskKey).select("task_key").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "上传任务不存在");
      return { marked: taskKey };
    }
    if (action === "verify") {
      // 重新校验：只报告事实（对象是否还在），不伪造修复结果。
      const storagePath = String(body.storage_path || "");
      if (!storagePath) throw new ApiError(400, "媒体路径无效");
      const folder = storagePath.includes("/") ? storagePath.slice(0, storagePath.lastIndexOf("/")) : "";
      const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
      const { data, error } = await db.storage.from("post-covers").list(folder, { limit: 1000 });
      dbError(error);
      const exists = (data || []).some((item) => item.name === name);
      return { storage_path: storagePath, exists, checked_at: new Date().toISOString(), note: exists ? "存储对象存在" : "存储对象缺失，无法在服务端恢复源文件，需要用户重新上传" };
    }
    throw new ApiError(400, "操作无效");
  });
}
