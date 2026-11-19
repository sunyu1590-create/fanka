import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

function safeUrl(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new ApiError(400, `${label}无效`);
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); return url.toString(); }
  catch { throw new ApiError(400, `${label}必须是站内路径或 HTTPS 地址`); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const id = uuid((await params).id, "官方通知");
    const body = await jsonBody(req);
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = textField(body.title, "通知标题", 1, 80);
    if (body.body !== undefined) patch.body = textField(body.body, "通知内容", 1, 3000);
    if (body.imageUrl !== undefined) patch.image_url = safeUrl(body.imageUrl, "封面地址", 2048);
    if (body.actionLabel !== undefined) patch.action_label = body.actionLabel ? textField(body.actionLabel, "按钮文字", 1, 24) : null;
    if (body.actionUrl !== undefined) patch.action_url = safeUrl(body.actionUrl, "按钮链接", 2048);
    if (Object.keys(patch).length === 0) throw new ApiError(400, "请至少修改一项通知内容");
    const actionLabel = patch.action_label;
    const actionUrl = patch.action_url;
    if (actionLabel !== undefined && actionUrl === undefined || actionUrl !== undefined && actionLabel === undefined) {
      const current = await adminClient().from("official_notices").select("action_label,action_url").eq("id", id).maybeSingle();
      dbError(current.error);
      if (!current.data) throw new ApiError(404, "官方通知不存在");
      if (Boolean(actionLabel === undefined ? current.data.action_label : actionLabel) !== Boolean(actionUrl === undefined ? current.data.action_url : actionUrl)) throw new ApiError(400, "按钮文字和链接需要同时填写或清空");
    } else if (Boolean(actionLabel) !== Boolean(actionUrl)) {
      throw new ApiError(400, "按钮文字和链接需要同时填写或清空");
    }
    const result = await adminClient().from("official_notices").update(patch).eq("id", id)
      .select("id,title,body,image_url,action_label,action_url,audience,created_at,published_at").maybeSingle();
    dbError(result.error);
    if (!result.data) throw new ApiError(404, "官方通知不存在");
    await recordModerationAudit(db, { actorId: user.id, action: "official_notice_updated", targetType: "official_notice", targetId: id, reason: `编辑官方通知「${result.data.title}」` });
    return result.data;
  });
}
