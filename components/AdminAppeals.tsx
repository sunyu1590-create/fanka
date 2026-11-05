"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, ShieldAlert, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type Appeal = { id: string; appellant_id: string; target_type: string; target_id: string; target_title: string; reason: string; status: "open" | "accepted" | "rejected"; review_note: string | null; handled_at: string | null; created_at: string; profiles?: { nickname: string } | { nickname: string }[] | null };
type Result = { items: Appeal[]; total: number; page: number; limit: number };
const labels: Record<string, string> = { content: "作品下架", comment: "评论隐藏", report: "举报处理", account: "账号限制" };

export default function AdminAppeals({ canManageAccounts = false }: { canManageAccounts?: boolean }) {
  const [status, setStatus] = useState("open");
  const [items, setItems] = useState<Appeal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async (nextPage = 1, append = false) => {
    setBusy(true); setError("");
    try { const result = await cloudRequest(`/api/v1/admin/appeals?status=${status}&page=${nextPage}&limit=20`) as Result; setItems((current) => append ? [...current, ...result.items] : result.items || []); setTotal(result.total || 0); setPage(nextPage); }
    catch (e) { setError(e instanceof Error ? e.message : "申诉队列加载失败"); }
    finally { setBusy(false); }
  }, [status]);
  useEffect(() => { void load(1); }, [load]);
  const decide = async (appeal: Appeal, next: "accepted" | "rejected") => {
    const note = notes[appeal.id]?.trim() || "";
    if (note.length < 3) { setError("请填写至少 3 个字的处理说明"); return; }
    setSaving(appeal.id); setError(""); setNotice("");
    try { await cloudRequest("/api/v1/admin/appeals", { id: appeal.id, status: next, review_note: note }, "PATCH"); setNotice(next === "accepted" ? "申诉已通过，处理结果已记录并可由用户查看" : "申诉已驳回，处理结果已记录并可由用户查看"); setNotes((current) => ({ ...current, [appeal.id]: "" })); await load(page); }
    catch (e) { setError(e instanceof Error ? e.message : "申诉处理失败"); }
    finally { setSaving(null); }
  };
  return <section className="admin-appeals"><div className="admin-ai-workspace-head"><div><small>COMMUNITY / APPEALS</small><h2>申诉处理</h2><p>复核用户提交的内容、评论、举报与账号限制申诉，并留存处理记录。</p></div><button className="soft-button" disabled={busy} onClick={() => void load(1)}><RefreshCw size={14}/>刷新</button></div>
    <div className="moderation-filters" role="group" aria-label="申诉状态">{([["open", "待处理"], ["accepted", "已通过"], ["rejected", "已驳回"], ["all", "全部"]] as const).map(([value, label]) => <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>)}</div>
    {error && <p className="moderation-feedback error" role="alert">{error}</p>}{notice && <p className="moderation-feedback" role="status">{notice}</p>}
    {busy && !items.length ? <p className="moderation-empty">正在加载申诉记录…</p> : items.length ? <div className="moderation-list">{items.map((appeal) => { const profile = Array.isArray(appeal.profiles) ? appeal.profiles[0] : appeal.profiles; const accountDecisionBlocked = appeal.target_type === "account" && !canManageAccounts; return <article className="moderation-item" key={appeal.id}><div className="moderation-item-heading"><strong><ShieldAlert size={15}/> {labels[appeal.target_type] || "事项"} · {appeal.status === "open" ? "待复核" : appeal.status === "accepted" ? "已通过" : "已驳回"}</strong><time>{new Date(appeal.created_at).toLocaleString("zh-CN")}</time></div><p className="moderation-author">申诉人：{profile?.nickname || appeal.appellant_id.slice(0, 8)} · {appeal.appellant_id.slice(0, 8)}</p><strong className="moderation-submission-title">{appeal.target_title}</strong><p className="admin-appeal-reason">{appeal.reason}</p>{appeal.review_note && <p className="moderation-history"><strong>处理记录</strong> {appeal.review_note}{appeal.handled_at ? ` · ${new Date(appeal.handled_at).toLocaleString("zh-CN")}` : ""}</p>}{appeal.status === "open" && <>{accountDecisionBlocked && <p className="moderation-history">账号限制申诉需由超级管理员作出恢复决定。</p>}<label className="moderation-note">处理说明<textarea value={notes[appeal.id] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [appeal.id]: event.target.value }))} placeholder="说明复核结果，至少 3 个字"/></label><div className="moderation-actions">{!accountDecisionBlocked && <button disabled={saving === appeal.id} onClick={() => void decide(appeal, "accepted")}><Check size={15}/>申诉成立</button>}<button disabled={saving === appeal.id} onClick={() => void decide(appeal, "rejected")}><X size={15}/>申诉不成立</button></div></>}</article>; })}</div> : <p className="moderation-empty">当前没有符合条件的申诉。</p>}
    {items.length < total && <button className="comments-load-more" disabled={busy} onClick={() => void load(page + 1, true)}>加载更多（{items.length}/{total}）</button>}
  </section>;
}
