"use client";

import { useEffect, useState } from "react";

/**
 * 受邀注册后的欢迎信。
 *
 * 和恢复码页一样需要出现在两个位置：消息页内部的账号流程，以及社区顶层
 * （新账号注册后会被引导页接管，欢迎信必须排在恢复码之后、引导页之前）。
 */
export type InvitationWelcome = {
  kind?: string;
  batchLabel?: string;
  badge?: { label?: string };
  rewardDays?: number;
  expiresAt?: string;
};

export default function InvitationWelcomePage({
  invitation,
  onDone,
}: {
  invitation: InvitationWelcome;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"closed" | "flap" | "paper" | "open">("closed");
  const opened = phase === "open";
  const rewardDays = Math.max(0, Math.floor(Number(invitation.rewardDays) || 0));

  useEffect(() => {
    if (phase === "closed" || phase === "open") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setPhase("open");
      return;
    }
    const timer = window.setTimeout(() => {
      setPhase((current) => current === "flap" ? "paper" : current === "paper" ? "open" : current);
    }, phase === "flap" ? 680 : 560);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <section className="page invite-welcome-page">
      <div className={`invite-welcome-scene invite-phase-${phase}${opened ? " is-open" : ""}`}>
        <button
          type="button"
          className="invite-envelope"
          aria-expanded={opened}
          aria-label={opened ? "邀请信已打开" : "打开邀请信"}
          onClick={() => setPhase("flap")}
          disabled={opened}
        >
          <span className="invite-envelope-paper"><span>黑卡邀请函</span><i>✦</i></span>
          <span className="invite-envelope-front" />
          <span className="invite-envelope-flap" aria-hidden="true"><i /><b /></span>
          <span className="invite-envelope-seal">✦</span>
          {!opened && <span className="invite-envelope-prompt">轻触封印，打开这封信</span>}
        </button>
        {opened && <article className="invite-welcome-letter" aria-live="polite">
          <span className="invite-welcome-mark">✦</span>
          <p className="invite-welcome-kicker">一封来自黑卡的欢迎信</p>
          <h1>谢谢你，受邀而来。</h1>
          <p className="invite-welcome-greeting">你好，欢迎来到黑卡。</p>
          <p>这封信想先认真地对你说一声谢谢。感谢邀请你的人愿意把黑卡介绍给你，也感谢你愿意接过这份邀请，成为这个社区的新朋友。</p>
          <p>黑卡从一个简单的念头开始：让人们在一次次探索里遇见值得停留的内容，也让每一份真诚的分享都被看见。一个社区之所以慢慢长大，靠的不是热闹的口号，而是像你这样愿意加入、愿意交流、愿意留下好内容的人。</p>
          <p>你的账号已经获得 <strong>{invitation.badge?.label || "受邀入驻"}</strong> 标识。之后，其他用户可以在你的公开主页和私信资料旁看到它，知道你是通过社区邀请加入的。这份标识代表一次友好的引荐，也代表我们欢迎你在这里找到自己的位置。</p>
          {rewardDays > 0 && <p>同时，我们已为你的账号开通 <strong>专业会员 {rewardDays} 天</strong>。希望这段时间能让你更自在地体验黑卡的探索与创作功能。你可以慢慢熟悉这里，不必急着发布什么；当灵感出现时，也期待看到你愿意分享的故事、经验或作品。</p>}
          <p>如果你是带着创作计划来的，欢迎把这里当作一个认真交流的地方；如果你只是想先四处看看，也完全没关系。无论从哪里开始，我们都希望你能在黑卡里发现一些新的想法，并遇见值得继续交流的人。</p>
          <p>再次感谢你的加入。愿你在黑卡的每一次翻阅，都能遇见一点意料之外的惊喜。</p>
          <div className="invite-welcome-benefit">
            <span>本次邀请礼遇</span>
            <strong>{invitation.badge?.label || "受邀入驻"}</strong>
            {rewardDays > 0 && <small>专业会员 · {rewardDays} 天</small>}
          </div>
          <div className="invite-welcome-signature">
            <span>诚挚欢迎</span>
            <strong>黑卡社区</strong>
            {invitation.batchLabel && <small>邀请批次：{invitation.batchLabel}</small>}
          </div>
          <button type="button" className="primary-button" onClick={onDone}>进入黑卡</button>
        </article>}
      </div>
    </section>
  );
}
