import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { decryptRedeemCode } from "@/lib/server/redeem-code";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = await respond(async () => {
    const { db, user } = await requireAdmin(req);
    const batchId = uuid((await params).id, "批次编号");
    const body = await jsonBody(req);
    if (typeof body.label !== "string" || body.label.trim().length < 2 || body.label.trim().length > 120) throw new ApiError(400, "请填写卡密分发目标，例如爱发电商品名称");
    const exportRef = body.exportRef ? uuid(body.exportRef, "导出编号") : randomUUID();
    const service = adminClient();
    const { data, error } = await service.rpc("reserve_redeem_batch_export", { p_batch_id: batchId, p_actor_id: user.id, p_export_ref: exportRef, p_label: body.label.trim() });
    if (error) {
      if (error.message.includes("batch_already_distributed")) throw new ApiError(409, "该批次已分配给其他商品，不能重复分发");
      if (error.message.includes("batch_not_found")) throw new ApiError(404, "卡密批次不存在");
      throw new ApiError(400, "卡密批次导出失败");
    }
    const codes = ((data?.codes || []) as { code_ciphertext: string; code_suffix: string }[]).map((item) => decryptRedeemCode(item.code_ciphertext));
    if (!codes.length) throw new ApiError(409, "该批次没有可导出的未兑换卡密");
    await recordModerationAudit(db, { actorId: user.id, action: "membership_codes_exported", targetType: "membership_batch", targetId: batchId, reason: `卡密分配至 ${String(data.label)}`, details: { exportRef: data.exportRef, count: codes.length } });
    return { exportRef, label: data.label, text: codes.join("\n") + "\n" };
  });
  if (!response.ok) return response;
  const result = await response.json() as { data?: { exportRef: string; label: string; text: string }; error?: string };
  if (!result.data) return NextResponse.json({ error: "卡密导出结果无效" }, { status: 500 });
  return new NextResponse(result.data.text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="HEIKA-codes-${result.data.exportRef}.txt"`, "Cache-Control": "no-store", "X-HEIKA-Distribution": encodeURIComponent(result.data.label) } });
}
