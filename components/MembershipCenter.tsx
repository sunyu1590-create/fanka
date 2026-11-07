"use client";

import { useRef, useState } from "react";
import { ArrowDown, Check, ChevronDown, Crown, Database, HeartHandshake, Server, Wrench } from "lucide-react";
import { MEMBERSHIP_PLANS, type MembershipTier } from "@/lib/membership-plans";

const packs = [3, 5, 10] as const;
const letter = [
  "黑卡并不是一家公司的产品。",
  "它的背后，没有成熟的技术团队，没有充足的资金支持，也没有专业的运营人员。只有一个还在读高三、利用课余时间不断学习和开发的普通学生。",
  "最初制作黑卡，只是想创造一个不太一样的内容世界。希望每一次翻卡，都能带来一些未知的惊喜，让大家在快节奏的生活中，偶尔遇见真正感兴趣的东西。",
  "但当这个想法逐渐变成真实的应用，我也开始面对一个很现实的问题：让一个产品运行起来，远比把它做出来更困难。",
  "每一张图片的存储、每一次内容加载、每一条消息的传递，都需要服务器和技术资源。随着功能逐渐丰富，存储空间、带宽和服务器性能的需求也在不断增加。",
  "而我目前还是一名高三学生，没有稳定的经济来源。除了完成日常学业，我还需要尽可能抽出时间维护黑卡、修复问题、支付相关的运行成本。",
  "我不想因为这些困难，就轻易放弃一个投入了很多心血的作品。",
  "所以，我决定尝试开启「黑卡支持计划」。",
  "如果你喜欢黑卡，也愿意帮助它继续成长，可以通过自愿支持的方式，为后续的服务器维护和功能开发提供一点帮助。",
  "你的每一份支持，都意味着黑卡可以更有底气地走下去。",
  "即使暂时无法提供经济支持，也完全没有关系。愿意使用黑卡、提出建议，或者把它分享给朋友，对我而言同样珍贵。",
  "谢谢你愿意来到这里。",
];

export default function MembershipCenter({ tier, dailyAllowance, usedFlips, onNotice }: { tier: MembershipTier; dailyAllowance: number; usedFlips: number; onNotice: (message: string) => void }) {
  const [selectedPlan, setSelectedPlan] = useState<MembershipTier | null>(null);
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [supportInfoOpen, setSupportInfoOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const supportRef = useRef<HTMLElement>(null);
  const used = Math.min(Math.max(0, usedFlips), dailyAllowance);
  const remaining = Math.max(0, dailyAllowance - used);
  const currentName = tier === "pro" ? "Pro" : tier === "plus" ? "Plus" : "Free";
  const baseAllowance = MEMBERSHIP_PLANS.find((plan) => plan.id === tier)?.dailyFlips ?? 5;
  const bonusAllowance = Math.max(0, dailyAllowance - baseAllowance);
  const activePlan = selectedPlan ? MEMBERSHIP_PLANS.find((plan) => plan.id === selectedPlan) : null;
  const scrollToSupport = () => supportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return <div className={`membership-center-page membership-tier-${tier}`}>
    <header className="membership-letterhead">
      <span>HEIKA · 支持计划</span>
      <h2>让每一次翻卡，都有下一次。</h2>
      <p>一个人的开发旅程，感谢有你同行。</p>
    </header>

    <section className="membership-identity" aria-label="当前会员身份">
      <span className="membership-identity-icon"><Crown size={19}/></span>
      <div className="membership-identity-main"><small>当前会员身份</small><strong>{currentName}</strong><span>今日已翻 {used} 次 · 还可翻 {remaining} 次</span><div className="membership-quota-track" role="progressbar" aria-label="今日翻卡进度" aria-valuemin={0} aria-valuemax={dailyAllowance} aria-valuenow={used}><i style={{ width: `${dailyAllowance ? Math.min(100, used / dailyAllowance * 100) : 0}%` }}/></div><small className="membership-quota-breakdown">基础 {baseAllowance} 次{bonusAllowance > 0 ? ` + 幸运奖励 ${bonusAllowance} 次` : ""}</small></div>
      <span className="membership-identity-quota">{dailyAllowance}<small> 次 / 日</small></span>
    </section>

    <section className="membership-developer-letter">
      <div className="membership-section-kicker">A NOTE FROM THE DEVELOPER</div>
      <h3>关于黑卡，我想说几句话。</h3>
      <p className="membership-letter-summary">黑卡是一个由我独立开发和维护的内容探索应用。最初只是想创造一个不太一样的内容世界，也希望它能在大家的日常里继续运行、继续成长。</p>
      <div className={`membership-letter-full${letterOpen ? " is-open" : ""}`} aria-hidden={!letterOpen} inert={!letterOpen}>
        <div>{letter.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<p className="membership-letter-signoff">—— 黑卡开发者</p></div>
      </div>
      <button type="button" className="membership-text-action" aria-expanded={letterOpen} onClick={() => setLetterOpen((open) => !open)}>{letterOpen ? "收起来信" : "阅读全文"}<ChevronDown size={15}/></button>
    </section>

    <section className="membership-plan-section" aria-labelledby="membership-plan-title">
      <div className="membership-section-kicker">MEMBERSHIP PREVIEW</div>
      <div className="membership-section-heading"><div><h3 id="membership-plan-title">会员方案预览</h3><p>选择适合你的支持方式，解锁更多探索次数。</p></div></div>
      <div className="membership-plan-grid" role="group" aria-label="选择会员方案预览">
        {MEMBERSHIP_PLANS.map((plan) => <button type="button" key={plan.id} className={`membership-plan-card is-${plan.id}${selectedPlan === plan.id ? " selected" : ""}`} aria-pressed={selectedPlan === plan.id} onClick={() => setSelectedPlan(plan.id)}>
          <span className="membership-plan-name">{plan.name}{tier === plan.id && <small>当前</small>}</span><strong>{plan.dailyFlips}<small> 次 / 日</small></strong><span className="membership-plan-price">{plan.previewPrice}{plan.id !== "free" && <small> / 月</small>}</span><span className="membership-plan-benefit">{plan.id === "free" ? "黑卡基础探索额度" : "更多每日探索机会"}</span>{selectedPlan === plan.id && <Check className="membership-plan-selected-icon" size={16} aria-hidden="true"/>}
        </button>)}
      </div>
      <p className="membership-preview-disclaimer">当前仅供预览，不会扣费或开通套餐。</p>
      {activePlan && <div className={`membership-selected-detail is-${activePlan.id}`} aria-live="polite"><span><strong>{activePlan.name}</strong><small>{activePlan.id === "free" ? "持续可用的免费方案" : "方案权益预览 · 尚未开放订阅"}</small></span><b>{activePlan.dailyFlips}<small> 次 / 日</small></b><button type="button" className="membership-plan-preview-action" onClick={() => onNotice(`${activePlan.name} 方案仅供预览，不会扣费或开通会员`)}>查看方案详情</button></div>}
      <button type="button" className="membership-support-cta" onClick={scrollToSupport}>了解支持方式 <ArrowDown size={16}/></button>
    </section>

    <section className="membership-support-section" id="heika-support" ref={supportRef}>
      <div className="membership-section-kicker">VOLUNTARY SUPPORT</div>
      <h3>支持黑卡</h3>
      <p className="membership-support-lead">你的支持，会成为黑卡继续成长的一份力量。</p>
      <p>支持完全出于自愿。无论是否提供支持，都可以继续使用黑卡现有的免费功能；支持不会与会员权益绑定。</p>
      <div className="membership-support-unavailable">目前没有配置线上支持渠道。使用黑卡、提出建议，或分享给朋友，同样是在支持它。</div>
      <div className="membership-use-heading">你的支持，会用在哪里？</div>
      <div className="membership-use-list">
        <div><Database size={17}/><span><strong>内容存储</strong><small>图片、用户内容和必要数据的持续存储。</small></span></div>
        <div><Server size={17}/><span><strong>服务器运行</strong><small>服务运行、网络带宽、请求处理及性能保障。</small></span></div>
        <div><Wrench size={17}/><span><strong>持续开发与维护</strong><small>故障修复、功能升级与必要的开发维护支出。</small></span></div>
      </div>
      <p className="membership-support-footnote">未展示未经核实的费用、筹款目标或支持人数。</p>
    </section>

    <section className="membership-extra-section" aria-label="规则与说明">
      <button type="button" className="membership-disclosure" aria-expanded={extraOpen} onClick={() => setExtraOpen((open) => !open)}><span><strong>额外翻卡包</strong><small>{selectedPack ? `已选 +${selectedPack} 次` : "一次性补充机会 · 预览"}</small></span><ChevronDown size={17}/></button>
      <div className={`membership-disclosure-content${extraOpen ? " is-open" : ""}`} aria-hidden={!extraOpen} inert={!extraOpen}>
        <div className="membership-pack-options">{packs.map((count) => <button key={count} type="button" aria-pressed={selectedPack === count} className={selectedPack === count ? "selected" : ""} onClick={() => setSelectedPack(count)}>+{count}<small>次翻卡</small></button>)}</div>
        {selectedPack && <button type="button" className="membership-pack-preview" onClick={() => onNotice("额外翻卡包当前仅供预览，不会扣费或增加实际额度")}>预览 +{selectedPack} 次卡包</button>}
        <small className="membership-preview-disclaimer">此预览不会创建订单或改变实际翻卡额度。</small>
      </div>
      <button type="button" className="membership-disclosure" aria-expanded={rulesOpen} onClick={() => setRulesOpen((open) => !open)}><span><strong>翻卡与订阅规则</strong><small>额度、幸运奖励和方案预览说明</small></span><ChevronDown size={17}/></button>
      <div className={`membership-disclosure-content${rulesOpen ? " is-open" : ""}`} aria-hidden={!rulesOpen} inert={!rulesOpen}>
        <div className="membership-rules-copy"><p>Free 每日 5 次、Plus 每日 9 次、Pro 每日 13 次。实际可用额度以当前账号等级和系统计算结果为准，幸运加成另行计入。</p><p>Plus 每日首次翻卡额外 +3 EXP，Pro 额外 +6 EXP。</p><p>Plus / Pro 显示的金额仅为未来方案预览。当前不会扣费、创建订单或开通权益。</p></div>
      </div>
      <button type="button" className="membership-disclosure" aria-expanded={supportInfoOpen} onClick={() => setSupportInfoOpen((open) => !open)}><span><strong>支持计划说明</strong><small>自愿支持，不影响免费功能</small></span><ChevronDown size={17}/></button>
      <div className={`membership-disclosure-content${supportInfoOpen ? " is-open" : ""}`} aria-hidden={!supportInfoOpen} inert={!supportInfoOpen}><p className="membership-rules-copy">当前没有线上支持入口。黑卡不展示或收集虚构的捐赠、支持记录；后续若开放渠道，会在页面明确说明用途和规则。</p></div>
      <button type="button" className="membership-disclosure" aria-expanded={faqOpen} onClick={() => setFaqOpen((open) => !open)}><span><strong>常见问题</strong><small>支持计划相关说明</small></span><ChevronDown size={17}/></button>
      <div className={`membership-disclosure-content${faqOpen ? " is-open" : ""}`} aria-hidden={!faqOpen} inert={!faqOpen}><div className="membership-rules-copy"><p><strong>不支持会影响使用吗？</strong><br/>不会。现有免费功能可继续使用。</p><p><strong>现在可以购买方案吗？</strong><br/>不可以。会员价格和翻卡包都仅供预览，不会扣费或开通。</p><p><strong>如何帮助黑卡？</strong><br/>可以继续使用、反馈问题或分享给朋友。</p></div></div>
    </section>
    <p className="membership-thanks"><HeartHandshake size={17}/> 谢谢你愿意来到这里。</p>
  </div>;
}
