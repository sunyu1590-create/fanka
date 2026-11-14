"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, Check, ChevronDown, Crown, ExternalLink, HeartHandshake, Ticket } from "lucide-react";
import { MEMBERSHIP_PLANS, type MembershipTier } from "@/lib/membership-plans";
import { cloudRequest } from "@/lib/cloud";

const AFDIAN_URL = "https://afdian.com/a/heikaka";
type PlanDto = { tier: MembershipTier; display_name: string; daily_flips: number; duration_days: number | null; support_price_cents: number; currency: string; benefits: string[]; enabled: boolean };
type MembershipData = { tier: MembershipTier; expiresAt: string | null; nextMembership: { tier: MembershipTier; starts_at: string; ends_at: string } | null; dailyAllowance: number; remaining: number; used: number; experience: number; plans: PlanDto[] };
type Preview = { tier: MembershipTier; durationDays: number; currentTier: MembershipTier; effectiveFrom: string; expiresAt: string };

function formatDate(value: string | null | undefined) {
  if (!value) return "未设置到期时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期暂不可用" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function RedeemMembership({ onActivated, onMembershipRefresh, onNotice }: { onActivated: (tier: MembershipTier) => void; onMembershipRefresh: (membership: MembershipData) => void; onNotice: (message: string) => void }) {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [requestId, setRequestId] = useState("");
  const [result, setResult] = useState<{ tier: MembershipTier; expiresAt: string; membershipTier: MembershipTier } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = async () => {
    if (!code.trim()) { setError("请输入会员激活码"); return; }
    setBusy(true); setError(""); setPreview(null); setResult(null);
    try {
      const data = await cloudRequest("/api/v1/membership/redeem", { action: "preview", code }) as Preview | null;
      if (!data) throw new Error("请先登录后兑换会员激活码");
      setPreview(data); setRequestId(crypto.randomUUID());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "激活码验证失败"); }
    finally { setBusy(false); }
  };

  const redeem = async () => {
    if (!preview || !requestId) return;
    setBusy(true); setError("");
    try {
      const data = await cloudRequest("/api/v1/membership/redeem", { action: "redeem", code, requestId }) as { tier: MembershipTier; expiresAt: string; membershipTier: MembershipTier } | null;
      if (!data) throw new Error("请先登录后兑换会员激活码");
      setResult(data); setPreview(null);
      const refreshed = await cloudRequest("/api/v1/membership").catch(() => null) as MembershipData | null;
      if (refreshed) onMembershipRefresh(refreshed);
      onActivated(data.membershipTier);
      onNotice("会员权益已激活，翻卡额度已同步");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "激活码兑换失败，可安全重试"); }
    finally { setBusy(false); }
  };

  return <section className="membership-redeem" id="membership-redeem" aria-labelledby="membership-redeem-title">
    <div className="membership-redeem-heading"><span><Ticket size={19}/></span><div><h3 id="membership-redeem-title">会员激活码</h3><p>已经获得卡密？在这里激活你的探索权益。</p></div></div>
    {result ? <div className="membership-redeem-success" role="status"><Check size={19}/><div><strong>{result.tier.toUpperCase()} 权益已激活</strong><span>账号当前等级：{result.membershipTier.toUpperCase()} · 有效至 {formatDate(result.expiresAt)}</span></div><button type="button" onClick={() => { setResult(null); setCode(""); }}>完成</button></div> : <>
      <label className="membership-code-input"><span className="sr-only">会员激活码</span><input value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setPreview(null); setError(""); }} onPaste={(event) => { event.preventDefault(); setCode(event.clipboardData.getData("text").toUpperCase().trim()); setPreview(null); }} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="HEIKA-XXXX-XXXX-XXXX-XXXX-XXXX" maxLength={40}/></label>
      {error && <p className="membership-redeem-error" role="alert">{error}</p>}
      {preview ? <div className="membership-redeem-confirm" aria-live="polite"><div><strong>{preview.tier.toUpperCase()} · {preview.durationDays} 天</strong><span>权益开始：{formatDate(preview.effectiveFrom)} · 预计到期：{formatDate(preview.expiresAt)}</span><small>兑换后会员等级和每日额度由服务端同步。此操作不能撤回。</small></div><div><button type="button" className="membership-redeem-cancel" onClick={() => { setPreview(null); setRequestId(""); }}>取消</button><button type="button" className="membership-redeem-confirm-button" disabled={busy} onClick={() => void redeem()}>{busy ? "正在兑换…" : "确认兑换"}</button></div></div> : <button type="button" className="membership-redeem-submit" disabled={busy || !code.trim()} onClick={() => void check()}>{busy ? "正在验证…" : "验证激活码"}</button>}
    </>}
    <a href={AFDIAN_URL} target="_blank" rel="noreferrer">还没有激活码？前往爱发电 <ExternalLink size={14}/></a>
  </section>;
}

export default function MembershipCenter({ tier, dailyAllowance, usedFlips, onNotice, onActivated = () => {} }: { tier: MembershipTier; dailyAllowance: number; usedFlips: number; onNotice: (message: string) => void; onActivated?: (tier: MembershipTier) => void }) {
  const [membership, setMembership] = useState<MembershipData | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<MembershipTier>(tier);
  const [supportInfoOpen, setSupportInfoOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void cloudRequest("/api/v1/membership").then((data) => {
      if (!active || !data) return;
      setMembership(data as MembershipData); setSelectedPlan((data as MembershipData).tier); setLoadError(false);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);

  const activeTier = membership?.tier || tier;
  const plans = useMemo(() => {
    if (membership?.plans.length) return membership.plans.filter((plan) => plan.enabled).map((plan) => ({ id: plan.tier, title: plan.display_name, quota: plan.daily_flips, price: plan.tier === "free" ? "免费" : `¥${(plan.support_price_cents / 100).toFixed(plan.support_price_cents % 100 ? 2 : 0)} / ${plan.duration_days || 30} 天`, benefits: plan.benefits }));
    return MEMBERSHIP_PLANS.map((plan) => ({ id: plan.id, title: plan.name, quota: plan.dailyFlips, price: plan.id === "free" ? "免费" : "方案配置暂不可用", benefits: plan.id === "free" ? ["每日 5 次基础翻卡", "基础内容浏览与社区互动"] : ["基础翻卡额度", "保留现有浏览、收藏与社区功能", "支持独立开发者"] }));
  }, [membership]);
  const selected = plans.find((plan) => plan.id === selectedPlan) || plans.find((plan) => plan.id === activeTier) || plans[0];
  const allowance = membership?.dailyAllowance ?? dailyAllowance;
  const used = Math.min(membership?.used ?? usedFlips, allowance);
  const remaining = membership?.remaining ?? Math.max(0, allowance - used);

  return <div className={`membership-center-page membership-tier-${activeTier}`}>
    <header className="membership-header-compact"><div><span>HEIKA · MEMBERSHIP</span><h2>会员与支持</h2><p>探索未知，发现更多。</p></div><Crown size={19}/></header>

    <section className="membership-current" aria-label="当前会员状态">
      <div className="membership-current-top"><div><small>当前会员身份</small><strong>{activeTier.toUpperCase()}</strong></div><span className={`membership-status membership-status-${activeTier}`}>{activeTier === "free" ? "Free 持续可用" : membership?.expiresAt ? `有效至 ${formatDate(membership.expiresAt)}` : "当前有效"}</span></div>
      <div className="membership-current-metrics"><div><small>每日基础额度</small><strong>{membership?.plans.find((plan) => plan.tier === activeTier)?.daily_flips ?? MEMBERSHIP_PLANS.find((plan) => plan.id === activeTier)?.dailyFlips ?? 5} 次</strong></div><div><small>今日剩余</small><strong>{remaining} 次</strong></div><div><small>经验值</small><strong>{membership?.experience ?? 0} EXP</strong></div></div>
      {allowance > 0 && <div className="membership-current-progress" role="progressbar" aria-label="今日翻卡进度" aria-valuemin={0} aria-valuemax={allowance} aria-valuenow={used}><i style={{ width: `${Math.min(100, used / allowance * 100)}%` }}/></div>}
      {membership?.nextMembership && <p className="membership-next-period">后续 {membership.nextMembership.tier.toUpperCase()} 权益将于 {formatDate(membership.nextMembership.starts_at)} 生效。</p>}
      {loadError && <p className="membership-data-note">会员状态暂时无法刷新，当前额度仍由服务端翻卡校验。</p>}
    </section>

    <section className="membership-plan-section" aria-labelledby="membership-plan-title">
      <div className="membership-section-heading"><div><h3 id="membership-plan-title">探索会员方案</h3><p>会员方案仅供预览，暂未开放在线订阅；不会创建订单、发起支付或更改账号等级。</p></div></div>
      <div className="membership-plan-grid" role="group" aria-label="会员方案预览">
        {plans.map((plan) => <button type="button" key={plan.id} className={`membership-plan-card is-${plan.id}${selectedPlan === plan.id ? " selected" : ""}`} aria-pressed={selectedPlan === plan.id} onClick={() => setSelectedPlan(plan.id)}>
          <span className="membership-plan-name">{plan.title}{activeTier === plan.id && <small>当前</small>}</span><strong>{plan.quota}<small> 次 / 日</small></strong><span className="membership-plan-price">{plan.price}</span>{selectedPlan === plan.id && <Check className="membership-plan-selected-icon" size={16} aria-hidden="true"/>}
        </button>)}
      </div>
      {selected && <div className="membership-selected-detail" aria-live="polite"><div><strong>{selected.title} 权益说明</strong><span>{selected.quota} 次基础翻卡 / 日 · 幸运奖励另行计算</span></div><ul>{selected.benefits.map((benefit, index) => <li key={`${selected.id}-${index}`}>{benefit}</li>)}</ul><small>会员等级与经验等级相互独立。当前档位仅供预览，不会触发支付。</small></div>}
    </section>

    <section className="membership-support-section" id="heika-support">
      <h3>一个人的开发，也需要大家的支持</h3>
      <p>黑卡 HEIKA 是一个由个人独立开发与维护的探索社区。目前，黑卡主要依靠 Vercel 提供应用服务，并使用 Supabase 管理数据库与内容存储。由于服务部署在海外，国内部分地区可能存在访问延迟或连接不稳定的问题。</p>
      <p>有限的存储容量、网络流量与服务器资源，也让黑卡需要合理控制部分免费功能的使用额度。作为一名还在读高三的独立开发者，我希望把更多精力投入到功能完善、体验优化与内容建设中；持续维护社区也需要一定的经济支持。</p>
      <p>因此开放了自愿赞助计划。你可以继续免费使用黑卡，也可以通过爱发电支持项目，并按商品说明领取 Plus 或 Pro 激活码。支持完全自愿，免费功能持续保留。</p>
      <a className="membership-support-link" href={AFDIAN_URL} target="_blank" rel="noreferrer">前往爱发电支持 <ArrowDownRight size={16}/></a>
      <small className="membership-support-footnote">自愿支持 · 免费功能持续保留 · 购买后以爱发电商品说明为准</small>
      <button type="button" className="membership-disclosure" aria-expanded={supportInfoOpen} onClick={() => setSupportInfoOpen((open) => !open)}><span><strong>你的支持将用于哪里？</strong><small>应用部署、数据库与内容服务的持续投入</small></span><ChevronDown size={17}/></button>
      {supportInfoOpen && <ul className="membership-support-uses"><li>应用部署与服务器维护</li><li>数据库、存储与网络资源</li><li>内容及图片服务</li><li>应用功能优化与国内访问体验改善</li></ul>}
    </section>

    <RedeemMembership onActivated={(newTier) => { setMembership((current) => current ? { ...current, tier: newTier } : current); onActivated(newTier); }} onMembershipRefresh={setMembership} onNotice={onNotice}/>

    <section className="membership-faq">
      <button type="button" className="membership-disclosure" aria-expanded={faqOpen} onClick={() => setFaqOpen((open) => !open)}><span><strong>会员帮助</strong><small>获取、兑换、到期与联系开发者</small></span><ChevronDown size={17}/></button>
      {faqOpen && <div className="membership-faq-content"><p><strong>如何获得会员？</strong><br/>通过爱发电支持后，按对应商品页的说明获取会员激活码；平台商品需由项目运营方实际配置。</p><p><strong>如何使用激活码？</strong><br/>粘贴激活码并先验证，确认会员档位与有效天数后再提交兑换。</p><p><strong>卡密无效怎么办？</strong><br/>检查空格和字符，已使用或停用的卡密无法再次兑换；仍有问题可从设置中的意见反馈联系开发者。</p><p><strong>会员到期后会发生什么？</strong><br/>按服务端权益时间自动回到下一段有效会员；没有后续权益时恢复 Free。已用 EXP 和翻卡记录会保留。</p><p><strong>幸运奖励会一起增加吗？</strong><br/>每日翻卡基础额度与幸运奖励分别计算。</p></div>}
    </section>
    <p className="membership-thanks"><HeartHandshake size={16}/> 自愿支持 · 免费功能持续保留</p>
    {!membership && !loadError && <span className="sr-only">正在同步会员配置</span>}
  </div>;
}
