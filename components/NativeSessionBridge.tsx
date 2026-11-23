"use client";

import { useEffect } from "react";
import { browserDb } from "@/lib/browser-db";

type NativeBridge = { session?: () => string };

/** 从 JWT 载荷里只取 sub（用户标识），不解析、不保留其他声明。 */
function tokenSub(token: string): string | null {
  try {
    const payload = token.split(".")[1] || "";
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

/**
 * APP 内嵌打开时，只做两件事：
 *
 * 1. 安装「装扮已应用」回执钩子（APP 完成渲染后回调网页）。
 * 2. 校验账号一致性：网页里如果还留着**别的账号**的登录态，清掉。
 *    避免在 A 的容器里编辑 B 的资料。
 *
 * 注意这里**不再**用 APP 的令牌调用 setSession。
 * 原因：APP 与 WebView 共用同一个 refresh_token，Supabase 的令牌轮换会让两边互相作废，
 * 于是每次打开网页都像没登录。登录改由 AppLoginGate 在网页内独立完成，
 * 会话由 WebView 自己保管，与 APP 隔离。
 */
export default function NativeSessionBridge() {
  useEffect(() => {
    const hook = (version?: string) => {
      window.dispatchEvent(new CustomEvent("heika-decor-applied", { detail: version ?? "" }));
    };
    (window as unknown as { __heikaDecorApplied?: typeof hook }).__heikaDecorApplied = hook;
    const cleanupHook = () => {
      delete (window as unknown as { __heikaDecorApplied?: typeof hook }).__heikaDecorApplied;
    };
    const bridge = (window as unknown as { HeikaNative?: NativeBridge }).HeikaNative;
    if (!bridge?.session) return cleanupHook;
    let cancelled = false;
    void (async () => {
      try {
        const db = await browserDb();
        const { data } = await db.auth.getSession();
        // 网页没有会话：交给登录门，不做任何静默注入。
        if (cancelled || !data.session) return;
        const raw = bridge.session?.();
        if (!raw) return;
        const parsed = JSON.parse(raw) as { access_token?: string; user_id?: string };
        const nativeUser = parsed.user_id || (parsed.access_token ? tokenSub(parsed.access_token) : null);
        const webUser = data.session.user?.id ?? null;
        if (!nativeUser || !webUser || nativeUser === webUser) return;
        // 网页里是另一个账号：清掉本地会话，让登录门重新出现，避免串号写入。
        await db.auth.signOut({ scope: "local" });
        if (!cancelled) window.location.reload();
      } catch {
        /* 桥接失败不阻塞网页自身的登录与浏览 */
      }
    })();
    return () => {
      cancelled = true;
      cleanupHook();
    };
  }, []);

  return null;
}
