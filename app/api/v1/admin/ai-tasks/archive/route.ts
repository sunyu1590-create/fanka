import { NextRequest } from "next/server";
import { respond, dbError, ApiError, jsonBody, uuid } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 复审记录归档 / 删除。
 *
 * 业务约束（对应 Control Center 2.1 第七部分）：
 * - 只做软删除：写入 archived_at，正常列表不再展示，保留最小审计信息；
 * - 原作品仍然有效且待审核时禁止删除，避免用「删记录」绕过审核；
 * - 作品已删除、已发布或已驳回的陈旧记录才允许清理；
 * - 每次操作写 admin_action_logs，计数同步回批次。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "content.review");
    const db = adminClient();
    const limit = Math.min(100, Math.max(10, Number(req.nextUrl.searchParams.get("limit") || 30)));
    const { data, error, count } = await db.from("ai_task_items")
      .select("id,batch_id,post_id,status,archive_reason,archived_at,archived_by,content_state,error_message,updated_at", { count: "exact" })
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(limit);
    dbError(error);
    return { items: data || [], total: count || 0 };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "content.manage");
    const body = await jsonBody(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    if (!items.length) throw new ApiError(400, "请选择复审记录");
    const reason = typeof body.reason === "string" && body.reason.trim().length >= 3 ? body.reason.trim().slice(0, 300) : "管理员清理失效复审记录";
    const db = adminClient();
    const archived: string[] = [];
    const blocked: Array<{ id: string; reason: string }> = [];

    for (const raw of items) {
      const itemId = uuid((raw as { itemId?: string }).itemId, "复审记录 ID");
      const batchId = uuid((raw as { batchId?: string }).batchId, "任务 ID");
      const { data: row, error } = await db.from("ai_task_items")
        .select("id,batch_id,post_id,status,archived_at")
        .eq("id", itemId).eq("batch_id", batchId).maybeSingle();
      if (error) throw new ApiError(503, "复审记录暂不可读取");
      if (!row) { blocked.push({ id: itemId, reason: "记录不存在" }); continue; }
      if (row.archived_at) { blocked.push({ id: itemId, reason: "已归档" }); continue; }

      // 关键校验：作品仍在审核流程里（草稿未提交 / 等待人工结论）时，
      // 不允许通过删记录让作品绕过审核。作品已发布、已隐藏或已被删除的
      // 复审记录属于陈旧数据，允许清理。
      let contentState = "post_deleted";
      if (row.post_id) {
        const { data: post } = await db.from("posts").select("id,status").eq("id", row.post_id).maybeSingle();
        if (post) {
          if (post.status === "pending_review" || post.status === "draft") {
            blocked.push({ id: itemId, reason: "作品仍在审核流程中，请先做出审核结论" });
            continue;
          }
          contentState = post.status === "published" ? "post_published" : post.status === "hidden" ? "post_hidden" : "ok";
        }
      }

      // 乐观锁：只有 archived_at 仍为空时才写入。Supabase 的 update 在命中 0 行时
      // 不报错，必须用 returning 判断是否真的抢到，否则并发下两个管理员都会计入成功。
      const { data: updated, error: updateError } = await db.from("ai_task_items").update({
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        archive_reason: reason,
        content_state: contentState,
        updated_at: new Date().toISOString(),
      }).eq("id", itemId).is("archived_at", null).select("id");
      if (updateError) { blocked.push({ id: itemId, reason: "状态已变化，请刷新后重试" }); continue; }
      if (!updated || !updated.length) { blocked.push({ id: itemId, reason: "已被其他管理员归档" }); continue; }
      archived.push(itemId);

      const { count } = await db.from("ai_task_items").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", "review").is("archived_at", null);
      await db.from("ai_task_batches").update({ review_count: count || 0, updated_at: new Date().toISOString() }).eq("id", batchId);
    }

    if (archived.length) {
      await db.from("admin_action_logs").insert({
        actor_id: user.id,
        action: "review.archive",
        target: `ai_task_items:${archived.length}`,
        detail: { count: archived.length, blocked: blocked.length, reason },
      });
    }
    return { archived, blocked };
  });
}
