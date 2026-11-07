"use client";

import { useCallback, useEffect, useState } from "react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";

type Item = { id: string; user_id: string | null; category: "suggestion" | "problem" | "other"; message: string; status: "open" | "in_progress" | "resolved" | "dismissed"; review_note: string | null; attachment_url?: string | null; created_at: string };
const categoryName = { suggestion: "功能建议", problem: "使用问题", other: "其他反馈" };
const statusName = { open: "待处理", in_progress: "处理中", resolved: "已解决", dismissed: "已归档" };

export default function FeedbackAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await cloudFetch(`/api/v1/admin/user-feedback?status=${status}&page=${page}&limit=20`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "反馈加载失败");
      setItems(result.data.items || []); setTotal(result.data.total || 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "反馈加载失败"); }
  }, [status, page]);
  useEffect(() => { void load(); }, [load]);
  const update = async (id: string, nextStatus: Item["status"]) => {
    setBusy(id); setError("");
    try {
      await cloudRequest(`/api/v1/admin/user-feedback/${id}`, { status: nextStatus, review_note: notes[id] || "" }, "PATCH");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "处理失败"); }
    finally { setBusy(""); }
  };
  return <div className="feedback-admin">
    <label className="feedback-filter">处理状态<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="open">待处理</option><option value="in_progress">处理中</option><option value="resolved">已解决</option><option value="dismissed">已归档</option><option value="all">全部</option></select></label>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {!items.length && !error ? <p className="settings-note">当前没有反馈。</p> : <div className="feedback-admin-list">{items.map((item) => <article className="feedback-admin-item" key={item.id}>
      <div className="feedback-admin-meta"><span>{categoryName[item.category]}</span><span>{statusName[item.status]}</span><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></div>
      <p>{item.message}</p>{item.attachment_url && <a href={item.attachment_url} target="_blank" rel="noreferrer"><img className="feedback-admin-attachment" src={item.attachment_url} alt="用户反馈附件"/></a>}<small>提交者：{item.user_id ? item.user_id.slice(0, 8) : "账号已删除"}</small>
      <textarea value={notes[item.id] ?? item.review_note ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="处理说明（可选）" />
      <div className="feedback-admin-actions"><button type="button" disabled={busy === item.id} onClick={() => void update(item.id, "in_progress")}>处理中</button><button type="button" disabled={busy === item.id} onClick={() => void update(item.id, "resolved")}>标记已解决</button><button type="button" disabled={busy === item.id} onClick={() => void update(item.id, "dismissed")}>归档</button></div>
    </article>)}</div>}
    <div className="feedback-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>上一页</button><span>{page} / {Math.max(1, Math.ceil(total / 20))}</span><button type="button" disabled={page * 20 >= total} onClick={() => setPage((n) => n + 1)}>下一页</button></div>
  </div>;
}
