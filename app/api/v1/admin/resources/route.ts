import { NextRequest } from "next/server";
import { respond, dbError, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["image", "document", "ai", "archive", "app", "media", "other"]);
const STATES = new Set(["referenced", "temporary", "pending", "orphan"]);

/**
 * 资源管理。容量全部来自对象存储真实对象表（storage.objects），
 * 不按数据库记录推算，也不把引用次数乘文件体积。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "content.read");
    const db = adminClient();
    const params = req.nextUrl.searchParams;
    const view = params.get("view") || "summary";

    if (view === "summary") {
      const { data, error } = await db.rpc("heika_storage_summary");
      if (error) throw new ApiError(503, "存储容量统计暂不可用");
      const { data: scans } = await db.from("admin_resource_scans").select("id,status,scanned_count,orphan_count,duplicate_count,missing_count,reclaimable_bytes,created_at,finished_at,detail").order("created_at", { ascending: false }).limit(8);
      const latest = (scans || []).find((row) => row.status === "completed") || null;
      return { ...data, latest_scan: latest, scans: scans || [] };
    }

    if (view === "page") {
      const kind = params.get("kind");
      const state = params.get("state");
      const sort = params.get("sort") || "created";
      const limit = Math.min(100, Math.max(6, Number(params.get("limit") || 24)));
      const offset = Math.max(0, Number(params.get("offset") || 0));
      const { data, error } = await db.rpc("heika_storage_page", {
        p_bucket: params.get("bucket") || null,
        p_search: params.get("q") ? String(params.get("q")).slice(0, 80) : null,
        p_kind: kind && KINDS.has(kind) ? kind : null,
        p_state: state && STATES.has(state) ? state : null,
        p_sort: ["size", "name", "created"].includes(sort) ? sort : "created",
        p_desc: params.get("desc") !== "0",
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw new ApiError(503, "资源列表暂不可用");
      return data;
    }

    if (view === "detail") {
      const bucket = String(params.get("bucket") || "");
      const name = String(params.get("name") || "");
      if (!bucket || !name) throw new ApiError(400, "资源参数无效");
      const { data, error } = await db.rpc("heika_storage_detail", { p_bucket: bucket, p_name: name });
      if (error) throw new ApiError(503, "资源详情暂不可读取");
      if (!data) throw new ApiError(404, "资源不存在或已被清理");
      const { data: uploads } = await db.from("upload_tasks").select("task_key,status,client_type,client_version,created_at,finished_at,user_id").eq("storage_path", name).limit(3);
      return { ...data, upload_tasks: uploads || [] };
    }

    if (view === "health") {
      const { data, error } = await db.rpc("heika_storage_health");
      if (error) throw new ApiError(503, "资源健康检查暂不可用");
      return data;
    }

    if (view === "rankings") {
      const from = params.get("from") || new Date().toISOString().slice(0, 10);
      const to = params.get("to") || from;
      const metric = ["bytes", "requests", "downloads"].includes(String(params.get("metric"))) ? String(params.get("metric")) : "bytes";
      const kind = params.get("kind");
      const { data, error } = await db.rpc("heika_media_top", {
        p_from: from, p_to: to, p_metric: metric,
        p_kind: kind && KINDS.has(kind) ? kind : null,
        p_limit: Math.min(30, Math.max(5, Number(params.get("limit") || 10))),
      });
      if (error) throw new ApiError(503, "热门资源暂不可用");
      return { from, to, metric, items: data || [] };
    }

    throw new ApiError(400, "视图无效");
  });
}

/** 扫描只产生报告；清理必须二次校验引用与保留期，任何一步不满足就拒绝。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "content.manage");
    const db = adminClient();
    const body = await jsonBody(req);
    const action = String(body.action || "");

    if (action === "scan") {
      const started = Date.now();
      const { data: created, error: createError } = await db.from("admin_resource_scans").insert({ kind: "health", status: "running", created_by: user.id }).select("id").single();
      dbError(createError);
      const { data, error } = await db.rpc("heika_storage_health");
      if (error) {
        await db.from("admin_resource_scans").update({ status: "failed", error_message: error.message.slice(0, 300), finished_at: new Date().toISOString() }).eq("id", created!.id);
        throw new ApiError(503, "资源健康检查失败");
      }
      const orphans = Array.isArray(data?.orphans) ? data.orphans : [];
      const duplicates = Array.isArray(data?.duplicates) ? data.duplicates : [];
      const missing = Array.isArray(data?.missing) ? data.missing : [];
      await db.from("admin_resource_scans").update({
        status: "completed",
        scanned_count: Number(data?.objects || 0),
        orphan_count: orphans.length,
        duplicate_count: duplicates.reduce((sum: number, group: { count: number }) => sum + Math.max(0, Number(group.count) - 1), 0),
        missing_count: missing.length,
        reclaimable_bytes: Number(data?.orphan_bytes || 0),
        detail: { duration_ms: Date.now() - started, orphan_bytes: data?.orphan_bytes, duplicate_bytes: data?.duplicate_bytes, temporary: data?.temporary, temporary_bytes: data?.temporary_bytes },
        finished_at: new Date().toISOString(),
      }).eq("id", created!.id);
      await db.from("admin_action_logs").insert({ actor_id: user.id, action: "resource.scan", target: "storage", detail: { orphans: orphans.length, duplicates: duplicates.length, missing: missing.length, scanned: data?.objects } });
      return { scan_id: created!.id, ...data };
    }

    if (action === "cleanup-preview") {
      const paths = Array.isArray(body.paths) ? body.paths.slice(0, 50) : [];
      if (!paths.length) throw new ApiError(400, "请选择待清理资源");
      const results = [];
      for (const item of paths) {
        const bucket = String((item as { bucket?: string }).bucket || "");
        const name = String((item as { name?: string }).name || "");
        if (!bucket || !name) continue;
        const { data } = await db.rpc("heika_storage_detail", { p_bucket: bucket, p_name: name });
        const ageDays = data?.created_at ? Math.floor((Date.now() - Date.parse(data.created_at)) / 86_400_000) : 0;
        const deletable = Boolean(data) && Number(data.ref_count) === 0 && ageDays >= 7;
        results.push({ bucket, name, bytes: Number(data?.bytes || 0), ref_count: Number(data?.ref_count || 0), age_days: ageDays, deletable, reason: deletable ? "未被任何业务引用且已过 7 天保留期" : !data ? "对象已不存在" : Number(data.ref_count) > 0 ? "仍被业务引用，禁止清理" : "未满 7 天保留期" });
      }
      return { items: results, deletable_bytes: results.filter((item) => item.deletable).reduce((sum, item) => sum + item.bytes, 0) };
    }

    if (action === "cleanup") {
      const paths = Array.isArray(body.paths) ? body.paths.slice(0, 50) : [];
      if (!paths.length) throw new ApiError(400, "请选择待清理资源");
      if (body.confirm !== true) throw new ApiError(400, "需要明确确认后才能清理");
      const removed: string[] = [];
      const skipped: Array<{ path: string; reason: string }> = [];
      for (const item of paths) {
        const bucket = String((item as { bucket?: string }).bucket || "");
        const name = String((item as { name?: string }).name || "");
        if (!bucket || !name) continue;
        // 删除前再次校验：扫描与删除之间可能有新的引用写入。
        const { data } = await db.rpc("heika_storage_detail", { p_bucket: bucket, p_name: name });
        const ageDays = data?.created_at ? Math.floor((Date.now() - Date.parse(data.created_at)) / 86_400_000) : 0;
        if (!data) { skipped.push({ path: name, reason: "对象已不存在" }); continue; }
        if (Number(data.ref_count) > 0) { skipped.push({ path: name, reason: "已被业务重新引用" }); continue; }
        if (ageDays < 7) { skipped.push({ path: name, reason: "未满 7 天保留期" }); continue; }
        const { error } = await db.storage.from(bucket).remove([name]);
        if (error) { skipped.push({ path: name, reason: error.message.slice(0, 120) }); continue; }
        removed.push(`${bucket}/${name}`);
      }
      await db.from("admin_action_logs").insert({ actor_id: user.id, action: "resource.cleanup", target: "storage", detail: { removed: removed.length, skipped: skipped.length, skipped_detail: skipped.slice(0, 20) } });
      return { removed, skipped };
    }

    throw new ApiError(400, "操作无效");
  });
}
