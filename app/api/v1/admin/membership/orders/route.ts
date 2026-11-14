import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const { data, error } = await adminClient().from("afdian_orders").select("id,provider_order_id,plan_id,amount_cents,payment_status,processing_status,redeem_batch_id,received_at,verified_at,issue_note").order("received_at", { ascending: false }).limit(100);
    dbError(error);
    return { items: data || [], automationEnabled: false };
  });
}

/** Creates an unverified intake record from details an admin observed on Afdian. */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const providerOrderId = textField(body.providerOrderId, "爱发电订单号", 3, 120);
    const planId = body.planId == null || body.planId === "" ? null : textField(body.planId, "方案", 1, 80);
    const amountCents = body.amountCents == null || body.amountCents === "" ? null : Number(body.amountCents);
    if (amountCents !== null && (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 100_000_000)) throw new ApiError(400, "订单金额无效");
    const issueNote = textField(body.issueNote, "登记说明", 3, 500);
    const service = adminClient();
    const { data, error } = await service.from("afdian_orders").insert({
      provider_order_id: providerOrderId.trim(),
      plan_id: planId,
      amount_cents: amountCents,
      payment_status: "unverified",
      processing_status: "needs_review",
      issue_note: issueNote.trim(),
    }).select("id,provider_order_id,plan_id,amount_cents,payment_status,processing_status,redeem_batch_id,received_at,verified_at,issue_note").single();
    if (error?.code === "23505") throw new ApiError(409, "这个订单号已经登记过");
    dbError(error);
    if (!data) throw new ApiError(500, "订单登记失败，请稍后重试");
    await recordModerationAudit(db, { actorId: user.id, action: "afdian_order_manually_recorded", targetType: "afdian_order", targetId: data.id, reason: issueNote.trim(), details: { providerOrderId, planId, amountCents } });
    return data;
  });
}

/** Human review only. This records an administrator's decision; it never grants membership or issues a code. */
export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const id = uuid(body.id, "订单编号");
    const paymentStatus = String(body.paymentStatus || "");
    const processingStatus = String(body.processingStatus || "");
    if (!["unverified", "paid", "refunded", "failed", "unknown"].includes(paymentStatus)) throw new ApiError(400, "支付状态无效");
    if (!["pending", "verified", "needs_review", "ignored"].includes(processingStatus)) throw new ApiError(400, "复核状态无效");
    if (paymentStatus === "paid" && processingStatus !== "verified") throw new ApiError(400, "只有完成人工核验的已付款订单才能计入已核验赞助");
    if (processingStatus === "verified" && paymentStatus !== "paid") throw new ApiError(400, "只有已付款订单才能标记为已核验");
    const issueNote = textField(body.issueNote, "复核依据或处理说明", 3, 500);
    if (paymentStatus === "paid" && issueNote.trim().length < 10) throw new ApiError(400, "请记录至少 10 个字符的核验依据，例如平台订单状态与核对信息");

    const service = adminClient();
    const { data, error } = await service.from("afdian_orders").update({
      payment_status: paymentStatus,
      processing_status: processingStatus,
      issue_note: issueNote.trim(),
      verified_at: paymentStatus === "paid" && processingStatus === "verified" ? new Date().toISOString() : null,
    }).eq("id", id).select("id,provider_order_id,plan_id,amount_cents,payment_status,processing_status,redeem_batch_id,received_at,verified_at,issue_note").maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "订单记录不存在");
    await recordModerationAudit(db, {
      actorId: user.id,
      action: "afdian_order_manually_reviewed",
      targetType: "afdian_order",
      targetId: id,
      reason: issueNote.trim(),
      details: { paymentStatus, processingStatus, providerOrderId: data.provider_order_id },
    });
    return data;
  });
}
