import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const admin = adminClient();
    const deliveries = await admin.from("official_notice_recipients").select("notice_id,delivered_at,read_at").eq("user_id", user!.id).order("delivered_at", { ascending: false }).limit(100);
    dbError(deliveries.error);
    const rows = deliveries.data || [];
    const ids = rows.map((row) => row.notice_id);
    const notices = ids.length
      ? await admin.from("official_notices").select("id,title,body,image_url,action_label,action_url,published_at").in("id", ids)
      : { data: [], error: null };
    dbError(notices.error);
    const byId = new Map((notices.data || []).map((item) => [item.id, item]));
    const items = rows.flatMap((row) => byId.has(row.notice_id) ? [{ ...byId.get(row.notice_id)!, delivered_at: row.delivered_at, read_at: row.read_at }] : []);
    return { items, unread: rows.filter((row) => !row.read_at).length };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const body = await jsonBody(req);
    const admin = adminClient();
    const now = new Date().toISOString();
    let query = admin.from("official_notice_recipients").update({ read_at: now }).eq("user_id", user!.id).is("read_at", null);
    if (body.id) query = query.eq("notice_id", uuid(body.id, "通知"));
    const result = await query.select("notice_id");
    dbError(result.error);
    if (body.id && !result.data?.length) {
      const exists = await admin.from("official_notice_recipients").select("notice_id").eq("user_id", user!.id).eq("notice_id", String(body.id)).maybeSingle();
      if (!exists.data) throw new ApiError(404, "官方通知不存在");
    }
    return { read: true, count: result.data?.length || 0 };
  });
}
