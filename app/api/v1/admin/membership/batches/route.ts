import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, dbError, jsonBody, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { encryptRedeemCode, generateRedeemCode, redeemCodeConfigurationReady } from "@/lib/server/redeem-code";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const service = adminClient();
    const { data, error } = await service.rpc("admin_membership_batch_stats");
    dbError(error);
    return { items: data || [] };
  });
}

export async function POST(req: NextRequest) {
  const response = await respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const tier = body.tier;
    if (tier !== "plus" && tier !== "pro") throw new ApiError(400, "卡密会员等级只能选择 Plus 或 Pro");
    const count = Number(body.count);
    const durationDays = Number(body.durationDays);
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new ApiError(400, "每批生成数量需为 1–1000 张");
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 7300) throw new ApiError(400, "有效天数需为 1–7300 天");
    if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 100) throw new ApiError(400, "请输入 1–100 字的批次名称");
    if (typeof body.distributionLabel !== "string" || body.distributionLabel.trim().length < 2 || body.distributionLabel.trim().length > 120) throw new ApiError(400, "请填写该批次唯一分配的商品或发放渠道");
    if (!redeemCodeConfigurationReady()) throw new ApiError(503, "卡密加密尚未配置，请先在服务端设置 HEIKA_REDEEM_CODE_KEY");
    const service = adminClient();
    const { data: batch, error: batchError } = await service.from("redeem_code_batches").insert({ name: body.name.trim(), tier, duration_days: durationDays, code_count: count, created_by: user.id }).select("id,name,tier,duration_days,code_count,created_at").single();
    dbError(batchError);
    if (!batch) throw new ApiError(500, "卡密批次创建失败，请稍后重试");
    const generated = Array.from({ length: count }, generateRedeemCode);
    const { error: codeError } = await service.from("redeem_codes").insert(generated.map((item) => ({ batch_id: batch.id, code_hash: item.hash, code_ciphertext: encryptRedeemCode(item.code), code_suffix: item.suffix, tier, duration_days: durationDays })));
    if (codeError) {
      await service.from("redeem_code_batches").delete().eq("id", batch.id);
      dbError(codeError);
    }
    const exportRef = randomUUID();
    const reservation = await service.rpc("reserve_redeem_batch_export", { p_batch_id: batch.id, p_actor_id: user.id, p_export_ref: exportRef, p_label: body.distributionLabel.trim() });
    if (reservation.error) {
      await service.from("redeem_codes").delete().eq("batch_id", batch.id);
      await service.from("redeem_code_batches").delete().eq("id", batch.id);
      dbError(reservation.error);
    }
    await recordModerationAudit(db, { actorId: user.id, action: "membership_codes_generated", targetType: "membership_batch", targetId: batch.id, reason: `生成并分配 ${tier.toUpperCase()} ${durationDays} 天激活码 × ${count} 至 ${body.distributionLabel.trim()}`, details: { count, tier, durationDays, exportRef } });
    return { batch: { ...batch, export_ref: exportRef, export_label: body.distributionLabel.trim() }, codes: generated.map(({ code }) => code), warning: "激活码仅在本次响应中明文返回，请立即下载并安全保存。该批次已锁定到指定分发渠道。" };
  });
  if (!response.ok) return response;
  const payload = await response.json();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache" } });
}
