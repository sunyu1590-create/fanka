"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { browserDb } from "@/lib/browser-db";

/**
 * APP 内嵌网页的登录门。
 *
 * 为什么不在容器里静默复用 APP 的会话：APP 与 WebView 会共用同一个 refresh_token，
 * Supabase 的令牌轮换让两边互相作废——APP 刷新一次，网页这份就失效，
 * 于是每次打开都像没登录。这里改成「网页自己登录一次」，会话由 WebView 自己保管，
 * 与 APP 完全隔离，不会再被对方踢掉。
 *
 * 登录成功后原地 reload：URL 上的 mine=/decor= 等参数不变，
 * 页面会按正常已登录流程直接进入用户刚才要用的功能。
 */
export default function AppLoginGate({ title = "登录后继续" }: { title?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!email.trim() || !password) throw new Error("请填写邮箱与密码");
      const db = await browserDb();
      const { error: signInError } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        const message = /invalid/i.test(signInError.message) ? "邮箱或密码不正确" : signInError.message;
        throw new Error(message);
      }
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请稍后重试");
      setBusy(false);
    }
  };

  const field: CSSProperties = {
    width: "100%",
    height: 44,
    padding: "0 13px",
    borderRadius: 11,
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink)",
    fontSize: 14,
    outline: "none",
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "28px 20px",
        background: "var(--bg)",
        color: "var(--ink)",
      }}
    >
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, letterSpacing: ".14em", color: "var(--primary)" }}>HEIKA</span>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: ".01em" }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7, color: "var(--muted)" }}>
            这个功能在网页里运行，需要单独登录一次。登录状态会保留在这台设备上，之后直接进入。
          </p>
        </div>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="邮箱"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={field}
          disabled={busy}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={field}
          disabled={busy}
        />
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#e0603f" }}>{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            height: 46,
            marginTop: 2,
            borderRadius: 12,
            border: "1px solid transparent",
            background: "var(--primary)",
            color: "#1a1408",
            fontSize: 14.5,
            fontWeight: 600,
            letterSpacing: ".02em",
            opacity: busy ? 0.62 : 1,
          }}
        >
          {busy ? "正在登录…" : "登录"}
        </button>
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: "var(--muted)" }}>
          账号与 APP 相同。忘记密码请回到 APP 的登录页找回。
        </p>
      </form>
    </main>
  );
}
