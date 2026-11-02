"use client";

import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, UserRound, Users } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import { cloudFetch } from "@/lib/cloud";
import AnimatedNotice from "./AnimatedNotice";

type BlockedProfile = { id: string; nickname: string; bio: string };

export default function MessagingPreferences({
  accountId,
  onLogin,
}: {
  accountId: string | null;
  onLogin: () => void;
}) {
  const [permission, setPermission] = useState<"everyone" | "nobody">("everyone");
  const [notesPrivate, setNotesPrivate] = useState(false);
  const [blocked, setBlocked] = useState<BlockedProfile[]>([]);
  const [busyId, setBusyId] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    void browserDb().then(async (db) => {
      const [prefs, blocks, profile] = await Promise.all([
        db.from("browsing_preferences").select("dm_permission").eq("user_id", accountId).maybeSingle(),
        db.from("user_blocks").select("blocked_id").eq("owner_id", accountId),
        db.from("profiles").select("notes_private").eq("id", accountId).single(),
      ]);
      if (!alive) return;
      if (prefs.error || blocks.error || profile.error) {
        setError(prefs.error?.message || blocks.error?.message || profile.error?.message || "读取安全设置失败");
        return;
      }
      setPermission(prefs.data?.dm_permission === "nobody" ? "nobody" : "everyone");
      setNotesPrivate(profile.data.notes_private === true);
      const ids = (blocks.data || []).map((row) => row.blocked_id);
      if (!ids.length) return setBlocked([]);
      const { data, error: peopleError } = await db.from("profiles").select("id,nickname,bio").in("id", ids);
      if (!alive) return;
      if (peopleError) setError(peopleError.message);
      setBlocked(data || []);
    }).catch((cause) => alive && setError(cause instanceof Error ? cause.message : "读取私聊设置失败"));
    return () => { alive = false; };
  }, [accountId]);

  const savePermission = async (value: "everyone" | "nobody") => {
    if (!accountId) return;
    setBusyId("permission"); setError("");
    try {
      const db = await browserDb();
      const { error: saveError } = await db.from("browsing_preferences").upsert({ user_id: accountId, dm_permission: value });
      if (saveError) throw saveError;
      setPermission(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusyId(""); }
  };

  const saveNotesPrivacy = async (value: boolean) => {
    if (!accountId) return;
    setBusyId("notes"); setError("");
    try {
      const db = await browserDb();
      const { error: saveError } = await db.from("profiles").update({ notes_private: value }).eq("id", accountId);
      if (saveError) throw saveError;
      setNotesPrivate(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存隐私设置失败"); }
    finally { setBusyId(""); }
  };

  const unblock = async (id: string) => {
    if (!accountId) return;
    setBusyId(id); setError("");
    try {
      const db = await browserDb();
      const { error: removeError } = await db.from("user_blocks").delete().eq("owner_id", accountId).eq("blocked_id", id);
      if (removeError) throw removeError;
      setBlocked((items) => items.filter((item) => item.id !== id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "解除拉黑失败"); }
    finally { setBusyId(""); }
  };

  const createRecoveryCodes = async () => {
    if (!accountId) return;
    setBusyId("recovery"); setError(""); setRecoveryCodes([]);
    try {
      const response = await cloudFetch("/api/v1/auth/recovery-codes", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.data?.codes)) throw new Error(result.error || "恢复码生成失败");
      setRecoveryCodes(result.data.codes);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "恢复码生成失败"); }
    finally { setBusyId(""); }
  };

  if (!accountId) return <section className="messaging-preferences-empty"><ShieldCheck size={22}/><strong>登录后使用安全中心</strong><p>登录账号后可以管理笔记可见范围、私聊接收范围和黑名单。</p><button className="primary-button" onClick={onLogin}>前往登录</button></section>;

  return <div className="messaging-preferences">
    <section className="settings-module">
      <div className="settings-module-heading"><strong>隐私设置</strong></div>
      <div className="switch-row"><span><strong>笔记仅自己可见</strong><small>开启后，其他用户无法查看你已发布的笔记和图片。管理员仍可进行审核。</small></span><button type="button" role="switch" aria-checked={notesPrivate} aria-label="笔记仅自己可见" disabled={busyId === "notes"} className={`toggle-switch ${notesPrivate ? "on" : ""}`} onClick={() => void saveNotesPrivacy(!notesPrivate)}><i/></button></div>
    </section>
    <section className="settings-module">
      <div className="settings-module-heading"><strong>私聊接收范围</strong></div>
      <div className="preference-options" role="radiogroup" aria-label="私聊接收范围">
        {([ ["everyone", "允许接收私聊", "其他用户可以向你发起私聊"], ["nobody", "关闭陌生人私聊", "仅保留已经建立的会话"] ] as const).map(([value, label, description]) => <button key={value} role="radio" aria-checked={permission === value} className={`preference-option${permission === value ? " selected" : ""}`} disabled={busyId === "permission"} onClick={() => void savePermission(value)}>
          <span className="preference-option-icon"><Users size={18}/></span><span className="preference-option-copy"><strong>{label}</strong><small>{description}</small></span><i className="preference-check">{permission === value ? "✓" : ""}</i>
        </button>)}
      </div>
    </section>
    <section className="settings-module messaging-block-list">
      <div className="settings-module-heading"><strong>黑名单</strong><small>{blocked.length} 位用户</small></div>
      {blocked.length ? blocked.map((person) => <div className="messaging-block-row" key={person.id}><span className="settings-row-icon"><UserRound size={17}/></span><span><strong>{person.nickname || "探索者"}</strong><small>{person.bio || "已限制私聊"}</small></span><button className="soft-button" disabled={busyId === person.id} onClick={() => void unblock(person.id)}>{busyId === person.id ? "处理中…" : "解除"}</button></div>) : <p className="messaging-preferences-note">黑名单为空。你拉黑的用户会显示在这里。</p>}
    </section>
    <section className="settings-module">
      <div className="settings-module-heading"><strong>账号安全 / 备用恢复码</strong></div>
      <p className="messaging-preferences-note">恢复码只展示一次。生成新码会让此前的所有恢复码失效，请离线保存在安全位置。</p>
      <button type="button" className="soft-button" disabled={busyId === "recovery"} onClick={() => void createRecoveryCodes()}>{busyId === "recovery" ? "正在生成…" : recoveryCodes.length ? "重新生成恢复码" : "生成备用恢复码"}</button>
      {recoveryCodes.length > 0 && <pre className="recovery-code-list">{recoveryCodes.join("\n")}</pre>}
      <button className="messaging-signout" onClick={() => void browserDb().then((db) => db.auth.signOut())}><LogOut size={17}/>退出账号</button>
    </section>
    <AnimatedNotice message={error} className="messaging-preferences-error" />
  </div>;
}
