/**
 * HEIKA Chat 2.0 unified client API.
 * All chat actions go through /api/v1/messages so web and native share one protocol.
 */

import { browserDb } from "./browser-db";

export type ChatSettings = {
  pinned: boolean;
  pinned_at: string | null;
  muted: boolean;
  archived: boolean;
  manual_unread: boolean;
  keep_archived: boolean;
  theme: string | null;
  background_path: string | null;
  bubble_color: string | null;
  font_scale: number;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  message_type?: string;
  media_path?: string | null;
  reply_to?: string | null;
  edited_at?: string | null;
  edit_count?: number;
  recalled?: boolean;
  safety_flag?: string | null;
  metadata?: Record<string, unknown>;
  reactions?: Array<{ message_id: string; user_id: string; emoji: string }>;
};

export const SAFETY_NOTICE = "安全提醒：谨慎进行站外联系，注意保护个人隐私及财产安全。";

export const QUICK_REACTIONS = ["👍", "❤️", "😄", "😮", "😢", "🙏"];

export const CHAT_THEMES: Array<{ id: string; name: string; swatch: string; bubble: string; background: string }> = [
  { id: "graphite", name: "石墨黑", swatch: "#1c1c1e", bubble: "#c9a227", background: "#141416" },
  { id: "paper", name: "纸质白", swatch: "#f2efe9", bubble: "#d9d4cc", background: "#faf8f4" },
  { id: "ocean", name: "深海蓝", swatch: "#12283d", bubble: "#2c4b66", background: "#0d1e2e" },
  { id: "twilight", name: "暮光紫", swatch: "#2a1f38", bubble: "#4a3a5c", background: "#1d1529" },
];

async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // /api/v1/messages 只认 Bearer 令牌（lib/server/api.ts context），不会读 cookie。
  // 这里必须显式带上会话令牌，否则所有聊天写入都会 401，表现为"点了没反应"。
  const db = await browserDb();
  const { data } = await db.auth.getSession();
  if (!data.session) throw new Error("请先登录");
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "请求失败，请稍后重试");
  return (payload?.data ?? payload) as T;
}

function post<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  return request<T>("/api/v1/messages", {
    method: "POST",
    body: JSON.stringify({ action, ...body }),
  });
}

function get<T = unknown>(params: Record<string, string | number | undefined | null>): Promise<T> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  return request<T>(`/api/v1/messages?${search.toString()}`);
}

export const chatApi = {
  settings: (conversation: string) => get<ChatSettings>({ view: "settings", conversation }),
  updateSettings: (conversation: string, patch: Partial<ChatSettings>) =>
    post<ChatSettings>("settings", { conversation, ...patch }),
  markUnread: (conversation: string, unread = true) => post("mark_unread", { conversation, unread }),
  markRead: (conversation: string, last_message?: string) => post("read", { conversation, last_message }),
  search: (q: string, conversation?: string, before?: string) =>
    get<{ items: ChatMessage[] & Array<{ peer_name: string; peer_avatar: string | null }> }>({ view: "search", q, conversation, before }),
  media: (conversation: string, kind = "all", before?: string) =>
    get<{ items: Array<ChatMessage & { url: string | null }> }>({ view: "media", conversation, kind, before }),
  requests: () =>
    get<{ received: Array<Record<string, unknown>>; sent: Array<Record<string, unknown>>; pending_count: number }>({ view: "requests" }),
  favorites: () => get<{ items: Array<Record<string, unknown>> }>({ view: "favorites" }),
  privacy: () => get<Record<string, unknown>>({ view: "privacy" }),
  updatePrivacy: (patch: Record<string, unknown>) => post("privacy", patch),
  send: (conversation: string, content: string, nonce: string, opts?: { reply?: string | null; kind?: string; meta?: Record<string, unknown> }) =>
    post<ChatMessage>("send2", { conversation, content, nonce, reply: opts?.reply ?? null, kind: opts?.kind ?? "text", meta: opts?.meta ?? {} }),
  edit: (conversation: string, message: string, content: string, version?: number) =>
    post<ChatMessage>("edit", { conversation, message, content, version }),
  recall: (conversation: string, message: string) => post("recall", { conversation, message }),
  react: (conversation: string, message: string, emoji: string) =>
    post<{ emoji: string; active: boolean }>("react", { conversation, message, emoji }),
  favorite: (conversation: string, message: string) =>
    post<{ favorite: boolean }>("favorite", { conversation, message }),
  forward: (conversation: string, message: string, nonce: string) =>
    post<ChatMessage>("forward", { conversation, message, nonce }),
  acceptRequest: (request: string) => post<{ conversation_id: string }>("request_accept", { request }),
  updateRequest: (request: string, status: string) => post("request_update", { request, status }),
  sendRequest: (peer: string, content: string) => post("request_send", { peer, content }),
};
