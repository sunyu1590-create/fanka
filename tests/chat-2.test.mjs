import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const migration = read("supabase/migrations/20261127160000_chat_2.sql");
const queries = read("supabase/migrations/20261127161000_chat_2_queries.sql");
const route = read("app/api/v1/messages/route.ts");
const chatApi = read("lib/chat-api.ts");
const messagesUi = read("components/Messages.tsx");
const panels = read("components/ChatPanels.tsx");
const chatCss = read("app/chat2.css");
const androidVm = read("android-native/app/src/main/java/com/heika/nativeapp/feature/messages/MessagesViewModel.kt");

test("database schema adds all Chat 2.0 message fields", () => {
  for (const field of ["message_type", "client_nonce", "reply_to", "edited_at", "edit_count", "recalled", "safety_flag", "seq", "metadata"]) {
    assert.match(migration, new RegExp(field), `missing message field: ${field}`);
  }
  assert.match(migration, /dm_conversation_settings/);
  assert.match(migration, /dm_reactions/);
  assert.match(migration, /dm_favorites/);
  assert.match(migration, /dm_requests/);
});

test("contact detection is non-blocking rule-based and covers required channels", () => {
  assert.match(migration, /dm_detect_contact/);
  for (const ch of ["qq", "wechat", "email", "phone", "social_link"]) {
    assert.match(migration, new RegExp(`'${ch}'`), `missing detection channel: ${ch}`);
  }
  // 安全提醒非阻断：不得拦截/打码/修改正文——触发函数只返回标签。
  assert.match(migration, /returns text language plpgsql immutable/);
});

test("all required server RPCs exist and are granted to authenticated", () => {
  for (const fn of ["dm_send_v2", "dm_edit_v2", "dm_recall_v2", "dm_mark_read_v2", "dm_settings_upsert", "dm_search", "dm_media_library", "dm_forward", "dm_react", "dm_favorite_toggle", "dm_request_send", "dm_accept_request", "dm_request_update"]) {
    assert.match(migration + queries, new RegExp(`function public\\.${fn}\\b`), `missing RPC: ${fn}`);
  }
  assert.match(queries, /grant execute on function[\s\S]*to authenticated/);
});

test("REST API exposes every Chat 2.0 action while keeping legacy contract", () => {
  for (const action of ["open", "send", "send2", "edit", "recall", "delete", "react", "favorite", "forward", "settings", "mark_unread", "read", "request_send", "request_accept", "request_update", "privacy"]) {
    assert.match(route, new RegExp(`action === "${action}"`), `missing action: ${action}`);
  }
  for (const view of ["settings", "search", "media", "requests", "favorites", "reactions", "privacy"]) {
    assert.match(route, new RegExp(`view === "${view}"`), `missing view: ${view}`);
  }
});

test("web UI wires all Chat 2.0 panels and safety notice", () => {
  for (const panel of ["ChatSettingsPanel", "ChatSearchPanel", "ChatMediaPanel", "ChatRequestsPanel", "ChatPrivacyPanel"]) {
    assert.match(messagesUi, new RegExp(panel), `web UI missing panel: ${panel}`);
  }
  assert.match(messagesUi, /chatApi\.send\(/);
  assert.match(messagesUi, /chatApi\.edit\(/);
  assert.match(messagesUi, /safety_flag/);
  assert.match(chatApi, /安全提醒：谨慎进行站外联系/);
  assert.match(panels, /SAFETY_NOTICE/);
  assert.match(chatApi, /QUICK_REACTIONS/);
});

test("send retries reuse the client nonce for idempotency", () => {
  assert.match(messagesUi, /retry\?\.id \?\? crypto\.randomUUID\(\)/);
  assert.match(route, /nonce/);
  assert.match(migration, /unique index if not exists dm_messages_nonce/);
});

test("android native chat integrates Chat 2.0 actions", () => {
  assert.match(androidVm, /react|favorite|pin|mute|archive|forward|edit/i);
});

test("privacy rules: personal settings never leak to peer, archived hidden from inbox", () => {
  assert.match(migration, /pinned bool|pinned boolean/);
  assert.match(migration, /manual_unread/);
  assert.match(route, /settingsByRoom\.get\(row\.id\)\?\.archived/);
});

// 回归：/api/v1/messages 只认 Bearer 令牌，客户端漏带会全量 401，
// 而 UI 普遍 .catch() 兜底，表现为"按钮点了没反应"，静态断言必须守住这一点。
test("chat client always attaches the session bearer token", () => {
  assert.match(chatApi, /Authorization: `Bearer \$\{data\.session\.access_token\}`/);
  assert.match(chatApi, /await db\.auth\.getSession\(\)/);
});

// 回归：聊天面板若留在页面树里会被 .chat-screen 的层叠上下文整片盖住。
test("chat panels render through a portal so the chat window cannot cover them", () => {
  assert.match(panels, /createPortal/);
  assert.match(panels, /document\.body/);
  // 必须高于 .chat-screen(60/80) 与 .bottom-nav(200)。
  assert.match(chatCss, /\.chat-panel-backdrop\{[^}]*z-index:400/);
});

// 回归：消息操作面板曾被 .settings-list button 的 54px 整行规则命中，被撑成超长列表。
test("message action sheet uses its own compact grid instead of settings-list", () => {
  assert.match(panels, /msg-action-grid/);
  assert.match(panels, /msg-react-row/);
  const sheet = panels.slice(panels.indexOf("MessageActionSheet"));
  assert.doesNotMatch(sheet.slice(0, 2000), /settings-list/);
});
