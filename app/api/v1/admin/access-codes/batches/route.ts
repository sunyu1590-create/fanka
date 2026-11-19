import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { generateMembershipCode, hashMembershipCode } from "@/lib/membership-codes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const admin = adminClient();
    const [badges, batches, codes] = await Promise.all([
      admin.from("profile_badge_types").select("id,slug,label,description,color,active,sort_order").order("sort_order").order("label"),
      admin.from("access_code_batches").select("id,code_kind,label,badge_id,reward_tier,reward_days,quantity,expires_at,active,created_at").order("created_at", { ascending: false }).limit(50),
      admin.from("access_codes").select("id,batch_id,status").limit(5000),
    ]);
    for (const result of [badges, batches, codes]) dbError(result.error);
    const grouped = new Map<string, Array<{ id: string; status: string }>>();
    for (const code of codes.data || []) {
      const items = grouped.get(code.batch_id) || [];
      items.push({ id: code.id, status: code.status });
      grouped.set(code.batch_id, items);
    }
    return {
      badges: badges.data || [],
      batches: (batches.data || []).map((batch) => {
        const items = grouped.get(batch.id) || [];
        return { ...batch, unused: items.filter((item) => item.status === "unused").length, redeemed: items.filter((item) => item.status === "redeemed").length, disabled: items.filter((item) => item.status === "disabled").length, codes: items };
      }),
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const kind = body.kind === "invitation" ? "invitation" : body.kind === "certification" ? "certification" : null;
    if (!kind) throw new ApiError(400, "请选择入驻邀请或认证码");
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new ApiError(400, "每批可生成 1–500 个邀请码");
    const label = textField(body.label, "批次名称", 1, 100);
    const admin = adminClient();
    const requestedBadgeId = kind === "invitation" ? null : textField(body.badgeId, "认证标签", 1, 80);
    const badge = kind === "invitation"
      ? await admin.from("profile_badge_types").select("id,slug,label,active").eq("slug", "invited-member").maybeSingle()
      : await admin.from("profile_badge_types").select("id,slug,label,active").eq("id", requestedBadgeId).maybeSingle();
    dbError(badge.error);
    if (!badge.data?.active) throw new ApiError(400, "该认证标签已停用");
    let expiresAt: string | null = null;
    if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "") {
      if (typeof body.expiresAt !== "string" || !Number.isFinite(Date.parse(body.expiresAt))) throw new ApiError(400, "有效期无效");
      expiresAt = new Date(body.expiresAt).toISOString();
      if (Date.parse(expiresAt) <= Date.now()) throw new ApiError(400, "有效期必须晚于当前时间");
    }
    const rewardDays = kind === "invitation" ? 30 : 0;
    const codes = Array.from({ length: quantity }, generateMembershipCode);
    const created = await admin.from("access_code_batches").insert({
      code_kind: kind, label, badge_id: badge.data.id, reward_tier: kind === "invitation" ? "pro" : null,
      reward_days: rewardDays, quantity, expires_at: expiresAt, created_by: user.id,
    }).select("id").single();
    dbError(created.error);
    if (!created.data) throw new ApiError(500, "邀请码批次创建失败");
    const batchId = created.data.id;
    const inserted = await admin.from("access_codes").insert(codes.map((code) => ({ batch_id: batchId, code_hash: hashMembershipCode(code) })));
    if (inserted.error) {
      await admin.from("access_code_batches").delete().eq("id", batchId);
      dbError(inserted.error);
    }
    await recordModerationAudit(db, {
      actorId: user.id, action: "access_code_batch_created", targetType: "access_code_batch", targetId: batchId,
      reason: `生成${kind === "invitation" ? "入驻邀请" : "认证"}码「${label}」共 ${quantity} 个`,
      details: { kind, badge: badge.data.slug, quantity, rewardDays, expiresAt },
    });
    // Raw codes are returned only once; only SHA-256 hashes are stored.
    return { batchId, kind, badge: badge.data, rewardDays, codes };
  });
}
