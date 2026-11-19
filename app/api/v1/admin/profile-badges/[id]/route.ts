import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const id = uuid((await params).id, "标签");
    const body = await jsonBody(req);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.label !== undefined) {
      if (typeof body.label !== "string" || body.label.trim().length < 1 || body.label.trim().length > 24) throw new ApiError(400, "标签名称须为 1–24 个字");
      patch.label = body.label.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.trim().length > 120) throw new ApiError(400, "说明不能超过 120 个字");
      patch.description = body.description.trim();
    }
    if (body.color !== undefined) {
      if (typeof body.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(body.color)) throw new ApiError(400, "颜色格式应为 #RRGGBB");
      patch.color = body.color;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new ApiError(400, "标签状态无效");
      patch.active = body.active;
    }
    const result = await adminClient().from("profile_badge_types").update(patch).eq("id", id).select("id,slug,label,description,color,active,sort_order").maybeSingle();
    dbError(result.error);
    if (!result.data) throw new ApiError(404, "标签不存在");
    await recordModerationAudit(db, { actorId: user.id, action: "profile_badge_type_updated", targetType: "profile_badge_type", targetId: id, reason: `更新认证标签「${result.data.label}」` });
    return result.data;
  });
}
