import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const userId = uuid(req.nextUrl.searchParams.get("userId"), "用户");
    const result = await adminClient().from("user_badge_awards")
      .select("id,granted_at,revoked_at,profile_badge_types!inner(id,slug,label,description,color,active)")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("granted_at", { ascending: false });
    dbError(result.error);
    return { items: (result.data || []).map((row) => ({ id: row.id, granted_at: row.granted_at, badge: row.profile_badge_types })) };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const userId = uuid(body.userId, "用户");
    const badgeId = uuid(body.badgeId, "认证标识");
    const admin = adminClient();
    const [profile, badge] = await Promise.all([
      admin.from("profiles").select("id,nickname").eq("id", userId).maybeSingle(),
      admin.from("profile_badge_types").select("id,label,active").eq("id", badgeId).maybeSingle(),
    ]);
    dbError(profile.error); dbError(badge.error);
    if (!profile.data) throw new ApiError(404, "用户不存在");
    if (!badge.data?.active) throw new ApiError(400, "认证标识不存在或已停用");
    const inserted = await admin.from("user_badge_awards")
      .insert({ user_id: userId, badge_id: badgeId, source: "admin", granted_by: user.id })
      .select("id,granted_at")
      .single();
    if (inserted.error?.code === "23505") throw new ApiError(409, "该用户已经拥有这个认证标识");
    dbError(inserted.error);
    await recordModerationAudit(db, {
      actorId: user.id, action: "profile_badge_granted", targetType: "user", targetId: userId,
      reason: `向「${profile.data.nickname || userId}」授予认证标识「${badge.data.label}」`, details: { badgeId },
    });
    return { ...inserted.data, userId, badge: badge.data };
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const awardId = uuid(body.awardId, "认证记录");
    const admin = adminClient();
    const existing = await admin.from("user_badge_awards")
      .select("id,user_id,profile_badge_types!inner(label)")
      .eq("id", awardId)
      .is("revoked_at", null)
      .maybeSingle();
    dbError(existing.error);
    if (!existing.data) throw new ApiError(404, "认证记录不存在或已撤销");
    const revoked = await admin.from("user_badge_awards")
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id, revoke_reason: "管理员在后台撤销" })
      .eq("id", awardId)
      .is("revoked_at", null)
      .select("id,user_id")
      .maybeSingle();
    dbError(revoked.error);
    if (!revoked.data) throw new ApiError(409, "认证状态已变化，请刷新后重试");
    const badge = Array.isArray(existing.data.profile_badge_types) ? existing.data.profile_badge_types[0] : existing.data.profile_badge_types;
    await recordModerationAudit(db, {
      actorId: user.id, action: "profile_badge_revoked", targetType: "user", targetId: revoked.data.user_id,
      reason: `撤销认证标识「${badge?.label || "认证"}」`, details: { awardId },
    });
    return { revoked: true, awardId };
  });
}
