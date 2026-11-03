import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const page = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("limit")) || 20));
    const { data: rows, error, count } = await db.from("app_notifications").select("id,actor_id,notification_type,entity_id,post_id,comment_id,title,created_at,read_at", { count: "exact" }).eq("recipient_id", user!.id).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
    dbError(error);
    const actorIds = [...new Set((rows || []).flatMap((row) => row.actor_id ? [row.actor_id] : []))];
    const postIds = [...new Set((rows || []).flatMap((row) => row.post_id ? [row.post_id] : []))];
    const [profiles, posts, unreadCount] = await Promise.all([
      actorIds.length ? db.from("profiles").select("id,nickname,avatar_url").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
      postIds.length ? db.from("posts").select(libraryFields).in("id", postIds) : Promise.resolve({ data: [], error: null }),
      db.from("app_notifications").select("id", { count: "exact", head: true }).eq("recipient_id", user!.id).is("read_at", null),
    ]);
    dbError(profiles.error); dbError(posts.error); dbError(unreadCount.error);
    const profileById = new Map((profiles.data || []).map((item) => [item.id, item]));
    const postById = new Map((posts.data || []).map((item) => [item.id, present(item as unknown as LibraryRow)]));
    return { items: (rows || []).map((row) => ({ ...row, actor: row.actor_id ? profileById.get(row.actor_id) || null : null, post: row.post_id ? postById.get(row.post_id) || null : null })), total: count || 0, unread: unreadCount.count || 0, page, limit };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const query = db.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user!.id).is("read_at", null);
    if (body.action === "read_all") {
      const { data, error } = await query.select("id");
      dbError(error);
      return { updated: data?.length || 0 };
    }
    if (body.action === "read") {
      const id = uuid(body.id, "通知");
      const { data, error } = await db.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", user!.id).is("read_at", null).select("id").maybeSingle();
      dbError(error);
      return { updated: Boolean(data) };
    }
    throw new ApiError(400, "通知操作无效");
  });
}
