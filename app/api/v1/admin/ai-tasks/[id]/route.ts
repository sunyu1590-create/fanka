import { NextRequest } from "next/server";
import { ApiError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { user } = await requireAdmin(req);
    const id = uuid((await params).id, "任务 ID");
    const body = await jsonBody(req);
    const admin = adminClient();

    if (body.action === "review") {
      const itemId = uuid(body.itemId, "复审记录 ID");
      const decision = ["published", "hidden", "revision"].includes(String(body.decision)) ? String(body.decision) : null;
      if (!decision) throw new ApiError(400, "人工复审结果无效");
      const reason = textField(body.reason, "人工处理原因", 3, 500);
      const applied = await admin.rpc("apply_ai_review_decision", {
        p_batch_id: id, p_item_id: itemId, p_actor_id: user.id, p_decision: decision, p_reason: reason,
      });
      if (applied.error) {
        if (/review item already handled|post status changed/i.test(applied.error.message)) throw new ApiError(409, "该复审记录已处理或作品审核状态已变化，请刷新后重试");
        throw new ApiError(503, "人工复审未能完整保存，请稍后重试");
      }
      return applied.data;
    }

    if (body.action === "reanalyze") {
      const itemId = uuid(body.itemId, "复审记录 ID");
      const update = await admin.from("ai_task_items").update({ status: "pending", attempts: 0, error_message: null, completed_at: null, updated_at: new Date().toISOString() })
        .eq("id", itemId).eq("batch_id", id).eq("status", "review").select("id").maybeSingle();
      if (update.error || !update.data) throw new ApiError(409, "该记录已处理，无法重新分析");
      const started = await admin.from("ai_task_batches").update({ status: "running", completed_at: null, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
      if (started.error || !started.data) throw new ApiError(409, "任务状态已变化，无法重新分析");
      return { id: itemId, status: "pending" };
    }

    if (body.action === "close") {
      // 作品被删除后 ai_task_items.post_id 由外键置空，这类记录无法通过/驳回，只能关闭。
      // 关闭前必须确认它确实已无关联作品，避免把可复审的内容误关。
      const itemId = uuid(body.itemId, "复审记录 ID");
      const reason = textField(body.reason, "关闭原因", 3, 500);
      const row = await admin.from("ai_task_items").select("id,post_id,status").eq("id", itemId).eq("batch_id", id).maybeSingle();
      if (row.error) throw new ApiError(503, "复审记录暂不可读取");
      if (!row.data) throw new ApiError(404, "复审记录不存在或不属于该任务");
      if (row.data.post_id) throw new ApiError(409, "该记录仍有关联作品，请使用通过、驳回或退回修改");
      if (!["review", "pending", "failed"].includes(String(row.data.status))) throw new ApiError(409, "该记录已处理，无需再次关闭");
      const closed = await admin.from("ai_task_items")
        .update({ status: "skipped", error_message: `关联作品已删除，审核项由管理员关闭：${reason}`, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", itemId).eq("batch_id", id).is("post_id", null).select("id").maybeSingle();
      if (closed.error || !closed.data) throw new ApiError(409, "该记录状态已变化，请刷新后重试");
      // 批次计数同步，否则「待复审」数字会长期虚高。
      const remaining = await admin.from("ai_task_items").select("id", { count: "exact", head: true }).eq("batch_id", id).eq("status", "review");
      if (!remaining.error) {
        await admin.from("ai_task_batches").update({ review_count: remaining.count || 0, updated_at: new Date().toISOString() }).eq("id", id);
      }
      return { id: itemId, status: "skipped" };
    }

    const actions = {
      start: { from: ["queued"], to: "running" },
      resume: { from: ["paused"], to: "running" },
      pause: { from: ["running"], to: "paused" },
      cancel: { from: ["queued", "running", "paused"], to: "cancelled" },
    } as const;
    const action = typeof body.action === "string" ? actions[body.action as keyof typeof actions] : undefined;
    if (!action) throw new ApiError(400, "任务操作无效");
    const updated = await admin.from("ai_task_batches").update({ status: action.to, ...(action.to === "cancelled" ? { completed_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() })
      .eq("id", id).in("status", [...action.from]).select("id,status").maybeSingle();
    if (updated.error || !updated.data) throw new ApiError(409, "任务当前状态不支持此操作");
    return updated.data;
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireAdmin(req);
    const id = uuid((await params).id, "任务 ID");
    const body = await jsonBody(req);
    if (body.action !== "retry") throw new ApiError(400, "任务操作无效");
    const admin = adminClient();
    const batch = await admin.from("ai_task_batches").select("id,status").eq("id", id).single();
    if (batch.error || !["completed", "failed"].includes(batch.data.status)) throw new ApiError(409, "仅已结束的任务可以重试失败项目");
    const reset = await admin.from("ai_task_items").update({ status: "pending", attempts: 0, error_message: null, completed_at: null, updated_at: new Date().toISOString() }).eq("batch_id", id).eq("status", "failed");
    if (reset.error) throw new ApiError(503, "失败项目无法重新排队");
    const running = await admin.from("ai_task_batches").update({ status: "running", completed_at: null, updated_at: new Date().toISOString() }).eq("id", id).select("id,status").single();
    if (running.error) throw new ApiError(503, "任务无法恢复");
    return running.data;
  });
}
