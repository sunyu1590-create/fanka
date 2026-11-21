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
 * APP 内嵌打开时，把原生已登录的会话接进网页。
 *
 * 只做一件事：网页本地还没有会话、而容器提供了同一个账号的会话时，
 * 用它调用 supabase 的 setSession。令牌不经过 URL，也不进页面源码；
 * 桥接不可用或失败时，网页保持自己的登录流程，不会因此报错。
 *
 * 网页历史会话属于其他账号时，切换为 APP 当前账号（4.1 账号一致性），
 * 避免装扮等账号数据串号。同时安装「APP 已应用」回执钩子（4.3）。
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
        if (cancelled) return;
        const raw = bridge.session?.();
        if (!raw) return;
        const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
        if (!parsed.access_token || !parsed.refresh_token) return;
        const nativeUser = tokenSub(parsed.access_token);
        const webUser = data.session?.user?.id ?? null;
        // 同一账号且网页已有会话：无需处理。
        if (data.session && nativeUser && webUser && nativeUser === webUser) return;
        // 无会话，或历史会话属于其他账号：统一为 APP 当前账号。
        const { error } = await db.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        if (!error && !cancelled) window.location.reload();
      } catch {
        /* 桥接失败不影响网页自身的登录与浏览 */
      }
    })();
    return () => {
      cancelled = true;
      cleanupHook();
    };
  }, []);

  return null;
}
