import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const slug = textField(body.slug, "标签编号", 2, 40).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(slug)) throw new ApiError(400, "标签编号仅能包含小写英文、数字、下划线和连字符");
    const label = textField(body.label, "标签名称", 1, 24);
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const color = typeof body.color === "string" ? body.color : "#78613B";
    if (description.length > 120) throw new ApiError(400, "说明不能超过 120 个字");
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new ApiError(400, "颜色格式应为 #RRGGBB");
    const sortOrder = Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 50;
    const result = await adminClient().from("profile_badge_types").insert({ slug, label, description, color, sort_order: sortOrder, created_by: user.id })
      .select("id,slug,label,description,color,active,sort_order").single();
    dbError(result.error);
    if (!result.data) throw new ApiError(500, "认证标签创建失败");
    await recordModerationAudit(db, { actorId: user.id, action: "profile_badge_type_created", targetType: "profile_badge_type", targetId: result.data.id, reason: `创建认证标签「${label}」` });
    return result.data;
  });
}
