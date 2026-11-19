"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, RefreshCw, TicketCheck } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type Badge = { id: string; label: string; description?: string; color?: string; awardedAt?: string };

export default function CertificationSettings() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await cloudRequest("/api/v1/me/access-codes") as { badges?: Badge[] } | null;
      setBadges(result?.badges || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "认证信息读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const redeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await cloudRequest("/api/v1/me/access-codes/redeem", { code: code.trim() }) as { badge?: { label?: string } } | null;
      setCode("");
      setMessage(`已获得「${result?.badge?.label || "认证"}」标识。`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "认证码兑换失败");
    } finally {
      setBusy(false);
    }
  };

  return <section className="certification-settings">
    <header><div><h2>兑换认证码</h2><p>输入管理员发放的认证码，兑换后认证标识会显示在你的公开主页和私信资料旁。</p></div><button type="button" className="soft-button" onClick={() => void load()} disabled={loading} aria-label="刷新认证信息"><RefreshCw size={15}/></button></header>
    {error && <p className="moderation-feedback error" role="alert">{error}</p>}
    {message && <p className="moderation-feedback" role="status">{message}</p>}
    <form onSubmit={(event) => void redeem(event)}><label htmlFor="certification-code">认证码</label><div><input id="certification-code" value={code} maxLength={24} autoComplete="off" onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="HEIKA-XXXX-XXXX-XXXX"/><button type="submit" disabled={busy || !code.trim()}><TicketCheck size={16}/>{busy ? "兑换中…" : "兑换认证"}</button></div></form>
    <section><h3>我的认证标识</h3>{loading ? <p>正在读取认证信息…</p> : badges.length ? <ul>{badges.map((badge) => <li key={badge.id}><BadgeCheck size={16} style={{ color: badge.color || "#78613B" }}/><span><strong>{badge.label}</strong>{badge.description && <small>{badge.description}</small>}</span></li>)}</ul> : <p>暂时没有认证标识。获得认证码后可在这里兑换。</p>}</section>
  </section>;
}
