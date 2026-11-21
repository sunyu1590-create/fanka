"use client";

import { useEffect } from "react";
import { browserDb } from "@/lib/browser-db";

type NativeBridge = { session?: () => string };

/**
 * APP 内嵌打开时，把原生已登录的会话接进网页。
 *
 * 只做一件事：网页本地还没有会话、而容器提供了同一个账号的会话时，
 * 用它调用 supabase 的 setSession。令牌不经过 URL，也不进页面源码；
 * 桥接不可用或失败时，网页保持自己的登录流程，不会因此报错。
 */
export default function NativeSessionBridge() {
  useEffect(() => {
    const bridge = (window as unknown as { HeikaNative?: NativeBridge }).HeikaNative;
    if (!bridge?.session) return;
    let cancelled = false;
    void (async () => {
      try {
        const db = await browserDb();
        const { data } = await db.auth.getSession();
        if (cancelled || data.session) return;
        const raw = bridge.session?.();
        if (!raw) return;
        const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
        if (!parsed.access_token || !parsed.refresh_token) return;
        const { error } = await db.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        if (!error && !cancelled) window.location.reload();
      } catch {
        /* 桥接失败不影响网页自身的登录与浏览 */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
