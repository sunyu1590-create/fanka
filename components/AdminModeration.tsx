"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type Report = {
  id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  review_note: string | null;
  reviewed_at: string | null;
  target: { type: "post" | "comment"; title: string; body: string; status: string; images: string[] };
};
type Submission = { id: string; title: string; body: string; author: string; created_at: string; images: string[] };
type Queue = { items: Report[]; total: number };
type Submissions = { items: Submission[]; total: number };
type Props = { onBack: () => void };

const filters = [["open", "待处理"], ["resolved", "已处理"], ["dismissed", "已驳回"], ["all", "全部"]] as const;

export default function AdminModeration({ onBack }: Props) {
  const [section, setSection] = useState<"reports" | "content">("reports");
  const [status, setStatus] = useState<(typeof filters)[number][0]>("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reportData, contentData] = await Promise.all([
        cloudRequest(`/api/v1/admin/reports?status=${status}&limit=20`) as Promise<Queue>,
        cloudRequest("/api/v1/admin/posts?limit=20") as Promise<Submissions>,
      ]);
      setReports(reportData.items || []);
      setReportTotal(reportData.total || 0);
      setSubmissions(contentData.items || []);
      setSubmissionTotal(contentData.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核队列加载失败");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const processReport = async (report: Report, next: "resolved" | "dismissed") => {
    const note = notes[report.id]?.trim() || "";
    if (note.length < 3) { setError("请填写至少 3 个字的处理说明"); return; }
    setSaving(report.id); setError("");
    try {
      await cloudRequest(`/api/v1/admin/reports/${report.id}`, { status: next, review_note: note }, "PATCH");
      setNotice(next === "resolved" ? "举报已标记为处理完成" : "举报已驳回");
      setNotes((current) => ({ ...current, [report.id]: "" }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "处理失败"); }
    finally { setSaving(null); }
  };

  const processSubmission = async (post: Submission, next: "published" | "hidden") => {
    const note = notes[post.id]?.trim() || "";
    if (note.length < 3) { setError("请填写至少 3 个字的审核说明"); return; }
    setSaving(post.id); setError("");
    try {
      await cloudRequest(`/api/v1/admin/posts/${post.id}`, { status: next, review_note: note }, "PATCH");
      setNotice(next === "published" ? "内容已审核并公开" : "内容已驳回并保持隐藏");
      setNotes((current) => ({ ...current, [post.id]: "" }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "审核失败"); }
    finally { setSaving(null); }
  };

  return <section className="page moderation-page">
    <button className="back settings-back" onClick={onBack}><ArrowLeft size={18} /> 设置</button>
    <div className="eyebrow">HEIKA / TRUST & SAFETY</div>
    <h1>内容审核<span className="red-dot">.</span></h1>
    <p className="lead">举报与新发布内容均由管理员人工复核。图片未接入自动识别。</p>
    <div className="moderation-tabs" role="tablist" aria-label="审核类型">
      <button role="tab" aria-selected={section === "reports"} className={section === "reports" ? "selected" : ""} onClick={() => setSection("reports")}>举报队列 <small>{reportTotal}</small></button>
      <button role="tab" aria-selected={section === "content"} className={section === "content" ? "selected" : ""} onClick={() => setSection("content")}>待审核内容 <small>{submissionTotal}</small></button>
      <button className="moderation-refresh" aria-label="刷新队列" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /></button>
    </div>
    {section === "reports" && <div className="moderation-filters" role="group" aria-label="举报状态">
      {filters.map(([value, label]) => <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>)}
    </div>}
    {error && <p className="moderation-feedback error" role="alert">{error}</p>}
    {notice && <p className="moderation-feedback" role="status">{notice}</p>}
    {loading ? <p className="moderation-empty">正在加载审核队列…</p> : section === "reports" ? (
      reports.length ? <div className="moderation-list">{reports.map((report) => <article className="moderation-item" key={report.id}>
        <div className="moderation-item-heading"><strong>{report.target.type === "post" ? "内容举报" : "评论举报"}</strong><time>{new Date(report.created_at).toLocaleString("zh-CN")}</time></div>
        <div className="moderation-target"><b>{report.target.title}</b><p>{report.target.body}</p>{report.target.images.map((url) => <img key={url} src={url} alt="被举报内容图片" loading="lazy" />)}</div>
        <p className="moderation-reason"><strong>举报原因</strong> {report.reason}</p>
        {report.review_note && <p className="moderation-history"><strong>处理记录</strong> {report.review_note}{report.reviewed_at ? ` · ${new Date(report.reviewed_at).toLocaleString("zh-CN")}` : ""}</p>}
        {report.status === "open" && <><label className="moderation-note">处理说明<textarea value={notes[report.id] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="记录处理依据，至少 3 个字" /></label><div className="moderation-actions"><button disabled={saving === report.id} onClick={() => void processReport(report, "resolved")}><Check size={15} /> 标记已处理</button><button disabled={saving === report.id} onClick={() => void processReport(report, "dismissed")}><X size={15} /> 驳回举报</button></div></>}
      </article>)}</div> : <p className="moderation-empty">当前没有符合条件的举报。</p>
    ) : submissions.length ? <div className="moderation-list">{submissions.map((post) => <article className="moderation-item" key={post.id}>
      <div className="moderation-item-heading"><strong><ShieldCheck size={16} /> 待人工审核</strong><time>{new Date(post.created_at).toLocaleString("zh-CN")}</time></div>
      <h2>{post.title}</h2><p className="moderation-author">作者：{post.author}</p><p className="moderation-copy">{post.body}</p>
      <div className="moderation-images">{post.images.map((url) => <img key={url} src={url} alt="待审核内容图片" loading="lazy" />)}</div>
      <label className="moderation-note">审核说明<textarea value={notes[post.id] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="记录审核依据，至少 3 个字" /></label>
      <div className="moderation-actions"><button disabled={saving === post.id} onClick={() => void processSubmission(post, "published")}><Check size={15} /> 审核通过并公开</button><button disabled={saving === post.id} onClick={() => void processSubmission(post, "hidden")}><X size={15} /> 驳回并保持隐藏</button></div>
    </article>)}</div> : <p className="moderation-empty">目前没有待审核的新内容。</p>}
  </section>;
}
