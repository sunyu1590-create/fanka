"use client";

import { useState } from "react";

/**
 * 注册后的恢复码页面。
 *
 * 独立成组件是因为它可能出现在两个位置：消息页的账号流程，以及社区顶层
 * （新账号注册后会被引导页接管，恢复码必须优先于引导页出现）。
 */
export default function RecoveryCodesPage({
  codes,
  onDone,
  standalone = false,
}: {
  codes: string[];
  onDone: () => void;
  standalone?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <section className={`page account-page recovery-codes-page${standalone ? " is-standalone" : ""}`}>
      <div className="eyebrow">HEIKA / ACCOUNT</div>
      <h1>保存你的恢复码<span className="red-dot">.</span></h1>
      <p className="lead">这是目前唯一能找回密码的方式。忘记密码时只有它能救回账号，我们无法代为重置。</p>
      <div className="recovery-codes-sheet">
        <ol className="recovery-codes-list">
          {codes.map((code) => <li key={code}>{code}</li>)}
        </ol>
        <p className="recovery-codes-hint">每个码只能使用一次。请截图或复制保存，离开本页后无法再次查看。</p>
        <button
          type="button"
          className="soft-button"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join("\n")).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }).catch(() => setCopied(false));
          }}
        >
          {copied ? "已复制" : "复制全部"}
        </button>
      </div>
      <label className="recovery-codes-confirm">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        我已妥善保存，知道丢失后无法找回
      </label>
      <button type="button" className="primary-button" disabled={!saved} onClick={onDone}>
        进入黑卡
      </button>
    </section>
  );
}
