import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";
import { adminClient } from "@/lib/server/admin-client";
import { officialNotificationId, officialNoticeIdFromNotificationId, pageMergedNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const admin = adminClient();
    const page = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("limit")) || 20));
    const fetchCount = page * limit;
    const [notifications, unreadCount, deliveries, noticeUnread] = await Promise.all([
      db.from("app_notifications").select("id,actor_id,notification_type,entity_id,post_id,comment_id,title,created_at,read_at", { count: "exact" }).eq("recipient_id", user!.id).order("created_at", { ascending: false }).limit(fetchCount),
      db.from("app_notifications").select("id", { count: "exact", head: true }).eq("recipient_id", user!.id).is("read_at", null),
      admin.from("official_notice_recipients").select("notice_id,delivered_at,read_at", { count: "exact" }).eq("user_id", user!.id).order("delivered_at", { ascending: false }).limit(fetchCount),
      admin.from("official_notice_recipients").select("notice_id", { count: "exact", head: true }).eq("user_id", user!.id).is("read_at", null),
    ]);
    dbError(notifications.error); dbError(unreadCount.error); dbError(deliveries.error); dbError(noticeUnread.error);
    const rows = notifications.data || [];
    const deliveryRows = deliveries.data || [];
    const actorIds = [...new Set((rows || []).flatMap((row) => row.actor_id ? [row.actor_id] : []))];
    const postIds = [...new Set((rows || []).flatMap((row) => row.post_id ? [row.post_id] : []))];
    const noticeIds = deliveryRows.map((row) => row.notice_id);
    const [profiles, posts, notices] = await Promise.all([
      actorIds.length ? db.from("profiles").select("id,nickname,avatar_url").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
      postIds.length ? db.from("posts").select(libraryFields).in("id", postIds) : Promise.resolve({ data: [], error: null }),
      noticeIds.length ? admin.from("official_notices").select("id,title,body,image_url,action_label,action_url,published_at").in("id", noticeIds) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(profiles.error); dbError(posts.error); dbError(notices.error);
    const profileById = new Map((profiles.data || []).map((item) => [item.id, item]));
    const postById = new Map((posts.data || []).map((item) => [item.id, present(item as unknown as LibraryRow)]));
    const noticeById = new Map((notices.data || []).map((item) => [item.id, item]));
    const socialItems = rows.map((row) => ({ ...row, actor: row.actor_id ? profileById.get(row.actor_id) || null : null, post: row.post_id ? postById.get(row.post_id) || null : null }));
    const systemItems = deliveryRows.flatMap((delivery) => {
      const notice = noticeById.get(delivery.notice_id);
      return notice ? [{
        id: officialNotificationId(notice.id),
        actor_id: null,
        notification_type: "system_announcement" as const,
        entity_id: notice.id,
        post_id: null,
        comment_id: null,
        title: notice.title,
        body: notice.body,
        image_url: notice.image_url,
        action_label: notice.action_label,
        action_url: notice.action_url,
        created_at: delivery.delivered_at || notice.published_at,
        read_at: delivery.read_at,
        actor: { id: null, nickname: "黑卡系统", avatar_url: null },
        post: null,
      }] : [];
    });
    return {
      items: pageMergedNotifications(socialItems, systemItems, page, limit),
      total: (notifications.count || 0) + (deliveries.count || 0),
      unread: (unreadCount.count || 0) + (noticeUnread.count || 0),
      page,
      limit,
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const admin = adminClient();
    const now = new Date().toISOString();
    if (body.action === "read_all") {
      const [social, official] = await Promise.all([
        db.from("app_notifications").update({ read_at: now }).eq("recipient_id", user!.id).is("read_at", null).select("id"),
        admin.from("official_notice_recipients").update({ read_at: now }).eq("user_id", user!.id).is("read_at", null).select("notice_id"),
      ]);
      dbError(social.error); dbError(official.error);
      return { updated: (social.data?.length || 0) + (official.data?.length || 0) };
    }
    if (body.action === "read") {
      const rawId = typeof body.id === "string" ? body.id : "";
      const noticeId = officialNoticeIdFromNotificationId(rawId);
      if (noticeId !== null) {
        const id = uuid(noticeId, "通知");
        const { data, error } = await admin.from("official_notice_recipients").update({ read_at: now }).eq("notice_id", id).eq("user_id", user!.id).is("read_at", null).select("notice_id").maybeSingle();
        dbError(error);
        if (!data) {
          const exists = await admin.from("official_notice_recipients").select("notice_id").eq("notice_id", id).eq("user_id", user!.id).maybeSingle();
          dbError(exists.error);
          if (!exists.data) throw new ApiError(404, "通知不存在");
        }
        return { updated: Boolean(data) };
      }
      const id = uuid(rawId, "通知");
      const { data, error } = await db.from("app_notifications").update({ read_at: now }).eq("id", id).eq("recipient_id", user!.id).is("read_at", null).select("id").maybeSingle();
      dbError(error);
      return { updated: Boolean(data) };
    }
    throw new ApiError(400, "通知操作无效");
  });
}
