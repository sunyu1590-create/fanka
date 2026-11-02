"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import ChoiceSelect from "./ChoiceSelect";
import { userMessage } from "@/lib/user-message";

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
type AdminUser = { id: string; nickname: string; bio: string; role: "member" | "admin"; membership_tier: "free" | "plus" | "pro"; created_at: string; role_updated_at: string | null };
type DmReport = { id: string; reporter_id: string; user_id: string | null; message_id: string | null; reason: string; status: "open" | "resolved" | "dismissed"; created_at: string };
type Queue = { items: Report[]; total: number };
type Submissions = { items: Submission[]; total: number };
type Props = { onBack: () => void };

const filters = [["open", "待处理"], ["resolved", "已处理"], ["dismissed", "已驳回"], ["all", "全部"]] as const;

export default function AdminModeration({ onBack }: Props) {
  const [section, setSection] = useState<"reports" | "messages" | "content" | "users">("reports");
  const [status, setStatus] = useState<(typeof filters)[number][0]>("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [userTotal, setUserTotal] = useState(0);
  const [messageReports, setMessageReports] = useState<DmReport[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [appliedUserQuery, setAppliedUserQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reportData, contentData, accountSummary, dmReportData] = await Promise.all([
        cloudRequest(`/api/v1/admin/reports?status=${status}&limit=20`) as Promise<Queue>,
        cloudRequest("/api/v1/admin/posts?limit=20") as Promise<Submissions>,
        cloudRequest("/api/v1/admin/users?limit=1") as Promise<{ total: number }>,
        cloudRequest("/api/v1/admin/message-reports") as Promise<DmReport[]>,
      ]);
      setReports(reportData.items || []);
      setReportTotal(reportData.total || 0);
      setSubmissions(contentData.items || []);
      setSubmissionTotal(contentData.total || 0);
      setUserTotal(accountSummary.total || 0);
      setMessageReports(dmReportData || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核队列加载失败");
    } finally {
      setLoading(false);
    }
  }, [status]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true); setError("");
    try {
      const result = await cloudRequest(`/api/v1/admin/users?limit=50${appliedUserQuery ? `&query=${encodeURIComponent(appliedUserQuery)}` : ""}`) as { items: AdminUser[]; total: number };
      setUsers(result.items || []);
    } catch (e) { setError(e instanceof Error ? e.message : "账号列表加载失败"); }
    finally { setUsersLoading(false); }
  }, [appliedUserQuery]);

  useEffect(() => { if (section === "users") void loadUsers(); }, [section, loadUsers]);

  const changeUserRole = async (account: AdminUser) => {
    const role = account.role === "admin" ? "member" : "admin";
    const action = role === "admin" ? "授予管理员权限" : "移除管理员权限";
    if (!window.confirm(`确定要${action}给「${account.nickname || "探索者"}」吗？`)) return;
    setSaving(account.id); setError(""); setNotice("");
    try {
      await cloudRequest(`/api/v1/admin/users/${account.id}`, { role }, "PATCH");
      setNotice(`${account.nickname || "账号"}的权限已更新。`);
      await loadUsers();
    } catch (e) { setError(e instanceof Error ? e.message : "账号权限更新失败"); }
    finally { setSaving(null); }
  };

  const changeMembershipTier = async (account: AdminUser, membership_tier: AdminUser["membership_tier"]) => {
    setSaving(account.id); setError(""); setNotice("");
    try {
      await cloudRequest(`/api/v1/admin/users/${account.id}`, { membership_tier }, "PATCH");
      setUsers((current) => current.map((item) => item.id === account.id ? { ...item, membership_tier } : item));
      setNotice(`${account.nickname || "探索者"} 的会员等级已更新。`);
    } catch (e) { setError(e instanceof Error ? e.message : "会员等级更新失败"); }
    finally { setSaving(null); }
  };

  const processMessageReport = async (report: DmReport, next: "resolved" | "dismissed") => {
    setSaving(report.id); setError(""); setNotice("");
    try {
      await cloudRequest("/api/v1/admin/message-reports", { id: report.id, status: next }, "PATCH");
      setNotice(next === "resolved" ? "私信举报已处理。" : "私信举报已驳回。");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "处理失败"); }
    finally { setSaving(null); }
  };

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
    <div className="eyebrow">HEIKA / ADMINISTRATION</div>
    <h1>管理后台<span className="red-dot">.</span></h1>
    <p className="lead">账号、内容与社区举报的运营管理。</p>
    <div className="admin-overview" aria-label="后台概览">
      <div><strong>{userTotal}</strong><span>账号</span></div>
      <div><strong>{submissionTotal}</strong><span>待审核内容</span></div>
      <div><strong>{reportTotal + messageReports.filter((item) => item.status === "open").length}</strong><span>待处理举报</span></div>
    </div>
    <div className="moderation-tabs" role="tablist" aria-label="审核类型">
      <button role="tab" aria-selected={section === "reports"} className={section === "reports" ? "selected" : ""} onClick={() => setSection("reports")}>举报队列 <small>{reportTotal}</small></button>
      <button role="tab" aria-selected={section === "messages"} className={section === "messages" ? "selected" : ""} onClick={() => setSection("messages")}>私信举报 <small>{messageReports.filter((item) => item.status === "open").length}</small></button>
      <button role="tab" aria-selected={section === "content"} className={section === "content" ? "selected" : ""} onClick={() => setSection("content")}>待审核内容 <small>{submissionTotal}</small></button>
      <button role="tab" aria-selected={section === "users"} className={section === "users" ? "selected" : ""} onClick={() => setSection("users")}>账号管理 <small>{userTotal}</small></button>
      <button className="moderation-refresh" aria-label="刷新队列" onClick={() => section === "users" ? void loadUsers() : void load()} disabled={loading || usersLoading}><RefreshCw size={16} /></button>
    </div>
    {section === "reports" && <div className="moderation-filters" role="group" aria-label="举报状态">
      {filters.map(([value, label]) => <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>)}
    </div>}
    {error && <p className="moderation-feedback error animated-notice" role="alert">{userMessage(error, "管理操作失败，请稍后重试")}</p>}
    {notice && <p className="moderation-feedback animated-notice" role="status">{userMessage(notice)}</p>}
    {section === "users" ? <>
      <form className="admin-user-search" onSubmit={(event) => { event.preventDefault(); setAppliedUserQuery(userQuery.trim()); }}>
        <input aria-label="搜索账号昵称" placeholder="按昵称搜索账号" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} />
        <button className="soft-button" type="submit">搜索</button>
      </form>
      {usersLoading ? <p className="moderation-empty">正在加载账号…</p> : users.length ? <div className="admin-user-list">{users.map((account) => <article className="admin-user-row" key={account.id}>
        <div className="admin-user-avatar" aria-hidden="true">{(account.nickname || "探").slice(0, 1)}</div>
        <div className="admin-user-copy"><strong>{account.nickname || "探索者"}{account.role === "admin" && <span className="admin-role-badge">管理员</span>}</strong><small>{account.bio || "还没有填写个人简介"}</small><time>加入于 {new Date(account.created_at).toLocaleDateString("zh-CN")}</time></div>
        <div className="admin-user-membership"><span>会员</span><ChoiceSelect label={`${account.nickname || "探索者"}的会员等级`} value={account.membership_tier || "free"} disabled={saving === account.id} options={[{value:"free",label:"普通"},{value:"plus",label:"Plus"},{value:"pro",label:"Pro"}]} onChange={(tier) => void changeMembershipTier(account, tier as AdminUser["membership_tier"])}/></div>
        <button className="admin-role-action" disabled={saving === account.id} onClick={() => void changeUserRole(account)}>{account.role === "admin" ? "设为成员" : "设为管理员"}</button>
      </article>)}</div> : <p className="moderation-empty">没有找到匹配的账号。</p>}
      {userTotal > users.length && !appliedUserQuery && <p className="admin-user-limit">当前显示最近 {users.length} 个账号，共 {userTotal} 个。</p>}
    </> : loading ? <p className="moderation-empty">正在加载管理数据…</p> : section === "messages" ? (
      messageReports.length ? <div className="moderation-list">{messageReports.map((report) => <article className="moderation-item" key={report.id}>
        <div className="moderation-item-heading"><strong>私信举报 · {report.status === "open" ? "待处理" : report.status === "resolved" ? "已处理" : "已驳回"}</strong><time>{new Date(report.created_at).toLocaleString("zh-CN")}</time></div>
        <p className="moderation-reason"><strong>举报原因</strong> {report.reason}</p>
        <p className="moderation-author">被举报账号：{report.user_id ? report.user_id.slice(0, 8) : "未指定"} · 举报账号：{report.reporter_id.slice(0, 8)}</p>
        {report.status === "open" && <div className="moderation-actions"><button disabled={saving === report.id} onClick={() => void processMessageReport(report, "resolved")}><Check size={15} /> 标记已处理</button><button disabled={saving === report.id} onClick={() => void processMessageReport(report, "dismissed")}><X size={15} /> 驳回举报</button></div>}
      </article>)}</div> : <p className="moderation-empty">当前没有私信举报。</p>
    ) : section === "reports" ? (
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
