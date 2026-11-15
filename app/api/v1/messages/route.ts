import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

/** Native inbox adapter over the existing dm_* tables and RPCs. RLS and the
 * same open_dm/send_dm business rules remain the authority for every action. */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const conversationId = req.nextUrl.searchParams.get("conversation");
    if (conversationId) {
      const room = uuid(conversationId, "会话");
      const before = req.nextUrl.searchParams.get("before");
      let query = db.from("dm_messages").select("id,conversation_id,sender_id,body,media_path,created_at")
        .eq("conversation_id", room).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40);
      if (before) {
        const timestamp = new Date(before);
        if (Number.isNaN(timestamp.valueOf())) throw new ApiError(400, "消息游标无效");
        query = query.lt("created_at", timestamp.toISOString());
      }
      const { data, error } = await query;
      dbError(error);
      if (!before) {
        const { error: readError } = await db.from("dm_reads").upsert({ conversation_id: room, user_id: user!.id, read_at: new Date().toISOString() });
        dbError(readError);
      }
      const messages = (data || []).reverse();
      return { items: messages, has_more: messages.length === 40, next_before: messages[0]?.created_at || null };
    }

    const { data, error } = await db.rpc("dm_inbox_summary");
    dbError(error);
    const items = (data || []) as Array<Record<string, unknown>>;
    const peerIds = [...new Set(items.map((row) => String(row.user_a === user!.id ? row.user_b : row.user_a)))];
    const profiles = peerIds.length
      ? await db.from("profiles").select("id,nickname,bio,avatar_url").in("id", peerIds)
      : { data: [], error: null };
    dbError(profiles.error);
    const byId = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
    return {
      items: items.map((row) => {
        const peerId = String(row.user_a === user!.id ? row.user_b : row.user_a);
        return { ...row, peer: byId.get(peerId) || null };
      }),
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const action = body.action;
    if (action === "search") {
      const query = textField(body.query, "搜索内容", 1, 60).replace(/[%,_(),]/g, "");
      const { data, error } = await db.from("profiles").select("id,nickname,bio,avatar_url")
        .neq("id", user!.id).ilike("nickname", `%${query}%`).order("nickname").limit(20);
      dbError(error);
      return { items: data || [] };
    }
    if (action === "open") {
      const peer = uuid(body.peer, "用户");
      const { data, error } = await db.rpc("open_dm", { peer });
      dbError(error);
      return { conversation_id: data };
    }
    if (action === "send") {
      const room = uuid(body.conversation, "会话");
      const nonce = body.nonce ? uuid(body.nonce, "消息编号") : crypto.randomUUID();
      const content = textField(body.content, "消息", 1, 2000);
      const { data, error } = await db.rpc("send_dm", { room, content, nonce, image_path: null });
      dbError(error);
      return data;
    }
    if (action === "read") {
      const room = uuid(body.conversation, "会话");
      const { error } = await db.from("dm_reads").upsert({ conversation_id: room, user_id: user!.id, read_at: new Date().toISOString() });
      dbError(error);
      return { read: true };
    }
    throw new ApiError(400, "消息操作无效");
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const id = uuid(req.nextUrl.searchParams.get("id"), "消息");
    const { error } = await db.from("dm_messages").delete().eq("id", id);
    dbError(error);
    return { removed: true };
  });
}
