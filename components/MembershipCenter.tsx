"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Clock3, HeartHandshake, RefreshCw, TicketCheck } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import type { MembershipTier } from "@/lib/membership-plans";

type Plan = { tier: MembershipTier; name: string; daily_flip_allowance: number; price_cents: number; currency: string; duration_days: number | null; benefits: string[]; active: boolean };
type MembershipState = { tier: MembershipTier; startsAt: string | null; expiresAt: string | null; pendingTier: MembershipTier | null; pendingDays: number; source: string; dailyFlipAllowance: number; baseDailyFlipAllowance: number; dailyFlipsUsed: number; dailyLuckyBonus: number };
type Props = { tier: MembershipTier; dailyAllowance: number; usedFlips: number; accountId?: string | null; experienceTotal?: number };

const afdianUrl = "https://afdian.com/a/heikaka";
const tierName = (tier: MembershipTier) => tier === "pro" ? "Pro" : tier === "plus" ? "Plus" : "Free";
const formatPrice = (plan: Plan) => plan.price_cents === 0 ? "免费" : `¥${(plan.price_cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "—";

export default function MembershipCenter({ tier, dailyAllowance, usedFlips, accountId, experienceTotal }: Props) {
  const [selected, setSelected] = useState<MembershipTier>(tier);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const [accountExperience, setAccountExperience] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [storyOpen, setStoryOpen] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [supportPlanConfirm, setSupportPlanConfirm] = useState(false);
  const storyRef = useRef<HTMLDivElement>(null);
  const currentTier = membership?.tier || tier;
  const currentAllowance = membership?.dailyFlipAllowance ?? dailyAllowance;
  const currentUsed = Math.min(currentAllowance, membership?.dailyFlipsUsed ?? usedFlips);
  const remaining = Math.max(0, currentAllowance - currentUsed);
  const currentExperience = experienceTotal ?? accountExperience;
  const selectedPlan = useMemo(() => plans.find((plan) => plan.tier === selected) || plans[0] || null, [plans, selected]);
  const refresh = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      let response: { membership?: MembershipState | null; plans?: Plan[] } | null;
      if (accountId) {
        response = await cloudRequest("/api/v1/membership") as { membership?: MembershipState | null; plans?: Plan[] } | null;
      } else {
        const result = await fetch("/api/v1/membership", { cache: "no-store" });
        const payload = await result.json();
        if (!result.ok) throw new Error(payload.error || "会员信息暂时不可用，请重试");
        response = payload.data as { membership?: MembershipState | null; plans?: Plan[] };
      }
      if (!response || !Array.isArray(response.plans) || (accountId && !response.membership)) throw new Error("会员信息暂时不可用，请重试");
      setMembership(response.membership || null);
      setPlans(response.plans);
      setSelected(response.membership?.tier || tier);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "会员信息加载失败");
    } finally { setLoading(false); }
  }, [accountId, tier]);
  useEffect(() => {
    if (experienceTotal !== undefined) return;
    if (accountId === undefined) return;
    if (!accountId) {
      setAccountExperience(0);
      return;
    }
    let active = true;
    setAccountExperience(null);
    void cloudRequest("/api/v1/progression").then((summary) => {
      if (active) setAccountExperience(Number((summary as { total?: number } | null)?.total) || 0);
    }).catch(() => {});
    return () => { active = false; };
  }, [accountId, experienceTotal]);

  useEffect(() => {
    setMembership(null);
    setSelected(tier);
    setLoadError("");
    setLoading(true);
    if (accountId !== undefined) void refresh();
  }, [accountId, refresh, tier]);

  const percent = currentAllowance ? Math.min(100, currentUsed / currentAllowance * 100) : 0;
  const identityStatus = !accountId ? "登录后查询账号权益" : loading ? "正在同步会员状态" : loadError ? "同步失败" : membership?.expiresAt ? `有效期至 ${formatDate(membership.expiresAt)}` : currentTier === "free" ? "基础探索权益" : "长期有效权益";

  return <div className="heika-membership" data-tier={currentTier}>
    <header className="heika-membership-heading">
      <div><span className="heika-membership-eyebrow">HEIKA · MEMBERSHIP</span><h2>会员与支持</h2><p>探索未知，发现更多。</p></div>
      <Link href="/membership/redeem" className="heika-membership-redeem-link"><TicketCheck size={16}/>兑换会员</Link>
    </header>

    <section className={`heika-membership-status tier-${currentTier}`} aria-label="当前会员状态">
      <div className="heika-membership-status-top"><span>HEIKA MEMBERSHIP</span><button type="button" onClick={() => void refresh()} disabled={accountId === undefined || loading} aria-label="刷新会员状态"><RefreshCw size={15} className={loading ? "is-spinning" : ""}/></button></div>
      {loading ? <div className="heika-membership-skeleton" aria-label="正在加载会员状态"><i/><i/><i/></div> : <>
        <div className="heika-membership-status-main"><div><span className="heika-membership-caption">当前会员身份</span><strong>{tierName(currentTier)}</strong><small><Clock3 size={13}/>{identityStatus}</small></div><div className="heika-membership-quota"><strong>{currentAllowance}</strong><span>次 / 日</span></div></div>
        <div className="heika-membership-progress" role="progressbar" aria-label="今日翻卡进度" aria-valuemin={0} aria-valuemax={currentAllowance} aria-valuenow={currentUsed}><i style={{ width: `${percent}%` }}/></div>
        <div className="heika-membership-status-meta"><span>今日已用 {currentUsed} 次</span><span>剩余 {remaining} 次</span><span>EXP {currentExperience === null ? "—" : currentExperience.toLocaleString("zh-CN")}</span></div>
        {membership?.pendingTier && <p className="heika-membership-pending">当前 Pro 权益结束后，将启用 {tierName(membership.pendingTier)} {membership.pendingDays} 天。</p>}
      </>}
      {loadError && <div className="heika-membership-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => void refresh()}>重试</button></div>}
      {accountId === null && <p className="heika-membership-login-note">登录后可查询有效期、EXP 与账号每日剩余额度。</p>}
      <button type="button" className="heika-membership-inline-link" onClick={() => document.getElementById("heika-membership-plans")?.scrollIntoView({ behavior: "smooth", block: "start" })}>查看会员权益 <ArrowDownRight size={15}/></button>
    </section>

    <section className="heika-membership-plans" id="heika-membership-plans">
      <div className="heika-membership-section-title"><div><span>01 / MEMBERSHIP</span><h3>选择探索方案</h3></div><small>会员权益与每日额度由账号服务端核验</small></div>
      <div className="heika-membership-plan-grid" role="group" aria-label="会员方案">
        {plans.map((plan) => <button type="button" key={plan.tier} className={`heika-membership-plan tier-${plan.tier}${selected === plan.tier ? " selected" : ""}${currentTier === plan.tier ? " current" : ""}`} aria-pressed={selected === plan.tier} onClick={() => { setSelected(plan.tier); setSupportPlanConfirm(false); }}>
          <span className="heika-membership-plan-top"><strong>{plan.name}</strong>{currentTier === plan.tier && <em>当前方案</em>}</span>
          <span className="heika-membership-plan-quota"><b>{plan.daily_flip_allowance}</b> 次 / 日</span>
          <span className="heika-membership-plan-price">{formatPrice(plan)}{plan.duration_days ? <small> / {plan.duration_days} 天</small> : null}</span>
        </button>)}
      </div>
      {loading && !plans.length ? <div className="heika-membership-skeleton membership-plans-skeleton" aria-label="正在加载会员方案"><i/><i/><i/></div> : loadError && !plans.length ? <p className="heika-membership-error" role="alert">会员方案暂时无法加载，请使用上方重试按钮。</p> : selectedPlan && <div className="heika-membership-benefits" aria-live="polite"><div><strong>{selectedPlan.name} 权益</strong><span>{selectedPlan.duration_days ? `有效 ${selectedPlan.duration_days} 天 · 兑换后生效` : "长期可用"}</span></div><ul>{selectedPlan.benefits.map((benefit) => <li key={benefit}><Check size={14}/>{benefit}</li>)}</ul></div>}
      {selected === "free" ? <p className="heika-membership-plan-note">Free 可持续免费使用。方案切换仅展示权益，不会改变账号会员状态。</p> : <div className="heika-membership-external-cta"><button type="button" aria-expanded={supportPlanConfirm} onClick={() => setSupportPlanConfirm((open) => !open)} disabled={!selectedPlan}>前往爱发电支持 <ArrowUpRight size={16}/></button><span>外部支持完成后，请使用获得的会员激活码兑换。此处不会发起站内支付或虚构订单。</span>{supportPlanConfirm && selectedPlan && <div className="heika-membership-support-confirm" role="group" aria-label="确认前往爱发电"><strong>{selectedPlan.name} · {formatPrice(selectedPlan)}{selectedPlan.duration_days ? ` / ${selectedPlan.duration_days} 天` : ""}</strong><p>即将打开爱发电官方页面。赞助支付由爱发电处理；完成后请使用平台提供的激活码回到黑卡兑换。</p><div><a href={afdianUrl} target="_blank" rel="noopener noreferrer">继续前往 <ArrowUpRight size={15}/></a><button type="button" onClick={() => setSupportPlanConfirm(false)}>取消</button></div></div>}</div>}
    </section>

    <section className="heika-membership-story" ref={storyRef}>
      <span className="heika-membership-section-index">02 / OUR STORY</span><h3>一个想法，逐渐成为一个产品。</h3>
      <p>黑卡是一个由独立开发者构建和维护的内容探索应用。从最初的翻卡探索，到逐渐完善内容生态，我们希望让每一次探索都值得期待。</p>
      <div className={`heika-membership-story-full${storyOpen ? " is-open" : ""}`} aria-hidden={!storyOpen} inert={!storyOpen}><div><p>黑卡 HEIKA 由个人独立开发和维护。目前，应用使用 Vercel 提供网页服务，并使用 Supabase 管理数据库与内容存储。服务部署在海外，国内部分地区可能遇到访问延迟或连接不稳定。</p><p>随着内容和功能增长，存储、带宽与服务资源也需要持续投入。作为仍在读高三的独立开发者，我会继续利用课余时间完善功能、优化体验并维护社区。</p><p>支持完全自愿。你可以继续免费使用黑卡，也可以通过爱发电支持项目，并在平台按说明获取会员激活码。</p></div></div>
      <button type="button" className="heika-membership-text-button" aria-expanded={storyOpen} onClick={() => setStoryOpen((open) => !open)}>{storyOpen ? "收起" : "阅读全文"}<ChevronDown size={15}/></button>
    </section>

    <section className="heika-membership-support" id="heika-membership-support">
      <span className="heika-membership-section-index">03 / SUPPORT THE PROJECT</span><h3>一个人的开发，也需要大家的支持</h3>
      <p>黑卡 HEIKA 是一个由个人独立开发与维护的探索社区。应用运行与日常维护需要服务器、数据库、存储、网络带宽和持续开发投入。</p>
      <p>作为一名还在读高三的独立开发者，有限的时间和资源让每一次支持都很有意义。你可以继续免费使用黑卡，也可以通过爱发电自愿支持项目，按平台说明获得 Plus 或 Pro 激活码。</p>
      <a className="heika-membership-support-button" href={afdianUrl} target="_blank" rel="noopener noreferrer">前往爱发电支持 <ArrowUpRight size={17}/></a>
      <button type="button" className="heika-membership-costs-toggle" aria-expanded={costsOpen} onClick={() => setCostsOpen((open) => !open)}>支持款项将用于哪里？<ChevronDown size={15}/></button>
      <div className={`heika-membership-costs${costsOpen ? " is-open" : ""}`} aria-hidden={!costsOpen} inert={!costsOpen}><ul><li>服务器维护与应用部署</li><li>数据库、存储与网络带宽</li><li>内容与图片资源</li><li>功能开发与日常维护</li><li>国内访问体验优化</li></ul><small>以上为计划用途说明，不代表已完成的支出或建设成果。</small></div>
      <small className="heika-membership-voluntary">自愿支持不会影响 Free 用户使用现有免费功能。支付将在爱发电完成；本项目当前通过平台卡密发放会员权益。</small>
    </section>

    <section className="heika-membership-activation"><div><span>04 / ACTIVATE</span><h3>已经获得会员激活码？</h3><p>兑换后由服务端更新账号会员状态与有效期。</p></div><Link href="/membership/redeem">立即兑换 <ArrowUpRight size={16}/></Link></section>
    <footer className="heika-membership-footer"><HeartHandshake size={17}/><span>感谢每一份支持，让黑卡继续生长。</span><Link href="/membership/redeem"><CircleHelp size={14}/>兑换说明</Link></footer>
  </div>;
}
