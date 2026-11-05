import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requireAdmin } from "@/lib/server/require-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const id = uuid((await params).id);
    const values: Record<string, string | null> = {};
    if (body.role !== undefined) {
      if (body.role !== "member" && body.role !== "admin") throw new ApiError(400, "账号角色无效");
      if (id === user.id && body.role === "member") throw new ApiError(400, "不能移除自己的管理员权限");
      values.role = body.role;
    }
    if (body.membership_tier !== undefined && !["free", "plus", "pro"].includes(String(body.membership_tier))) {
      throw new ApiError(400, "会员等级无效");
    }
    const hasRestriction = body.community_restriction !== undefined;
    if (!Object.keys(values).length && body.membership_tier === undefined && !hasRestriction) throw new ApiError(400, "没有可更新的账号设置");

    let resultProfile: Record<string, unknown> | null = null;
    if (Object.keys(values).length) {
      const result = await db.from("profiles").update(values).eq("id", id).select("id,nickname,role,membership_tier,role_updated_at").single();
      if (result.error?.message.includes("last administrator")) throw new ApiError(409, "系统至少需要保留一位管理员");
      dbError(result.error);
      resultProfile = result.data;
      await recordModerationAudit(db, { actorId: user.id, action: body.role === "admin" ? "admin_role_granted" : "admin_role_removed", targetType: "user", targetId: id, reason: "管理员角色变更" });
    }

    if (body.membership_tier !== undefined) {
      const result = await db.rpc("set_membership_tier", { p_profile_id: id, p_membership_tier: String(body.membership_tier) });
      dbError(result.error);
      await recordModerationAudit(db, { actorId: user.id, action: "membership_tier_changed", targetType: "user", targetId: id, reason: `会员等级设为 ${String(body.membership_tier)}` });
    }

    let restriction: Record<string, unknown> | null = null;
    if (hasRestriction) {
      const input = body.community_restriction;
      if (!input || typeof input !== "object" || typeof (input as Record<string, unknown>).active !== "boolean") throw new ApiError(400, "账号限制设置无效");
      const active = (input as Record<string, unknown>).active as boolean;
      const target = await db.from("profiles").select("role,nickname").eq("id", id).single();
      dbError(target.error);
      if (!target.data) throw new ApiError(404, "用户不存在");
      if (target.data.role === "admin") throw new ApiError(400, "管理员账号不支持社区发言限制");
      if (active) {
        const rawUntil = (input as Record<string, unknown>).restricted_until;
        let restrictedUntil: string | null = null;
        if (rawUntil !== null && rawUntil !== undefined) {
          if (typeof rawUntil !== "string" || !Number.isFinite(Date.parse(rawUntil))) throw new ApiError(400, "限制时长无效");
          const end = new Date(rawUntil);
          const maxEnd = Date.now() + 31 * 24 * 60 * 60 * 1000;
          if (end.getTime() <= Date.now() || end.getTime() > maxEnd) throw new ApiError(400, "限制时长需在现在到 30 天内");
          restrictedUntil = end.toISOString();
        }
        const reason = textField((input as Record<string, unknown>).reason, "限制原因", 3, 500);
        const { data, error } = await db.from("community_restrictions").upsert({
          user_id: id, active: true, restricted_until: restrictedUntil, reason, set_by: user.id, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" }).select("user_id,active,restricted_until,reason,updated_at").single();
        dbError(error);
        restriction = data;
        await recordModerationAudit(db, { actorId: user.id, action: "community_restriction_set", targetType: "user", targetId: id, reason, details: { restrictedUntil, permanent: restrictedUntil === null } });
      } else {
        const { data, error } = await db.from("community_restrictions").delete().eq("user_id", id).select("user_id").maybeSingle();
        dbError(error);
        await recordModerationAudit(db, { actorId: user.id, action: "community_restriction_removed", targetType: "user", targetId: id, reason: "解除社区发言限制" });
        restriction = null;
        void data;
      }
    }

    if (!resultProfile) {
      const profile = await db.from("profiles").select("id,nickname,role,membership_tier,role_updated_at").eq("id", id).single();
      dbError(profile.error);
      resultProfile = profile.data;
    }
    return { ...resultProfile, ...(hasRestriction ? { community_restriction: restriction } : {}) };
  });
}
