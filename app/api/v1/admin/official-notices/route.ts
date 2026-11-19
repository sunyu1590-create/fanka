import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export const dynamic = "force-dynamic";

function safeUrl(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new ApiError(400, `${label}无效`);
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); return url.toString(); }
  catch { throw new ApiError(400, `${label}必须是站内路径或 HTTPS 地址`); }
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const result = await adminClient().from("official_notices").select("id,title,body,image_url,action_label,action_url,audience,created_at,published_at").order("published_at", { ascending: false }).limit(100);
    dbError(result.error);
    return { items: result.data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const title = textField(body.title, "通知标题", 1, 80);
    const content = textField(body.body, "通知内容", 1, 3000);
    const audience = ["all", "free", "plus", "pro"].includes(String(body.audience)) ? String(body.audience) : null;
    if (!audience) throw new ApiError(400, "通知范围无效");
    const imageUrl = safeUrl(body.imageUrl, "封面地址", 2048);
    const actionLabel = body.actionLabel ? textField(body.actionLabel, "按钮文字", 1, 24) : null;
    const actionUrl = safeUrl(body.actionUrl, "按钮链接", 2048);
    if (Boolean(actionLabel) !== Boolean(actionUrl)) throw new ApiError(400, "按钮文字和链接需要同时填写");
    const admin = adminClient();
    const created = await admin.from("official_notices").insert({ title, body: content, image_url: imageUrl, action_label: actionLabel, action_url: actionUrl, audience, created_by: user.id })
      .select("id,title,body,image_url,action_label,action_url,audience,created_at,published_at").single();
    dbError(created.error);
    if (!created.data) throw new ApiError(500, "官方通知创建失败");
    const notice = created.data;

    let recipients: Array<{ id: string }> = [];
    for (let from = 0; ; from += 1000) {
      let query = admin.from("profiles").select("id").order("created_at").range(from, from + 999);
      if (audience !== "all") query = query.eq("membership_tier", audience);
      const page = await query;
      dbError(page.error);
      recipients = recipients.concat((page.data || []) as Array<{ id: string }>);
      if (!page.data || page.data.length < 1000) break;
    }
    for (let i = 0; i < recipients.length; i += 500) {
      const rows = recipients.slice(i, i + 500).map((recipient) => ({ notice_id: notice.id, user_id: recipient.id }));
      if (rows.length) dbError((await admin.from("official_notice_recipients").insert(rows)).error);
    }
    await recordModerationAudit(db, { actorId: user.id, action: "official_notice_sent", targetType: "official_notice", targetId: notice.id, reason: `发送官方通知「${title}」`, details: { audience, recipients: recipients.length } });
    return { ...notice, recipients: recipients.length };
  });
}
