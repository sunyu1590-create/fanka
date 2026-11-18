"use client";

import { useEffect, useState } from "react";
import { LogIn, Trash2 } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import { forgetAccount, readSavedAccounts, switchAccount, type SavedAccount } from "@/lib/saved-accounts";

type Props = {
  accountId: string | null;
  onNotice?: (message: string) => void;
};

/** 账号快捷更换：只在本机保存会话，切换时恢复登录态，不接触密码。 */
export default function AccountSwitcher({ accountId, onNotice }: Props) {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { setAccounts(readSavedAccounts()); }, [accountId]);

  const doSwitch = async (account: SavedAccount) => {
    if (account.id === accountId) return;
    setBusy(account.id); setError("");
    try {
      const db = await browserDb();
      await switchAccount(db, account.id);
      onNotice?.(`已切换到 ${account.nickname || account.email}`);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换失败，请重新登录");
      setBusy(null);
    }
  };

  return <section className="account-switcher" aria-label="账号快捷更换">
    <div className="account-switcher-head">
      <strong>本机账号</strong>
      <span>切换后无需重新输入密码；移除只会清掉本机记录。</span>
    </div>
    {accounts.length ? <ul>
      {accounts.map((account) => {
        const current = account.id === accountId;
        return <li key={account.id} className={current ? "is-current" : undefined}>
          <span className="account-switcher-avatar" aria-hidden="true">{(account.nickname || account.email || "探").slice(0, 1)}</span>
          <span className="account-switcher-copy">
            <strong>{account.nickname || account.email.split("@")[0] || "探索者"}{current && <em>当前登录</em>}</strong>
            <small>{account.email}</small>
          </span>
          {current ? <button type="button" className="account-switcher-remove" aria-label={`移除本机记录 ${account.email}`} disabled={busy !== null} onClick={() => { forgetAccount(account.id); setAccounts(readSavedAccounts()); }}><Trash2 size={14} /></button>
            : <button type="button" className="account-switcher-switch" disabled={busy !== null} onClick={() => void doSwitch(account)}>{busy === account.id ? "切换中…" : <><LogIn size={14} /> 切换</>}</button>}
        </li>;
      })}
    </ul> : <p className="account-switcher-empty">还没有其它账号。用另一个账号登录一次后，它会出现在这里。</p>}
    {error && <p className="account-switcher-error">{error}</p>}
    <p className="account-switcher-note">同一台设备最多保留 5 个账号的登录状态，退出登录不会删除这里的记录。</p>
  </section>;
}
