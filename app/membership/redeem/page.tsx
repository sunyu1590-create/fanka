"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock3, ShieldCheck, TicketCheck } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import { cloudRequest } from "@/lib/cloud";

type Preview = { status: string; previewToken?: string; tier?: "plus" | "pro"; planName?: string; dailyFlipAllowance?: number; durationDays?: number; expiresAt?: string | null };
type Redemption = { status: string; tier?: "free" | "plus" | "pro"; redeemedTier?: "plus" | "pro"; activationState?: "active" | "queued"; startsAt?: string | null; expiresAt?: string | null; dailyFlipAllowance?: number; pendingTier?: string | null };
const tierLabel = (tier?: string) => tier === "pro" ? "Pro" : tier === "plus" ? "Plus" : "Free";
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "—";
const statusMessage: Record<string, string> = {
  invalid: "激活码无效，请检查后重试。", not_found: "没有找到这个激活码，请确认输入内容。", already_redeemed: "这个激活码已经兑换。", disabled: "这个激活码当前不可用。", expired: "这个激活码已过期。", preview_expired: "验证已过期，请重新验证激活码。", permanent_membership: "当前账号拥有长期会员权益，无法叠加兑换。",
};

export default function MembershipRedeemPage() {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [success, setSuccess] = useState<Redemption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void browserDb().then(async (db) => {
      const { data } = await db.auth.getSession();
      if (active) { setAccountId(data.session?.user.id || null); setAuthLoading(false); }
    }).catch(() => { if (active) { setAccountId(null); setAuthLoading(false); } });
    return () => { active = false; };
  }, []);

  const validate = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountId) { setError("请先登录黑卡账号，再兑换会员激活码。"); return; }
    setBusy(true); setError(""); setPreview(null); setSuccess(null);
    try {
      const result = await cloudRequest("/api/v1/membership/redeem/preview", { code }) as Preview | null;
      if (!result) throw new Error("登录状态已失效，请重新登录。");
      if (result.status !== "valid") { setError(statusMessage[result.status] || "激活码暂时无法使用，请联系黑卡支持。"); return; }
      setPreview(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "验证失败，请稍后重试。"); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!preview?.previewToken || busy) return;
    setBusy(true); setError("");
    try {
      const result = await cloudRequest("/api/v1/membership/redeem/confirm", { previewToken: preview.previewToken }) as Redemption | null;
      if (!result) throw new Error("登录状态已失效，请重新登录。");
      if (result.status !== "redeemed") { setPreview(null); setError(statusMessage[result.status || ""] || "兑换没有完成，请重新验证激活码。"); return; }
      setSuccess(result); setPreview(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "兑换失败，请稍后重试。"); }
    finally { setBusy(false); }
  };

  return <main className="page membership-redeem-page">
    <Link href="/membership" className="membership-route-back"><ArrowLeft size={17}/>会员与支持</Link>
    <header className="membership-redeem-heading"><span>HEIKA / MEMBERSHIP</span><div className="membership-redeem-icon"><TicketCheck size={24}/></div><h1>{success ? "会员已激活" : "兑换会员激活码"}</h1><p>{success ? "会员权益已写入你的黑卡账号。" : "输入从爱发电或官方活动获得的激活码。"}</p></header>

    {success ? <section className="membership-redeem-success" aria-live="polite">
      <div className="membership-success-mark"><Check size={28}/></div><span className="membership-success-eyebrow">ACTIVATION COMPLETE</span>
      <h2>{tierLabel(success.redeemedTier || success.tier)} 会员</h2>
      <p>{success.activationState === "queued" ? "当前 Pro 会员到期后自动生效" : "会员权益现已生效"}</p>
      <div className="membership-success-details"><div><span>生效日期</span><strong>{dateLabel(success.startsAt)}</strong></div><div><span>到期日期</span><strong>{dateLabel(success.expiresAt)}</strong></div><div><span>每日翻卡</span><strong>{success.dailyFlipAllowance || "—"} 次</strong></div></div>
      <button type="button" className="membership-submit" onClick={() => router.push("/membership")}>返回会员中心 <ArrowRight size={17}/></button>
    </section> : <>
      {authLoading ? <div className="membership-auth-state">正在确认登录状态…</div> : !accountId ? <section className="membership-login-required"><ShieldCheck size={22}/><strong>登录后兑换</strong><p>会员激活码会绑定到当前黑卡账号。请先返回黑卡完成登录，再继续兑换。</p><Link href="/">返回黑卡 <ArrowRight size={15}/></Link></section> : <>
        <form className="membership-code-form" onSubmit={(event) => void validate(event)}>
          <label htmlFor="membership-code">会员激活码</label>
          <input id="membership-code" name="code" autoComplete="off" spellCheck={false} maxLength={22} value={code} onChange={(event) => { setCode(event.target.value.toUpperCase().replace(/\s/g, "")); setPreview(null); setError(""); }} onPaste={(event) => { event.preventDefault(); setCode(event.clipboardData.getData("text").trim().toUpperCase().replace(/\s/g, "")); }} placeholder="HEIKA-XXXX-XXXX-XXXX" aria-describedby="membership-code-hint" />
          <small id="membership-code-hint">字母和数字不区分大小写，可直接粘贴完整卡密。</small>
          <button className="membership-submit" disabled={busy || code.trim().length < 5}>{busy ? "正在验证…" : "验证激活码"}<ArrowRight size={17}/></button>
        </form>
        {error && <p className="membership-redeem-error" role="alert">{error}</p>}
        {preview && <section className="membership-redeem-preview" aria-live="polite"><span>权益确认</span><h2>{preview.planName || tierLabel(preview.tier)}</h2><div><span>每日翻卡</span><strong>{preview.dailyFlipAllowance} 次</strong></div><div><span>有效期</span><strong>{preview.durationDays} 天</strong></div><p><Clock3 size={14}/>预览不会占用卡密；确认后将为当前账号激活。</p><button type="button" className="membership-submit" onClick={() => void confirm()} disabled={busy}>{busy ? "正在兑换…" : "确认兑换"}<Check size={17}/></button><button type="button" className="membership-cancel" onClick={() => setPreview(null)} disabled={busy}>返回修改</button></section>}
      </>}
      <section className="membership-redeem-help"><h2>还没有激活码？</h2><p>会员支持通过爱发电完成。支付与会员激活由平台订单和激活码流程分别处理。</p><a href="https://afdian.com/a/heikaka" target="_blank" rel="noopener noreferrer">前往爱发电 <ArrowRight size={15}/></a><Link href="/membership/redeem/history">查看兑换历史 <ArrowRight size={15}/></Link></section>
    </>}
    <footer className="membership-redeem-footnote"><ShieldCheck size={15}/>激活码由服务端验证并原子兑换，未登录状态不能兑换。</footer>
  </main>;
}
