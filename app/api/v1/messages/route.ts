import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, context, jsonBody, respond, uuid } from "@/lib/server/api";

type Conversation = { id: string; user_a: string; user_b: string; created_at: string };

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function peerOf(conversation: Conversation, userId: string) {
  return conversation.user_a === userId ? conversation.user_b : conversation.user_a;
}

/** 原生客户端的私信收件箱：会话列表与单会话历史。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const me = user!.id;
    const db = adminClient();
    const conversationId = req.nextUrl.searchParams.get("conversation");

    if (conversationId) {
      const id = uuid(conversationId, "会话");
      const { data: conversation } = await db
        .from("dm_conversations")
        .select("id,user_a,user_b")
        .eq("id", id)
        .maybeSingle();
      if (!conversation || (conversation.user_a !== me && conversation.user_b !== me)) {
        throw new ApiError(404, "会话不存在");
      }
      const before = req.nextUrl.searchParams.get("before");
      let query = db
        .from("dm_messages")
        .select("id,conversation_id,sender_id,body,created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .limit(51);
      if (before) query = query.lt("created_at", before);
      const { data: rows, error } = await query;
      if (error) throw new ApiError(503, "消息加载失败，请稍后重试");
      const all = rows ?? [];
      return { items: all.slice(0, 50).reverse(), has_more: all.length > 50 };
    }

    const { data: conversations, error } = await db
      .from("dm_conversations")
      .select("id,user_a,user_b,created_at")
      .or(`user_a.eq.${me},user_b.eq.${me}`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new ApiError(503, "会话列表加载失败，请稍后重试");
    const list = (conversations ?? []) as Conversation[];
    if (!list.length) return { items: [] };

    const ids = list.map((row) => row.id);
    const [{ data: messages }, { data: reads }, { data: profiles }] = await Promise.all([
      db
        .from("dm_messages")
        .select("conversation_id,sender_id,body,created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false }),
      db.from("dm_reads").select("conversation_id,read_at").eq("user_id", me).in("conversation_id", ids),
      db
        .from("profiles")
        .select("id,nickname,avatar_url,bio")
        .in("id", [...new Set(list.map((row) => peerOf(row, me)))])
    ]);

    const readAt = new Map((reads ?? []).map((row) => [row.conversation_id, row.read_at as string]));
    const lastMessage = new Map<string, { body: string; created_at: string }>();
    const unread = new Map<string, number>();
    for (const message of messages ?? []) {
      if (!lastMessage.has(message.conversation_id)) {
        lastMessage.set(message.conversation_id, { body: message.body, created_at: message.created_at });
      }
      if (message.sender_id === me) continue;
      const seen = readAt.get(message.conversation_id);
      if (!seen || new Date(message.created_at) > new Date(seen)) {
        unread.set(message.conversation_id, (unread.get(message.conversation_id) ?? 0) + 1);
      }
    }

    const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
    const items = list
      .map((row) => {
        const peerId = peerOf(row, me);
        const peer = profileById.get(peerId);
        const last = lastMessage.get(row.id);
        return {
          conversation_id: row.id,
          peer: {
            id: peerId,
            nickname: peer?.nickname || "探索者",
            avatar_url: peer?.avatar_url ?? null,
            bio: peer?.bio ?? ""
          },
          latest_body: last?.body ?? "",
          unread: unread.get(row.id) ?? 0,
          created_at: last?.created_at ?? row.created_at
        };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return { items };
  });
}

/** 打开会话、发送消息、标记已读。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const me = user!.id;
    const body = await jsonBody(req);
    const action = String(body.action ?? "");
    const db = adminClient();

    if (action === "open") {
      const peer = uuid(body.peer, "用户");
      if (peer === me) throw new ApiError(400, "不能和自己发起私聊");
      const [userA, userB] = orderedPair(me, peer);
      const { data: existing } = await db
        .from("dm_conversations")
        .select("id")
        .eq("user_a", userA)
        .eq("user_b", userB)
        .limit(1)
        .maybeSingle();
      if (existing?.id) return { conversation_id: existing.id };
      const { data: created, error } = await db
        .from("dm_conversations")
        .insert({ user_a: userA, user_b: userB })
        .select("id")
        .single();
      if (error || !created) throw new ApiError(503, "会话创建失败，请稍后重试");
      return { conversation_id: created.id };
    }

    const conversationId = uuid(body.conversation, "会话");
    const { data: conversation } = await db
      .from("dm_conversations")
      .select("id,user_a,user_b")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conversation || (conversation.user_a !== me && conversation.user_b !== me)) {
      throw new ApiError(404, "会话不存在");
    }

    if (action === "send") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 2000) throw new ApiError(400, "消息内容须为 1-2000 字");
      const { data: row, error } = await db
        .from("dm_messages")
        .insert({ conversation_id: conversationId, sender_id: me, body: content })
        .select("id,conversation_id,sender_id,body,created_at")
        .single();
      if (error) throw new ApiError(503, "消息发送失败，请稍后重试");
      await db
        .from("dm_reads")
        .upsert(
          { conversation_id: conversationId, user_id: me, read_at: new Date().toISOString() },
          { onConflict: "conversation_id,user_id" }
        );
      return row;
    }

    if (action === "delete") {
      const messageId = uuid(body.message, "消息");
      const { data: message } = await db
        .from("dm_messages")
        .select("id,conversation_id,sender_id")
        .eq("id", messageId)
        .maybeSingle();
      if (!message || message.conversation_id !== conversationId) {
        throw new ApiError(404, "消息不存在");
      }
      if (message.sender_id !== me) {
        throw new ApiError(403, "只能删除自己发送的消息");
      }
      // 双方同时删除：本来就没有"仅删除本地"的语义，直接物理删除。
      const { error } = await db.from("dm_messages").delete().eq("id", messageId);
      if (error) throw new ApiError(503, "消息删除失败，请稍后重试");
      return { deleted: messageId };
    }

    if (action === "read") {
      await db
        .from("dm_reads")
        .upsert(
          { conversation_id: conversationId, user_id: me, read_at: new Date().toISOString() },
          { onConflict: "conversation_id,user_id" }
        );
      return { read: true };
    }

    throw new ApiError(400, "未知的私信操作");
  });
}
