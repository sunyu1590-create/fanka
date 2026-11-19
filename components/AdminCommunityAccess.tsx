"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { BadgeCheck, Bell, Clipboard, KeyRound, Plus, RefreshCw, ShieldCheck, UserRound, Users } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type Badge = { id: string; slug: string; label: string; description: string; color: string; active: boolean; sort_order: number };
type AccessCode = { id: string; status: "unused" | "redeemed" | "disabled" };
type Batch = { id: string; code_kind: "invitation" | "certification"; label: string; badge_id: string; reward_days: number; quantity: number; expires_at: string | null; active: boolean; unused: number; redeemed: number; disabled: number; codes: AccessCode[] };
type Notice = { id: string; title: string; body: string; audience: string; image_url: string | null; action_label: string | null; action_url: string | null; created_at: string; published_at: string; recipients?: number };
type Payload = { badges: Badge[]; batches: Batch[] };
type AdminUserChoice = { id: string; nickname: string; email: string };
type BadgeAward = { id: string; granted_at: string; badge: Badge };

const audienceLabel = (value: string) => ({ all: "所有用户", free: "Free 用户", plus: "Plus 会员", pro: "Pro 会员" }[value] || value);

export default function AdminCommunityAccess({ mode = "certification" }: { mode?: "certification" | "notices" }) {
  const [data, setData] = useState<Payload | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"invitation" | "certification">("invitation");
  const [batchLabel, setBatchLabel] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [generated, setGenerated] = useState<{ batchId: string; codes: string[] } | null>(null);
  const [badgeSlug, setBadgeSlug] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [badgeDescription, setBadgeDescription] = useState("");
  const [badgeColor, setBadgeColor] = useState("#78613B");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<AdminUserChoice[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserChoice | null>(null);
  const [userAwards, setUserAwards] = useState<BadgeAward[]>([]);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeAudience, setNoticeAudience] = useState("all");
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeImage, setNoticeImage] = useState("");
  const [noticeActionLabel, setNoticeActionLabel] = useState("");
  const [noticeActionUrl, setNoticeActionUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (mode === "certification") {
        const access = await cloudRequest("/api/v1/admin/access-codes/batches") as Payload | null;
        if (!access) throw new Error("管理员会话已失效");
        setData(access);
        if (!badgeId) setBadgeId(access.badges.find((badge) => badge.slug === "creator-certified")?.id || access.badges[0]?.id || "");
      } else {
        const history = await cloudRequest("/api/v1/admin/official-notices") as { items?: Notice[] } | null;
        if (!history) throw new Error("管理员会话已失效");
        setNotices(history.items || []);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "社区运营数据加载失败"); }
    finally { setLoading(false); }
  }, [badgeId, mode]);

  useEffect(() => { void load(); }, [load]);

  const createBatch = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage(""); setGenerated(null);
    try {
      const result = await cloudRequest("/api/v1/admin/access-codes/batches", {
        kind, label: batchLabel, badgeId: kind === "certification" ? badgeId : undefined,
        quantity: Number(quantity), ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      }) as { batchId: string; codes: string[]; rewardDays: number } | null;
      if (!result?.codes?.length) throw new Error("批次已创建，但明文码没有返回。请刷新批次记录。");
      setGenerated(result); setMessage(kind === "invitation" ? `已生成邀请码，兑换后附带 Pro ${result.rewardDays} 天。明文只显示这一次。` : "认证码已生成；每个码兑换后会授予所选认证标识。明文只显示这一次。");
      setBatchLabel(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "邀请码批次创建失败"); }
    finally { setBusy(false); }
  };

  const saveBadge = async (badge: Badge) => {
    try {
      await cloudRequest(`/api/v1/admin/profile-badges/${badge.id}`, { label: badge.label, description: badge.description, color: badge.color }, "PATCH");
      setMessage(`认证标识「${badge.label}」已保存`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "认证标识保存失败"); }
  };

  const toggleBadge = async (badge: Badge) => {
    try { await cloudRequest(`/api/v1/admin/profile-badges/${badge.id}`, { active: !badge.active }, "PATCH"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "标识状态更新失败"); }
  };

  const createBadge = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await cloudRequest("/api/v1/admin/profile-badges", { slug: badgeSlug, label: badgeLabel, description: badgeDescription, color: badgeColor });
      setBadgeSlug(""); setBadgeLabel(""); setBadgeDescription(""); setMessage("新的认证标识已创建"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "认证标识创建失败"); }
    finally { setBusy(false); }
  };

  const searchUsers = async (event: FormEvent) => {
    event.preventDefault();
    const query = userQuery.trim();
    if (query.length < 2) { setError("请输入至少 2 个字的昵称，或完整用户编号。"); return; }
    setError("");
    try {
      const result = await cloudRequest(`/api/v1/admin/users?limit=20&query=${encodeURIComponent(query)}`) as { items?: AdminUserChoice[] } | null;
      setUserResults(result?.items || []);
      if (!result?.items?.length) setMessage("没有找到匹配的已注册用户。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "用户搜索失败"); }
  };

  const chooseUser = async (target: AdminUserChoice) => {
    setSelectedUser(target); setUserAwards([]); setError(""); setMessage("");
    try {
      const result = await cloudRequest(`/api/v1/admin/profile-badges/awards?userId=${encodeURIComponent(target.id)}`) as { items?: BadgeAward[] } | null;
      setUserAwards(result?.items || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "用户认证记录读取失败"); }
  };

  const grantBadge = async (targetBadgeId: string) => {
    if (!selectedUser || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await cloudRequest("/api/v1/admin/profile-badges/awards", { userId: selectedUser.id, badgeId: targetBadgeId });
      await chooseUser(selectedUser); setMessage("认证标识已授予，用户主页和私信会显示认证标签。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "授予认证失败"); }
    finally { setBusy(false); }
  };

  const revokeBadge = async (awardId: string) => {
    if (!selectedUser || busy) return;
    setBusy(true); setError("");
    try { await cloudRequest("/api/v1/admin/profile-badges/awards", { awardId }, "DELETE"); await chooseUser(selectedUser); setMessage("认证标识已撤销。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "撤销认证失败"); }
    finally { setBusy(false); }
  };

  const createNotice = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await cloudRequest(editingNoticeId ? `/api/v1/admin/official-notices/${editingNoticeId}` : "/api/v1/admin/official-notices", {
        title: noticeTitle, body: noticeBody, ...(editingNoticeId ? {} : { audience: noticeAudience }),
        ...(editingNoticeId ? { imageUrl: noticeImage || null, actionLabel: noticeActionLabel || null, actionUrl: noticeActionUrl || null } : {}),
        ...(!editingNoticeId && noticeImage ? { imageUrl: noticeImage } : {}),
        ...(!editingNoticeId && (noticeActionLabel || noticeActionUrl) ? { actionLabel: noticeActionLabel, actionUrl: noticeActionUrl } : {}),
      }, editingNoticeId ? "PATCH" : "POST") as { recipients?: number } | null;
      setNoticeTitle(""); setNoticeBody(""); setNoticeImage(""); setNoticeActionLabel(""); setNoticeActionUrl("");
      setMessage(editingNoticeId ? "系统公告已更新，通知中心会显示最新内容。" : `系统公告已发送给 ${Number(result?.recipients || 0).toLocaleString("zh-CN")} 位用户。`);
      setEditingNoticeId(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "官方通知发送失败"); }
    finally { setBusy(false); }
  };

  const copyCodes = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.codes.join("\n")); setMessage("邀请码已复制，请妥善保管。");
  };

  return <div className="community-access-admin">
    <header className="community-access-heading"><div><h2>{mode === "certification" ? "认证与入驻邀请" : "系统通知管理"}</h2><p>{mode === "certification" ? "管理认证标识、手动认证用户和邀请码批次。" : "编辑并发布系统公告，用户可在通知中心查看历史与未读状态。"}</p></div><button type="button" className="soft-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>刷新</button></header>
    {error && <p className="moderation-feedback error" role="alert">{error}</p>}{message && <p className="moderation-feedback" role="status">{message}</p>}
    {loading && (mode === "certification" ? !data : !notices.length) ? <p className="moderation-empty">正在读取管理数据…</p> : <>
      {mode === "certification" && <>
      <section className="community-access-panel"><h3><ShieldCheck size={16}/>认证标识</h3><p>认证标识独立于入驻邀请。认证码绑定某一种标识，兑换后展示在用户公开主页。</p>
        <div className="community-badge-admin-list">{(data?.badges || []).map((badge) => <BadgeEditor key={badge.id} badge={badge} onSave={saveBadge} onToggle={toggleBadge}/>)}</div>
        <form className="community-badge-create" onSubmit={(event) => void createBadge(event)}><strong><Plus size={15}/>新增认证标识</strong><div><label>内部编号<input required value={badgeSlug} onChange={(event) => setBadgeSlug(event.target.value.toLowerCase())} placeholder="creator-certified" maxLength={40}/></label><label>展示名称<input required value={badgeLabel} onChange={(event) => setBadgeLabel(event.target.value)} placeholder="创作认证" maxLength={24}/></label><label>说明<input value={badgeDescription} onChange={(event) => setBadgeDescription(event.target.value)} placeholder="向用户说明认证含义" maxLength={120}/></label><label>颜色<input type="color" value={badgeColor} onChange={(event) => setBadgeColor(event.target.value)}/></label><button disabled={busy}>创建标识</button></div></form>
      </section>

      <section className="community-access-panel"><h3><Users size={16}/>直接为用户认证</h3><p>搜索已注册用户并直接授予或撤销认证。系统会在个人主页和私信资料旁显示带认证图标的标签。</p>
        <form className="admin-user-search community-user-search" onSubmit={(event) => void searchUsers(event)}><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="搜索昵称或完整用户编号" aria-label="搜索已注册用户"/><button type="submit" className="soft-button">搜索用户</button></form>
        {userResults.length > 0 && <div className="community-user-results">{userResults.map((candidate) => <button type="button" key={candidate.id} className={selectedUser?.id === candidate.id ? "selected" : ""} onClick={() => void chooseUser(candidate)}><span className="community-user-result-avatar"><UserRound size={15}/></span><span><strong>{candidate.nickname || "探索者"}</strong><small>{candidate.email || candidate.id}</small></span><BadgeCheck size={16}/></button>)}</div>}
        {selectedUser && <div className="community-user-certification"><div><strong>{selectedUser.nickname || "探索者"}</strong><small>{selectedUser.email || selectedUser.id}</small></div>{userAwards.map((award) => <div className="community-user-award" key={award.id}><span><BadgeCheck size={13}/>{award.badge.label}</span><button type="button" className="soft-button" disabled={busy} onClick={() => void revokeBadge(award.id)}>撤销</button></div>)}<label>授予认证标识<select defaultValue="" onChange={(event) => { const value = event.target.value; if (value) { void grantBadge(value); event.target.value = ""; } }}><option value="">选择要授予的认证</option>{(data?.badges || []).filter((badge) => badge.active && !userAwards.some((award) => award.badge.id === badge.id)).map((badge) => <option key={badge.id} value={badge.id}>{badge.label}</option>)}</select></label></div>}
      </section>

      <section className="community-access-panel"><h3><KeyRound size={16}/>生成邀请码或认证码</h3><p>两类码分开生成：邀请码在注册时兑换，固定授予「受邀入驻」并赠送 30 天 Pro；认证码供已注册用户兑换所选标签。</p>
        <form className="community-access-form" onSubmit={(event) => void createBatch(event)}>
          <label>码的用途<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="invitation">入驻邀请码 · Pro 30 天 + 受邀入驻</option><option value="certification">认证码 · 授予一个认证标识</option></select></label>
          {kind === "certification" && <label>认证标识<select required value={badgeId} onChange={(event) => setBadgeId(event.target.value)}>{(data?.badges || []).filter((badge) => badge.active).map((badge) => <option value={badge.id} key={badge.id}>{badge.label}</option>)}</select></label>}
          <label>批次名称<input required value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} placeholder={kind === "invitation" ? "例如：创作者入驻邀请" : "例如：创作认证第一批"} maxLength={100}/></label>
          <label>生成数量<input required type="number" min="1" max="500" value={quantity} onChange={(event) => setQuantity(event.target.value)}/></label>
          <label>有效期（可选）<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/></label>
          <button type="submit" disabled={busy || (kind === "certification" && !(data?.badges || []).some((badge) => badge.id === badgeId && badge.active))}>{busy ? "生成中…" : kind === "invitation" ? "生成入驻邀请码" : "生成认证码"}</button>
        </form>
        {generated && <div className="membership-admin-code-export"><strong>批次 {generated.batchId}</strong><small>明文只在生成后显示一次，数据库只保存哈希。请复制并安全保存。</small><textarea readOnly value={generated.codes.join("\n")} aria-label="一次性显示的邀请码"/><div><button type="button" onClick={() => void copyCodes()}><Clipboard size={14}/>复制明文码</button></div></div>}
        <div className="community-access-batches">{(data?.batches || []).map((batch) => <details key={batch.id}><summary><strong>{batch.label}</strong><span>{batch.code_kind === "invitation" ? "入驻邀请" : "认证"} · {batch.unused} 未使用 · {batch.redeemed} 已兑换 · {batch.disabled} 已停用</span></summary><small>{batch.quantity} 个 · {batch.active ? "批次启用" : "批次停用"}{batch.expires_at ? ` · 截止 ${new Date(batch.expires_at).toLocaleString("zh-CN")}` : ""}</small><button type="button" onClick={async () => { try { await cloudRequest(`/api/v1/admin/access-codes/batches/${batch.id}`, { active: !batch.active }, "PATCH"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "批次状态更新失败"); } }}>{batch.active ? "停用整个批次" : "恢复批次"}</button><div className="community-access-code-list">{batch.codes.map((code) => <div key={code.id}><span>{code.status === "unused" ? "未使用" : code.status === "redeemed" ? "已兑换" : "已停用"}<small>{code.id}</small></span>{code.status === "unused" && <button type="button" onClick={async () => { try { await cloudRequest(`/api/v1/admin/access-codes/${code.id}`, undefined, "DELETE"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "邀请码停用失败"); } }}>停用</button>}</div>)}</div></details>)}</div>
      </section>
      </>}

      {mode === "notices" && <section className="community-access-panel"><h3><Bell size={16}/>系统公告卡片</h3><p>用户会在通知中心收到卡片公告并查看历史和未读状态。可按会员档位或全站发送。</p>
        <form className="community-notice-form" onSubmit={(event) => void createNotice(event)}><label>标题<input required value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} maxLength={80}/></label><label>发送对象<select value={noticeAudience} disabled={Boolean(editingNoticeId)} onChange={(event) => setNoticeAudience(event.target.value)}><option value="all">所有用户</option><option value="free">Free 用户</option><option value="plus">Plus 会员</option><option value="pro">Pro 会员</option></select></label><label className="community-notice-body">卡片内容<textarea required value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} rows={5} maxLength={3000} placeholder="写下公告、活动提醒或重要说明"/></label><label>图片地址（可选）<input type="url" value={noticeImage} onChange={(event) => setNoticeImage(event.target.value)} placeholder="https://…"/></label><label>按钮文字（可选）<input value={noticeActionLabel} onChange={(event) => setNoticeActionLabel(event.target.value)} maxLength={24} placeholder="查看详情"/></label><label>按钮链接（可选）<input value={noticeActionUrl} onChange={(event) => setNoticeActionUrl(event.target.value)} maxLength={2048} placeholder="站内路径或 HTTPS 地址"/></label><button type="submit" disabled={busy || !noticeTitle.trim() || !noticeBody.trim()}>{busy ? "保存中…" : editingNoticeId ? "保存卡片编辑" : "发送官方通知"}</button>{editingNoticeId && <button type="button" className="soft-button" onClick={() => { setEditingNoticeId(null); setNoticeTitle(""); setNoticeBody(""); setNoticeImage(""); setNoticeActionLabel(""); setNoticeActionUrl(""); }}>取消编辑</button>}</form>
        <div className="community-notice-history">{notices.map((notice) => <article key={notice.id}><span>{audienceLabel(notice.audience)} · {new Date(notice.published_at).toLocaleString("zh-CN")}</span><h4>{notice.title}</h4><p>{notice.body}</p><button type="button" onClick={() => { setEditingNoticeId(notice.id); setNoticeTitle(notice.title); setNoticeBody(notice.body); setNoticeAudience(notice.audience); setNoticeImage(notice.image_url || ""); setNoticeActionLabel(notice.action_label || ""); setNoticeActionUrl(notice.action_url || ""); }}>编辑卡片</button></article>)}</div>
      </section>}
    </>}
  </div>;
}

function BadgeEditor({ badge, onSave, onToggle }: { badge: Badge; onSave: (badge: Badge) => void; onToggle: (badge: Badge) => void }) {
  const [label, setLabel] = useState(badge.label);
  const [description, setDescription] = useState(badge.description);
  const [color, setColor] = useState(badge.color);
  useEffect(() => { setLabel(badge.label); setDescription(badge.description); setColor(badge.color); }, [badge]);
  return <form className="community-badge-editor" onSubmit={(event) => { event.preventDefault(); onSave({ ...badge, label, description, color }); }}>
    <span className="community-badge-preview" style={{ "--profile-badge-color": color } as CSSProperties}>{label || badge.label}</span><small>{badge.slug}</small>
    <label>展示名称<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={24}/></label><label>说明<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120}/></label><label>颜色<input type="color" value={color} onChange={(event) => setColor(event.target.value)}/></label>
    <button type="submit">保存</button><button type="button" className="soft-button" onClick={() => onToggle(badge)}>{badge.active ? "停用" : "启用"}</button>
  </form>;
}
