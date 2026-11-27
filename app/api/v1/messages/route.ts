import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, context, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireFeature } from "@/lib/server/feature-flags";
import { requireAbility } from "@/lib/server/account-limits";

type Conversation = { id: string; user_a: string; user_b: string; created_at: string };

/** 撤回窗口：3 分钟。多给 5 秒容差，抵掉网络往返与客户端倒计时误差。 */
const RECALL_WINDOW_MS = 180_000;
const RECALL_GRACE_MS = 5_000;

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function peerOf(conversation: Conversation, userId: string) {
  return conversation.user_a === userId ? conversation.user_b : conversation.user_a;
}

async function membership(db: ReturnType<typeof adminClient>, conversationId: string, me: string): Promise<Conversation> {
  const { data: conversation } = await db
    .from("dm_conversations")
    .select("id,user_a,user_b,created_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation || (conversation.user_a !== me && conversation.user_b !== me)) {
    throw new ApiError(404, "会话不存在");
  }
  return conversation as Conversation;
}

function arg(body: Record<string, unknown>, key: string): unknown {
  return body[key];
}

/**
 * GET /api/v1/messages
 * - ?conversation=<id>&before=<ts>  单会话历史（增量/分页）
 * - ?view=settings&conversation=    会话个人设置
 * - ?view=search&q=&conversation=&before=  消息搜索
 * - ?view=media&conversation=&kind=&before=  媒体资源库
 * - ?view=requests                  陌生人消息请求（收到/发出）
 * - ?view=favorites                 消息收藏
 * - ?view=reactions&conversation=   会话内表情回应聚合
 * - ?view=privacy                   私信隐私设置
 * 无参数时返回原生收件箱（保持旧契约）。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const me = user!.id;
    const db = adminClient();
    const p = req.nextUrl.searchParams;
    const view = p.get("view") || "";
    const conversationId = p.get("conversation");

    // ---- 会话个人设置 ----
    if (view === "settings" && conversationId) {
      const id = uuid(conversationId, "会话");
      await membership(db, id, me);
      const { data } = await db
        .from("dm_conversation_settings")
        .select("pinned,pinned_at,muted,archived,manual_unread,keep_archived,theme,background_path,bubble_color,font_scale")
        .eq("user_id", me).eq("conversation_id", id).maybeSingle();
      return data ?? {
        pinned: false, pinned_at: null, muted: false, archived: false,
        manual_unread: false, keep_archived: false, theme: null,
        background_path: null, bubble_color: null, font_scale: 1,
      };
    }

    // ---- 消息搜索（服务端 RPC，权限过滤、游标分页）----
    if (view === "search") {
      const q = (p.get("q") || "").trim();
      if (q.length < 1 || q.length > 60) throw new ApiError(400, "搜索关键词须为 1-60 字");
      const before = p.get("before");
      const room = p.get("conversation");
      const { data, error } = await db.rpc("dm_search", {
        q,
        room: room ? uuid(room, "会话") : null,
        before: before || null,
        lim: 20,
      });
      if (error) throw new ApiError(503, "搜索失败，请稍后重试");
      return { items: data ?? [] };
    }

    // ---- 媒体资源库 ----
    if (view === "media" && conversationId) {
      const id = uuid(conversationId, "会话");
      await membership(db, id, me);
      const kind = p.get("kind") || "all";
      const before = p.get("before");
      const { data, error } = await db.rpc("dm_media_library", {
        room: id, kind, before: before || null, lim: 30,
      });
      if (error) throw new ApiError(503, "资源库加载失败");
      // 图片/视频按会话签名 URL 生成短期预览（受存储 RLS 约束）。
      const items = data ?? [];
      const signed = new Map<string, string>();
      const mediaRows = items.filter((row: { media_path?: string }) => row.media_path);
      await Promise.all(mediaRows.map(async (row: { id: string; media_path: string }) => {
        const { data: s } = await db.storage.from("heika-chat").createSignedUrl(row.media_path, 900);
        if (s?.signedUrl) signed.set(row.id, s.signedUrl);
      }));
      return { items: items.map((row: { id: string }) => ({ ...row, url: signed.get(row.id) ?? null })) };
    }

    // ---- 陌生人消息请求 ----
    if (view === "requests") {
      const [{ data: received }, { data: sent }] = await Promise.all([
        db.from("dm_requests").select("id,sender_id,recipient_id,body,media_path,safety_flag,status,created_at")
          .eq("recipient_id", me).order("created_at", { ascending: false }).limit(100),
        db.from("dm_requests").select("id,sender_id,recipient_id,body,status,created_at")
          .eq("sender_id", me).order("created_at", { ascending: false }).limit(50),
      ]);
      const peerIds = [...new Set([...(received ?? []).map((r) => r.sender_id), ...(sent ?? []).map((r) => r.recipient_id)])];
      const { data: profiles } = peerIds.length
        ? await db.from("profiles").select("id,nickname,avatar_url").in("id", peerIds)
        : { data: [] };
      const pmap = new Map((profiles ?? []).map((x) => [x.id, x]));
      const withPeer = (rows: Array<Record<string, unknown>>, key: string) =>
        (rows ?? []).map((r) => ({ ...r, peer: pmap.get(String(r[key])) ?? { id: r[key], nickname: "探索者", avatar_url: null } }));
      return {
        received: withPeer(received as Array<Record<string, unknown>>, "sender_id"),
        sent: withPeer(sent as Array<Record<string, unknown>>, "recipient_id"),
        pending_count: (received ?? []).filter((r) => r.status === "pending").length,
      };
    }

    // ---- 消息收藏 ----
    if (view === "favorites") {
      const { data, error } = await db
        .from("dm_favorites")
        .select("message_id,created_at,dm_messages(id,conversation_id,sender_id,body,created_at,message_type,media_path,recalled,dm_conversations(user_a,user_b))")
        .eq("user_id", me).order("created_at", { ascending: false }).limit(100);
      if (error) throw new ApiError(503, "收藏加载失败");
      const items = (data ?? []).map((f: Record<string, unknown>) => {
        const m = f.dm_messages as Record<string, unknown> | null;
        const c = m?.dm_conversations as Record<string, unknown> | null;
        const peerId = c ? (c.user_a === me ? c.user_b : c.user_a) : null;
        return { message_id: f.message_id, favorited_at: f.created_at, message: m ? { ...m, dm_conversations: undefined } : null, peer_id: peerId, unavailable: !m || !!m.recalled };
      });
      return { items };
    }

    // ---- 会话内表情回应聚合 ----
    if (view === "reactions" && conversationId) {
      const id = uuid(conversationId, "会话");
      await membership(db, id, me);
      const { data: msgs } = await db.from("dm_messages").select("id").eq("conversation_id", id).limit(500);
      const ids = (msgs ?? []).map((m) => m.id);
      const { data: rows } = ids.length
        ? await db.from("dm_reactions").select("message_id,user_id,emoji").in("message_id", ids)
        : { data: [] };
      return { items: rows ?? [], mine: me };
    }

    // ---- 私信隐私设置 ----
    if (view === "privacy") {
      const { data } = await db
        .from("browsing_preferences")
        .select("dm_permission,read_receipt,typing_indicator,online_visibility")
        .eq("user_id", me).maybeSingle();
      return data ?? {
        dm_permission: "everyone", read_receipt: true,
        typing_indicator: true, online_visibility: "everyone",
      };
    }

    // ---- 单会话历史（原生客户端契约，保持不变）----
    if (conversationId) {
      const id = uuid(conversationId, "会话");
      await membership(db, id, me);
      const before = p.get("before");
      let query = db
        .from("dm_messages")
        .select("id,conversation_id,sender_id,body,created_at,message_type,media_path,reply_to,edited_at,edit_count,recalled,safety_flag,metadata")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .limit(51);
      if (before) query = query.lt("created_at", before);
      const { data: rows, error } = await query;
      if (error) throw new ApiError(503, "消息加载失败，请稍后重试");
      const all = rows ?? [];
      return { items: all.slice(0, 50).reverse(), has_more: all.length > 50 };
    }

    // ---- 收件箱：会话列表 + 个人设置 + 摘要 ----
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
    const peerIds = [...new Set(list.map((row) => peerOf(row, me)))];
    const [{ data: messages }, { data: reads }, { data: profiles }, { data: awards }, { data: settings }] = await Promise.all([
      db.from("dm_messages").select("conversation_id,sender_id,body,created_at,message_type,safety_flag,recalled")
        .in("conversation_id", ids).order("created_at", { ascending: false }),
      db.from("dm_reads").select("conversation_id,read_at,last_read_message_id").eq("user_id", me).in("conversation_id", ids),
      db.from("profiles").select("id,nickname,avatar_url,bio").in("id", peerIds),
      db.from("user_badge_awards")
        .select("user_id,profile_badge_types!inner(id,label,description,color,active)")
        .in("user_id", peerIds).is("revoked_at", null).eq("profile_badge_types.active", true),
      db.from("dm_conversation_settings")
        .select("conversation_id,pinned,pinned_at,muted,archived,manual_unread,theme,background_path,bubble_color,font_scale")
        .eq("user_id", me).in("conversation_id", ids),
    ]);

    const readAt = new Map((reads ?? []).map((row) => [row.conversation_id, row.read_at as string]));
    const lastMessage = new Map<string, { body: string; created_at: string; message_type?: string; safety_flag?: string }>();
    const unread = new Map<string, number>();
    for (const message of messages ?? []) {
      if (!lastMessage.has(message.conversation_id)) {
        lastMessage.set(message.conversation_id, { body: message.body, created_at: message.created_at, message_type: message.message_type, safety_flag: message.safety_flag });
      }
      if (message.sender_id === me) continue;
      const seen = readAt.get(message.conversation_id);
      if (!seen || new Date(message.created_at) > new Date(seen)) {
        unread.set(message.conversation_id, (unread.get(message.conversation_id) ?? 0) + 1);
      }
    }

    const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
    const badgesByUser = new Map<string, Array<{ id: string; label: string; description: string; color: string }>>();
    for (const award of awards ?? []) {
      const badge = Array.isArray(award.profile_badge_types) ? award.profile_badge_types[0] : award.profile_badge_types;
      if (!badge || !badge.active) continue;
      const items = badgesByUser.get(award.user_id) || [];
      items.push({ id: badge.id, label: badge.label, description: badge.description, color: badge.color });
      badgesByUser.set(award.user_id, items);
    }
    const settingsByRoom = new Map((settings ?? []).map((s) => [s.conversation_id, s]));
    const items = list
      .filter((row) => !(settingsByRoom.get(row.id)?.archived)) // 归档会话不进普通列表
      .map((row) => {
        const peerId = peerOf(row, me);
        const peer = profileById.get(peerId);
        const last = lastMessage.get(row.id);
        const st = settingsByRoom.get(row.id);
        return {
          conversation_id: row.id,
          peer: {
            id: peerId,
            nickname: peer?.nickname || "探索者",
            avatar_url: peer?.avatar_url ?? null,
            bio: peer?.bio ?? "",
            badges: badgesByUser.get(peerId) || [],
          },
          latest_body: last?.body ?? "",
          latest_type: last?.message_type ?? "text",
          latest_safety: last?.safety_flag ?? null,
          unread: unread.get(row.id) ?? 0,
          created_at: last?.created_at ?? row.created_at,
          pinned: st?.pinned ?? false,
          pinned_at: st?.pinned_at ?? null,
          muted: st?.muted ?? false,
          manual_unread: st?.manual_unread ?? false,
          theme: st?.theme ?? null,
        };
      })
      // 置顶优先（置顶内按最后消息时间倒序），其余按最后消息时间倒序。
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.pinned && a.pinned_at && b.pinned_at) return a.pinned_at < b.pinned_at ? 1 : -1;
        return a.created_at < b.created_at ? 1 : -1;
      });

    return { items };
  });
}

/**
 * POST /api/v1/messages
 * 兼容旧 action: open / send / recall / delete / read
 * 新增 action: send2 / edit / react / favorite / forward / settings /
 *   mark_unread / request_send / request_accept / request_update / privacy
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    await requireFeature("dm");
    const { user } = await context(req);
    await requireAbility(user!.id, "dm");
    const me = user!.id;
    const body = await jsonBody(req);
    const action = String(body.action ?? "");
    const db = adminClient();

    if (action === "open") {
      const peer = uuid(body.peer, "用户");
      if (peer === me) throw new ApiError(400, "不能和自己发起私聊");
      const [userA, userB] = orderedPair(me, peer);
      const { data: existing } = await db.from("dm_conversations").select("id")
        .eq("user_a", userA).eq("user_b", userB).limit(1).maybeSingle();
      if (existing?.id) return { conversation_id: existing.id };
      const { data: created, error } = await db.from("dm_conversations")
        .insert({ user_a: userA, user_b: userB }).select("id").single();
      if (error || !created) throw new ApiError(503, "会话创建失败，请稍后重试");
      return { conversation_id: created.id };
    }

    // 会话级 action 需要先校验归属。
    const needsRoom = ["send", "send2", "recall", "delete", "edit", "forward", "settings",
      "mark_unread", "react", "favorite", "read", "report_message"].includes(action);
    let conversation: Conversation | null = null;
    if (needsRoom) conversation = await membership(db, uuid(body.conversation, "会话"), me);

    // ---- 发送（旧契约：忽略 nonce，仅服务端生成 id）----
    if (action === "send") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 2000) throw new ApiError(400, "消息内容须为 1-2000 字");
      const nonce = typeof body.nonce === "string" && /^[0-9a-f-]{36}$/i.test(body.nonce) ? body.nonce : crypto.randomUUID();
      const { data: row, error } = await db.rpc("dm_send_v2", {
        room: conversation!.id, content, nonce: crypto.randomUUID(), reply: null,
        kind: "text", meta: {},
      });
      if (error) throw new ApiError(400, error.message || "消息发送失败");
      // nonce 仅为客户端幂等提示，正式消息 id 由服务端确定；回传 nonce 供客户端替换乐观气泡。
      await db.rpc("dm_mark_read_v2", { room: conversation!.id, last_message: null });
      return { ...row, client_nonce: nonce };
    }

    // ---- 发送 v2：幂等 + 引用 + 内容类型 ----
    if (action === "send2") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      const kind = ["text", "image", "video", "file", "work", "collection", "ai_resource", "profile", "profile_share", "collection_share"].includes(String(body.kind)) ? String(body.kind) : "text";
      if (kind === "text" && (!content || content.length > 2000)) throw new ApiError(400, "消息内容须为 1-2000 字");
      const nonce = uuid(body.nonce ?? crypto.randomUUID(), "客户端消息标识");
      const reply = body.reply ? uuid(body.reply, "引用消息") : null;
      const meta = body.meta && typeof body.meta === "object" ? body.meta : {};
      const { data: row, error } = await db.rpc("dm_send_v2", {
        room: conversation!.id, content: content || (kind === "text" ? "" : " "),
        nonce, reply, kind, meta,
      });
      if (error) throw new ApiError(400, error.message || "消息发送失败");
      await db.rpc("dm_mark_read_v2", { room: conversation!.id, last_message: null });
      return row;
    }

    // ---- 编辑 ----
    if (action === "edit") {
      const messageId = uuid(body.message, "消息");
      const content = typeof body.content === "string" ? body.content.trim() : "";
      const expectVersion = typeof body.version === "number" ? body.version : null;
      const { data, error } = await db.rpc("dm_edit_v2", { message_id: messageId, content, expect_version: expectVersion });
      if (error) throw new ApiError(400, error.message || "编辑失败");
      return data;
    }

    // ---- 撤回（旧 delete 别名）——软撤回，双方同步 ----
    if (action === "recall" || action === "delete") {
      const messageId = uuid(body.message, "消息");
      const { data: message } = await db.from("dm_messages")
        .select("id,conversation_id,sender_id,created_at").eq("id", messageId).maybeSingle();
      if (!message || message.conversation_id !== conversation!.id) throw new ApiError(404, "消息不存在");
      if (message.sender_id !== me) throw new ApiError(403, "只能撤回自己发送的消息");
      const age = Date.now() - new Date(message.created_at as string).getTime();
      if (age > RECALL_WINDOW_MS + RECALL_GRACE_MS) throw new ApiError(403, "超过 3 分钟，这条消息已经无法撤回");
      const { data, error } = await db.rpc("dm_recall_v2", { message_id: messageId });
      if (error) throw new ApiError(400, error.message || "撤回失败");
      return { recalled: messageId, deleted: messageId, window_seconds: RECALL_WINDOW_MS / 1000, ...(data ?? {}) };
    }

    // ---- 表情回应 ----
    if (action === "react") {
      const messageId = uuid(body.message, "消息");
      const emoji = String(body.emoji ?? "");
      const { data, error } = await db.rpc("dm_react", { message_id: messageId, emoji });
      if (error) throw new ApiError(400, error.message || "回应失败");
      return data;
    }

    // ---- 收藏 ----
    if (action === "favorite") {
      const messageId = uuid(body.message, "消息");
      const { data, error } = await db.rpc("dm_favorite_toggle", { message_id: messageId });
      if (error) throw new ApiError(400, error.message || "收藏失败");
      return data;
    }

    // ---- 转发 ----
    if (action === "forward") {
      const source = uuid(body.message, "原消息");
      const nonce = uuid(body.nonce ?? crypto.randomUUID(), "客户端消息标识");
      const { data, error } = await db.rpc("dm_forward", {
        source_message: source, to_room: conversation!.id, nonce,
      });
      if (error) throw new ApiError(400, error.message || "转发失败");
      return data;
    }

    // ---- 会话设置（置顶/免打扰/归档/标记未读/主题）----
    if (action === "settings") {
      const { data, error } = await db.rpc("dm_settings_upsert", {
        room: conversation!.id,
        p_pinned: typeof body.pinned === "boolean" ? body.pinned : null,
        p_muted: typeof body.muted === "boolean" ? body.muted : null,
        p_archived: typeof body.archived === "boolean" ? body.archived : null,
        p_manual_unread: typeof body.manual_unread === "boolean" ? body.manual_unread : null,
        p_keep_archived: typeof body.keep_archived === "boolean" ? body.keep_archived : null,
        p_theme: typeof body.theme === "string" ? body.theme : null,
        p_background_path: typeof body.background_path === "string" ? body.background_path : null,
        p_bubble_color: typeof body.bubble_color === "string" ? body.bubble_color : null,
        p_font_scale: typeof body.font_scale === "number" ? body.font_scale : null,
      });
      if (error) throw new ApiError(400, error.message || "设置失败");
      return data;
    }

    // ---- 标记未读（个人状态，独立于真实游标）----
    if (action === "mark_unread") {
      const { data, error } = await db.rpc("dm_settings_upsert", {
        room: conversation!.id, p_manual_unread: body.unread !== false,
      });
      if (error) throw new ApiError(400, error.message || "标记失败");
      return { manual_unread: data.manual_unread };
    }

    // ---- 标记已读（真实游标，单调推进）----
    if (action === "read") {
      const lastMessage = body.last_message ? uuid(body.last_message, "消息") : null;
      const { error } = await db.rpc("dm_mark_read_v2", { room: conversation!.id, last_message: lastMessage });
      if (error) throw new ApiError(400, error.message || "标记已读失败");
      await db.from("dm_conversation_settings").update({ manual_unread: false })
        .eq("user_id", me).eq("conversation_id", conversation!.id);
      return { read: true };
    }

    // ---- 陌生人消息请求 ----
    if (action === "request_send") {
      const recipient = uuid(body.peer, "用户");
      const content = typeof body.content === "string" ? body.content.trim() : "";
      const { data, error } = await db.rpc("dm_request_send", {
        recipient, content, image_path: typeof body.image_path === "string" ? body.image_path : null,
      });
      if (error) throw new ApiError(400, error.message || "请求发送失败");
      return data;
    }
    if (action === "request_accept") {
      const requestId = uuid(body.request, "消息请求");
      const { data, error } = await db.rpc("dm_accept_request", { request_id: requestId });
      if (error) throw new ApiError(400, error.message || "接受失败");
      return { conversation_id: data };
    }
    if (action === "request_update") {
      const requestId = uuid(body.request, "消息请求");
      const status = String(body.status ?? "ignored");
      const { error } = await db.rpc("dm_request_update", { request_id: requestId, status });
      if (error) throw new ApiError(400, error.message || "操作失败");
      return { updated: true };
    }

    // ---- 举报具体私信消息（保留必要上下文，走既有 dm_reports 管理流程）----
    if (action === "report_message") {
      const messageId = uuid(body.message, "消息");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length < 3 || reason.length > 500) throw new ApiError(400, "举报原因须为 3-500 字");
      const { data: target } = await db
        .from("dm_messages")
        .select("id,conversation_id,sender_id")
        .eq("id", messageId).maybeSingle();
      if (!target || target.conversation_id !== conversation!.id) throw new ApiError(404, "消息不存在");
      const { error } = await db.from("dm_reports").insert({
        reporter_id: me,
        user_id: target.sender_id === me ? null : target.sender_id,
        message_id: messageId,
        reason,
      });
      if (error) throw new ApiError(503, "举报提交失败，请稍后重试");
      return { submitted: true };
    }

    // ---- 私信隐私设置 ----
    if (action === "privacy") {
      const patch: Record<string, unknown> = {};
      if (["everyone", "mutual", "nobody"].includes(String(body.dm_permission))) patch.dm_permission = String(body.dm_permission);
      if (typeof body.read_receipt === "boolean") patch.read_receipt = body.read_receipt;
      if (typeof body.typing_indicator === "boolean") patch.typing_indicator = body.typing_indicator;
      if (["everyone", "following", "nobody"].includes(String(body.online_visibility))) patch.online_visibility = String(body.online_visibility);
      if (!Object.keys(patch).length) throw new ApiError(400, "没有可更新的设置");
      const { error } = await db.from("browsing_preferences").upsert({ user_id: me, ...patch }, { onConflict: "user_id" });
      if (error) throw new ApiError(503, "设置保存失败");
      return { saved: true, ...patch };
    }

    throw new ApiError(400, "未知的私信操作");
  });
}
