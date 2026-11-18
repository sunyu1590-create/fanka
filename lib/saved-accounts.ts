import type { Session, SupabaseClient } from "@supabase/supabase-js";

/**
 * 本机账号列表：只保存会话令牌，不保存密码。
 * 令牌在切换时用于恢复登录态；失效则提示重新用密码登录。
 */
const KEY = "heika:saved-accounts";
const LIMIT = 5;

export type SavedAccount = {
  id: string;
  email: string;
  nickname?: string;
  avatar?: string;
  access_token: string;
  refresh_token: string;
  savedAt: number;
};

export function readSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedAccount[]) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((item) => item && typeof item.id === "string" && typeof item.refresh_token === "string");
  } catch {
    return [];
  }
}

function write(list: SavedAccount[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    /* 隐私模式下可能写不进去，切换功能退化为不可用，不影响其它功能 */
  }
}

export function rememberSession(session: Session | null) {
  if (!session?.user) return;
  const user = session.user;
  const metadata = (user.user_metadata || {}) as { nickname?: string; avatar?: string; avatar_url?: string };
  const next: SavedAccount = {
    id: user.id,
    email: user.email || "",
    nickname: metadata.nickname || "",
    avatar: metadata.avatar || metadata.avatar_url || "",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    savedAt: Date.now(),
  };
  const list = readSavedAccounts().filter((item) => item.id !== user.id);
  write([next, ...list]);
}

export function forgetAccount(id: string) {
  write(readSavedAccounts().filter((item) => item.id !== id));
}

export async function switchAccount(db: SupabaseClient, id: string) {
  const target = readSavedAccounts().find((item) => item.id === id);
  if (!target) throw new Error("本地没有这个账号，请用密码重新登录一次");
  const { error } = await db.auth.setSession({ access_token: target.access_token, refresh_token: target.refresh_token });
  if (error) throw new Error("该账号的登录状态已过期，请用密码重新登录");
}
