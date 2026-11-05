"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, ChevronRight, FileCheck, Flag, MessageCircle, MessageSquare, RefreshCw, ScrollText, ShieldCheck, Sparkles, Tags, Users, X, type LucideIcon } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import ChoiceSelect from "./ChoiceSelect";
import { userMessage } from "@/lib/user-message";
import { MarkdownContent } from "./MarkdownContent";
import AdminGovernance from "./AdminGovernance";

type Report = {
  id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  review_note: string | null;
  reviewed_at: string | null;
  target: { type: "post" | "comment"; title: string; body: string; status: string; images: string[]; videos?: string[] };
};
type Submission = { id: string; title: string; body: string; author: string; created_at: string; images: string[]; videos?: string[]; kind?: "new" | "revision"; originalTitle?: string | null };
type AdminUser = { id: string; nickname: string; bio: string; role: "member" | "admin"; membership_tier: "free" | "plus" | "pro"; created_at: string; role_updated_at: string | null; community_restriction: { active: boolean; restricted_until: string | null; reason: string } | null };
type DmReport = { id: string; reporter_id: string; user_id: string | null; message_id: string | null; reason: string; status: "open" | "resolved" | "dismissed"; created_at: string };
type TopicTag = { id: number; name: string };
type TopicEventAdmin = { id: string; topic_id: number; title: string; description: string; starts_at: string; ends_at: string; is_active: boolean; interest_tags?: { name: string } | { name: string }[] | null };
type Queue = { items: Report[]; total: number };
type Submissions = { items: Submission[]; total: number };
type Props = { onBack: () => void };
type AdminSection = "overview" | "reports" | "messages" | "content" | "comments" | "keywords" | "audit" | "users" | "topic-events" | "ai-settings";
type AdminModule = { id: Exclude<AdminSection, "overview">; title: string; description: string; icon: LucideIcon };

const filters = [["open", "待处理"], ["resolved", "已处理"], ["dismissed", "已驳回"], ["all", "全部"]] as const;
const localDateTime = (value: Date) => { const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); };
const adminModuleGroups: { title: string; modules: AdminModule[] }[] = [
  { title: "审核与举报", modules: [
    { id: "content", title: "作品审核", description: "新投稿与已发布作品的修改", icon: FileCheck },
    { id: "reports", title: "内容举报", description: "查看并处理作品与评论举报", icon: Flag },
    { id: "messages", title: "私信举报", description: "处理用户提交的私信举报", icon: MessageCircle },
  ] },
  { title: "社区治理", modules: [
    { id: "comments", title: "评论管理", description: "搜索、隐藏或恢复评论", icon: MessageSquare },
    { id: "keywords", title: "关键词规则", description: "管理发布与互动拦截规则", icon: Tags },
    { id: "topic-events", title: "话题共创", description: "创建和管理社区共创活动", icon: Sparkles },
    { id: "audit", title: "操作记录", description: "查看管理员处理历史", icon: ScrollText },
  ] },
  { title: "账号与工具", modules: [
    { id: "users", title: "账号管理", description: "角色、会员与社区发言限制", icon: Users },
    { id: "ai-settings", title: "AI 工作台", description: "配置创作工作台服务密钥", icon: ShieldCheck },
  ] },
];
const adminSectionTitles: Record<Exclude<AdminSection, "overview">, string> = {
  reports: "内容举报",
  messages: "私信举报",
  content: "作品审核",
  comments: "评论管理",
  keywords: "关键词规则",
  audit: "操作记录",
  users: "账号管理",
  "topic-events": "话题共创",
  "ai-settings": "AI 工作台",
};

function CollapsibleMarkdown({ source, label }: { source: string; label: string }) {
  const [open, setOpen] = useState(false);
  return <details className="moderation-longtext" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{open ? "收起" : label} · {source.length} 字</summary>{open && <MarkdownContent source={source} className="moderation-markdown"/>}</details>;
}

function CollapsibleImages({ images, label }: { images: string[]; label: string }) {
  if (!images.length) return null;
  return <details className="moderation-image-details"><summary>{label} · {images.length} 张</summary><div className="moderation-images">{images.map((url, index) => <img key={`${index}-${url}`} src={url} alt={`${label}，第 ${index + 1} 张`} loading="lazy" onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }} />)}</div></details>;
}

function CollapsibleVideos({ videos, label }: { videos: string[]; label: string }) {
  if (!videos.length) return null;
  return <details className="moderation-image-details"><summary>{label} · {videos.length} 段</summary><div className="moderation-images">{videos.map((url) => <video key={url} src={url} controls preload="metadata" aria-label={label} />)}</div></details>;
}

export default function AdminModeration({ onBack }: Props) {
  const [section, setSection] = useState<AdminSection>("overview");
  const [status, setStatus] = useState<(typeof filters)[number][0]>("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pendingReportTotal, setPendingReportTotal] = useState(0);
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
  const [topicEvents, setTopicEvents] = useState<TopicEventAdmin[]>([]);
  const [topicTags, setTopicTags] = useState<TopicTag[]>([]);
  const [topicEventBusy, setTopicEventBusy] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TopicEventAdmin | null>(null);
  const [eventTopic, setEventTopic] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStarts, setEventStarts] = useState(() => localDateTime(new Date()));
  const [eventEnds, setEventEnds] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 30); return localDateTime(date); });
  const [aiKey, setAiKey] = useState("");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiMasked, setAiMasked] = useState("");
  const [aiSettingsBusy, setAiSettingsBusy] = useState(false);
  const [restrictionTarget, setRestrictionTarget] = useState<string | null>(null);
  const [restrictionReason, setRestrictionReason] = useState("");
  const [restrictionDuration, setRestrictionDuration] = useState<"1h" | "24h" | "7d" | "30d" | "permanent">("24h");
  const [governanceRefreshKey, setGovernanceRefreshKey] = useState(0);

  const loadTopicEvents = useCallback(async () => {
    setTopicEventBusy(true); setError("");
    try {
      const result = await cloudRequest("/api/v1/admin/topic-events") as { items: TopicEventAdmin[]; topics: TopicTag[] };
      setTopicEvents(result.items || []); setTopicTags(result.topics || []);
      if (!eventTopic && result.topics?.[0]) setEventTopic(String(result.topics[0].id));
    } catch (e) { setError(e instanceof Error ? e.message : "共创活动加载失败"); }
    finally { setTopicEventBusy(false); }
  }, [eventTopic]);

  useEffect(() => { if (section === "topic-events") void loadTopicEvents(); }, [section, loadTopicEvents]);
  const loadAiSettings = useCallback(async () => {
    setAiSettingsBusy(true); setError("");
    try { const result = await cloudRequest("/api/v1/admin/ai-settings") as { configured: boolean; masked: string }; setAiConfigured(result.configured); setAiMasked(result.masked); }
    catch (e) { setError(e instanceof Error ? e.message : "AI 设置读取失败"); }
    finally { setAiSettingsBusy(false); }
  }, []);
  useEffect(() => { if (section === "ai-settings") void loadAiSettings(); }, [section, loadAiSettings]);
  const saveAiSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!aiKey.trim()) { setError("请输入 DeepSeek API 密钥"); return; }
    setAiSettingsBusy(true); setError(""); setNotice("");
    try { await cloudRequest("/api/v1/admin/ai-settings", { key: aiKey.trim() }); setAiKey(""); setAiConfigured(true); await loadAiSettings(); setNotice("DeepSeek 密钥已加密保存到私有云存储。"); }
    catch (e) { setError(e instanceof Error ? e.message : "AI 密钥保存失败"); }
    finally { setAiSettingsBusy(false); }
  };
  const removeAiSettings = async () => {
    if (!window.confirm("确定删除云端 DeepSeek 密钥吗？删除后 AI 工作台将暂停服务。")) return;
    setAiSettingsBusy(true); setError(""); setNotice("");
    try { await cloudRequest("/api/v1/admin/ai-settings", { action: "delete" }); setAiConfigured(false); setAiMasked(""); setNotice("云端 AI 密钥已删除。"); }
    catch (e) { setError(e instanceof Error ? e.message : "AI 密钥删除失败"); }
    finally { setAiSettingsBusy(false); }
  };

  const resetTopicEventForm = () => {
    setEditingEvent(null); setEventTitle(""); setEventDescription("");
    const start = new Date(); const end = new Date(); end.setDate(end.getDate() + 30);
    setEventStarts(localDateTime(start)); setEventEnds(localDateTime(end));
  };
  const editTopicEvent = (event: TopicEventAdmin) => {
    setEditingEvent(event); setEventTopic(String(event.topic_id)); setEventTitle(event.title); setEventDescription(event.description);
    setEventStarts(localDateTime(new Date(event.starts_at))); setEventEnds(localDateTime(new Date(event.ends_at)));
  };
  const saveTopicEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!eventTopic || !eventTitle.trim() || !eventDescription.trim()) { setError("请完整填写共创活动信息"); return; }
    if (new Date(eventEnds) <= new Date(eventStarts)) { setError("结束时间需要晚于开始时间"); return; }
    setTopicEventBusy(true); setError(""); setNotice("");
    try {
      const selected = topicTags.find((item) => String(item.id) === eventTopic);
      if (!selected) throw new Error("请选择有效话题");
      await cloudRequest("/api/v1/admin/topic-events", { id: editingEvent?.id, topic: selected.name, title: eventTitle, description: eventDescription, starts_at: new Date(eventStarts).toISOString(), ends_at: new Date(eventEnds).toISOString(), is_active: editingEvent?.is_active ?? true });
      setNotice(editingEvent ? "共创活动已更新。" : "共创活动已创建。"); resetTopicEventForm(); await loadTopicEvents();
    } catch (e) { setError(e instanceof Error ? e.message : "保存共创活动失败"); }
    finally { setTopicEventBusy(false); }
  };
  const toggleTopicEvent = async (event: TopicEventAdmin) => {
    const topic = topicTags.find((item) => item.id === event.topic_id);
    if (!topic) { setError("活动话题无效，请重新编辑后保存"); return; }
    setSaving(event.id); setError(""); setNotice("");
    try {
      await cloudRequest("/api/v1/admin/topic-events", { id: event.id, topic: topic.name, title: event.title, description: event.description, starts_at: event.starts_at, ends_at: event.ends_at, is_active: !event.is_active });
      setNotice(!event.is_active ? "活动已上线。" : "活动已下线，历史参与记录已保留。"); await loadTopicEvents();
    } catch (e) { setError(e instanceof Error ? e.message : "活动状态更新失败"); }
    finally { setSaving(null); }
  };

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
      if (status === "open") setPendingReportTotal(reportData.total || 0);
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

  const changeCommunityRestriction = async (account: AdminUser, active: boolean) => {
    if (active && restrictionReason.trim().length < 3) { setError("请填写至少 3 个字的限制原因"); return; }
    const durations: Record<Exclude<typeof restrictionDuration, "permanent">, number> = { "1h": 60 * 60_000, "24h": 24 * 60 * 60_000, "7d": 7 * 24 * 60 * 60_000, "30d": 30 * 24 * 60 * 60_000 };
    const restricted_until = !active || restrictionDuration === "permanent" ? null : new Date(Date.now() + durations[restrictionDuration]).toISOString();
    setSaving(account.id); setError(""); setNotice("");
    try {
      const result = await cloudRequest(`/api/v1/admin/users/${account.id}`, { community_restriction: active ? { active: true, restricted_until, reason: restrictionReason.trim() } : { active: false } }, "PATCH") as { community_restriction?: AdminUser["community_restriction"] };
      setUsers((current) => current.map((item) => item.id === account.id ? { ...item, community_restriction: result.community_restriction ?? null } : item));
      setRestrictionTarget(null); setRestrictionReason(""); setNotice(active ? `${account.nickname || "账号"}已限制发布、评论和私信。` : `${account.nickname || "账号"}的社区限制已解除。`);
    } catch (e) { setError(userMessage(e, "账号限制更新失败")); }
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
      setNotice(post.kind === "revision" ? next === "published" ? "修改已审核并替换公开版本" : "修改已驳回，原公开版本保持不变" : next === "published" ? "内容已审核并公开" : "内容已驳回并保持隐藏");
      setNotes((current) => ({ ...current, [post.id]: "" }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "审核失败"); }
    finally { setSaving(null); }
  };

  const pendingMessageReports = messageReports.filter((item) => item.status === "open").length;
  const navigateAdminSection = (next: AdminSection) => {
    setSection(next);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const refreshCurrent = () => {
    if (section === "users") void loadUsers();
    else if (section === "topic-events") void loadTopicEvents();
    else if (section === "ai-settings") void loadAiSettings();
    else if (section === "comments" || section === "keywords" || section === "audit") setGovernanceRefreshKey((value) => value + 1);
    else void load();
  };

  return <section className="page moderation-page">
    <button className="back settings-back" onClick={onBack}><ArrowLeft size={18} /> 设置</button>
    <div className="eyebrow">HEIKA / ADMINISTRATION</div>
    <h1>{section === "overview" ? "管理后台" : adminSectionTitles[section]}<span className="red-dot">.</span></h1>
    <p className="lead">{section === "overview" ? "按工作模块进入审核与管理，待处理事项优先显示。" : `管理后台 / ${adminSectionTitles[section]}`}</p>
    {section === "overview" ? <>
      <div className="admin-overview" aria-label="后台概览">
        <div><strong>{userTotal}</strong><span>账号总数</span></div>
        <div><strong>{submissionTotal}</strong><span>待审核作品</span></div>
        <div><strong>{pendingReportTotal + pendingMessageReports}</strong><span>待处理举报</span></div>
      </div>
      <div className="admin-module-groups">
        <div className="admin-module-heading"><div><small>WORKSPACE</small><strong>管理模块</strong></div><button type="button" className="soft-button" onClick={refreshCurrent} disabled={loading}><RefreshCw size={14}/>刷新</button></div>
        {adminModuleGroups.map((group) => <section className="admin-module-group" key={group.title} aria-label={group.title}>
          <h2>{group.title}</h2>
          <div className="admin-module-grid">{group.modules.map((module) => {
            const Icon = module.icon;
            const count = module.id === "content" ? submissionTotal : module.id === "reports" ? pendingReportTotal : module.id === "messages" ? pendingMessageReports : null;
            return <button type="button" className="admin-module-card" key={module.id} onClick={() => navigateAdminSection(module.id)}>
              <span className="admin-module-icon"><Icon size={19}/></span>
              <span className="admin-module-copy"><strong>{module.title}</strong><small>{module.description}</small>{count !== null && <em>{count ? `${count} 项待处理` : "暂无待处理"}</em>}</span>
              <ChevronRight size={17}/>
            </button>;
          })}</div>
        </section>)}
      </div>
    </> : <div className="admin-workspace-nav">
      <button type="button" onClick={() => navigateAdminSection("overview")}><ArrowLeft size={16}/> 管理台</button>
      <span>{adminSectionTitles[section]}</span>
      <button type="button" className="admin-workspace-refresh" aria-label={`刷新${adminSectionTitles[section]}`} onClick={refreshCurrent} disabled={loading || usersLoading || topicEventBusy || aiSettingsBusy}><RefreshCw size={15}/> 刷新</button>
    </div>}
    {section === "reports" && <div className="moderation-filters" role="group" aria-label="举报状态">
      {filters.map(([value, label]) => <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>)}
    </div>}
    {error && <p className="moderation-feedback error animated-notice" role="alert">{userMessage(error, "管理操作失败，请稍后重试")}</p>}
    {notice && <p className="moderation-feedback animated-notice" role="status">{userMessage(notice)}</p>}
    {section === "overview" ? null : section === "keywords" ? <AdminGovernance key={`keywords-${governanceRefreshKey}`} mode="keywords" /> : section === "comments" ? <AdminGovernance key={`comments-${governanceRefreshKey}`} mode="comments" /> : section === "audit" ? <AdminGovernance key={`audit-${governanceRefreshKey}`} mode="audit" /> : section === "ai-settings" ? <>
      <form className="admin-topic-event-form admin-ai-settings" onSubmit={(event) => void saveAiSettings(event)}>
        <div className="admin-topic-event-form-heading"><div><small>AI / PROVIDER</small><h2>DeepSeek 密钥</h2></div><span className={`admin-ai-status${aiConfigured ? " configured" : ""}`}>{aiSettingsBusy ? "读取中" : aiConfigured ? "已配置" : "未配置"}</span></div>
        {aiConfigured && <p className="admin-ai-masked">当前密钥：{aiMasked}</p>}
        <p>密钥使用 AES-256-GCM 加密后保存在 Vercel 私有云存储。只有服务端可读取明文，页面不会回显密钥。</p>
        <label>API 密钥<input type="password" autoComplete="new-password" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder={aiConfigured ? "已配置，输入新密钥可替换" : "粘贴 DeepSeek API 密钥"} /></label>
        <button className="primary-button full" disabled={aiSettingsBusy || !aiKey.trim()}>{aiSettingsBusy ? "正在加密保存…" : aiConfigured ? "更换并保存密钥" : "加密保存密钥"}</button>
        {aiConfigured && <button type="button" className="soft-button" disabled={aiSettingsBusy} onClick={() => void removeAiSettings()}>删除云端密钥</button>}
        <small>推荐仅在可信设备上操作。更换后所有用户的 AI 创作工作台会立即使用新密钥。</small>
      </form>
    </> : section === "topic-events" ? <>
      <form className="admin-topic-event-form" onSubmit={(event) => void saveTopicEvent(event)}>
        <div className="admin-topic-event-form-heading"><div><small>COMMUNITY / OPEN CALL</small><h2>{editingEvent ? "编辑共创活动" : "新增共创活动"}</h2></div>{editingEvent && <button type="button" className="soft-button" onClick={resetTopicEventForm}>取消编辑</button>}</div>
        <label>关联话题<select required value={eventTopic} onChange={(event) => setEventTopic(event.target.value)}><option value="" disabled>选择一个话题</option>{topicTags.map((topic) => <option key={topic.id} value={topic.id}>#{topic.name}</option>)}</select></label>
        <label>活动标题<input required minLength={4} maxLength={80} value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="例如：本月共创 · 给生活留一点空白" /></label>
        <label>活动说明<textarea required minLength={8} maxLength={500} value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} placeholder="说明创作方向与参与方式" /></label>
        <div className="admin-topic-event-dates"><label>开始时间<input required type="datetime-local" value={eventStarts} onChange={(event) => setEventStarts(event.target.value)} /></label><label>结束时间<input required type="datetime-local" value={eventEnds} onChange={(event) => setEventEnds(event.target.value)} /></label></div>
        <button className="primary-button full" disabled={topicEventBusy}>{topicEventBusy ? "正在保存…" : editingEvent ? "保存活动" : "创建活动"}</button>
      </form>
      <div className="admin-topic-event-list"><div className="creator-subheading"><h2>活动管理</h2><span>{topicEvents.length} 项</span></div>
        {topicEventBusy && !topicEvents.length ? <p className="moderation-empty">正在加载共创活动…</p> : topicEvents.length ? topicEvents.map((event) => { const topic = Array.isArray(event.interest_tags) ? event.interest_tags[0]?.name : event.interest_tags?.name || topicTags.find((item) => item.id === event.topic_id)?.name; return <article className="admin-topic-event-row" key={event.id}>
          <div><span>#{topic || "话题"} · {event.is_active ? "已上线" : "已下线"}</span><strong>{event.title}</strong><p>{event.description}</p><small>{new Date(event.starts_at).toLocaleString("zh-CN")} — {new Date(event.ends_at).toLocaleString("zh-CN")}</small></div>
          <div className="admin-topic-event-actions"><button type="button" className="soft-button" onClick={() => editTopicEvent(event)}>编辑</button><button type="button" className="soft-button" disabled={saving === event.id} onClick={() => void toggleTopicEvent(event)}>{saving === event.id ? "保存中" : event.is_active ? "下线" : "上线"}</button></div>
        </article>; }) : <p className="moderation-empty">还没有共创活动，填写上方表单来创建。</p>}
      </div>
    </> : section === "users" ? <>
      <form className="admin-user-search" onSubmit={(event) => { event.preventDefault(); setAppliedUserQuery(userQuery.trim()); }}>
        <input aria-label="搜索账号昵称" placeholder="按昵称搜索账号" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} />
        <button className="soft-button" type="submit">搜索</button>
      </form>
      {usersLoading ? <p className="moderation-empty">正在加载账号…</p> : users.length ? <div className="admin-user-list">{users.map((account) => {
        const restriction = account.community_restriction;
        const restrictionActive = Boolean(restriction?.active && (!restriction.restricted_until || Date.parse(restriction.restricted_until) > Date.now()));
        return <article className="admin-user-row" key={account.id}>
          <div className="admin-user-avatar" aria-hidden="true">{(account.nickname || "探").slice(0, 1)}</div>
          <div className="admin-user-copy"><strong>{account.nickname || "探索者"}{account.role === "admin" && <span className="admin-role-badge">管理员</span>}{restriction && <span className={`admin-restriction-badge${restrictionActive ? " active" : ""}`}>{restrictionActive ? "发言受限" : "曾受限"}</span>}</strong><small>{account.bio || "还没有填写个人简介"}</small><time>加入于 {new Date(account.created_at).toLocaleDateString("zh-CN")}{restrictionActive && ` · ${restriction?.restricted_until ? `限至 ${new Date(restriction.restricted_until).toLocaleDateString("zh-CN")}` : "永久限制"}`}</time></div>
          <div className="admin-user-membership"><span>会员</span><ChoiceSelect label={`${account.nickname || "探索者"}的会员等级`} value={account.membership_tier || "free"} disabled={saving === account.id} options={[{value:"free",label:"普通"},{value:"plus",label:"Plus"},{value:"pro",label:"Pro"}]} onChange={(tier) => void changeMembershipTier(account, tier as AdminUser["membership_tier"])}/></div>
          <button className="admin-role-action" disabled={saving === account.id} onClick={() => void changeUserRole(account)}>{account.role === "admin" ? "设为成员" : "设为管理员"}</button>
          {account.role !== "admin" && <button className={`admin-role-action${restrictionActive ? " is-restricted" : ""}`} disabled={saving === account.id} onClick={() => { setRestrictionTarget(restrictionTarget === account.id ? null : account.id); setRestrictionReason(restriction?.reason || ""); setRestrictionDuration("24h"); }}>{restrictionActive ? "管理限制" : "限制发言"}</button>}
          {restrictionTarget === account.id && account.role !== "admin" && <div className="admin-restriction-form"><strong>{account.nickname || "探索者"} · 发布与互动限制</strong><label>限制原因<input maxLength={500} value={restrictionReason} onChange={(event) => setRestrictionReason(event.target.value)} placeholder="说明限制原因，至少 3 个字" /></label><label>限制时长<select value={restrictionDuration} onChange={(event) => setRestrictionDuration(event.target.value as typeof restrictionDuration)}><option value="1h">1 小时</option><option value="24h">24 小时</option><option value="7d">7 天</option><option value="30d">30 天</option><option value="permanent">永久</option></select></label><div><button className="primary-button" disabled={saving === account.id || restrictionReason.trim().length < 3} onClick={() => void changeCommunityRestriction(account, true)}>{saving === account.id ? "保存中…" : "保存限制"}</button>{restriction && <button className="soft-button" disabled={saving === account.id} onClick={() => void changeCommunityRestriction(account, false)}>解除限制</button>}</div></div>}
        </article>;
      })}</div> : <p className="moderation-empty">没有找到匹配的账号。</p>}
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
        <div className="moderation-target"><b>{report.target.title}</b><CollapsibleMarkdown source={report.target.body} label="展开查看正文"/><CollapsibleImages images={report.target.images} label="查看图片"/><CollapsibleVideos videos={report.target.videos || []} label="查看视频"/></div>
        <p className="moderation-reason"><strong>举报原因</strong> {report.reason}</p>
        {report.review_note && <p className="moderation-history"><strong>处理记录</strong> {report.review_note}{report.reviewed_at ? ` · ${new Date(report.reviewed_at).toLocaleString("zh-CN")}` : ""}</p>}
        {report.status === "open" && <><label className="moderation-note">处理说明<textarea value={notes[report.id] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="记录处理依据，至少 3 个字" /></label><div className="moderation-actions"><button disabled={saving === report.id} onClick={() => void processReport(report, "resolved")}><Check size={15} /> 标记已处理</button><button disabled={saving === report.id} onClick={() => void processReport(report, "dismissed")}><X size={15} /> 驳回举报</button></div></>}
      </article>)}</div> : <p className="moderation-empty">当前没有符合条件的举报。</p>
    ) : submissions.length ? <div className="moderation-list">{submissions.map((post) => <article className="moderation-item" key={post.id}>
      <div className="moderation-item-heading"><strong><ShieldCheck size={16} /> 待人工审核</strong><time>{new Date(post.created_at).toLocaleString("zh-CN")}</time></div>
      <h2>{post.kind === "revision" ? "作品修改待审核" : "新内容待审核"}</h2><p className="moderation-author">作者：{post.author}{post.originalTitle ? ` · 当前公开标题：${post.originalTitle}` : ""}</p><strong className="moderation-submission-title">{post.title}</strong><CollapsibleMarkdown source={post.body} label="展开查看 Markdown 正文"/>
      <CollapsibleImages images={post.images} label="查看图片"/><CollapsibleVideos videos={post.videos || []} label="查看视频"/>
      <label className="moderation-note">审核说明<textarea value={notes[post.id] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="记录审核依据，至少 3 个字" /></label>
      <div className="moderation-actions"><button disabled={saving === post.id} onClick={() => void processSubmission(post, "published")}><Check size={15} /> {post.kind === "revision" ? "通过并替换公开版" : "审核通过并公开"}</button><button disabled={saving === post.id} onClick={() => void processSubmission(post, "hidden")}><X size={15} /> {post.kind === "revision" ? "驳回修改，保留原版" : "驳回并保持隐藏"}</button></div>
    </article>)}</div> : <p className="moderation-empty">目前没有待审核的新内容。</p>}
  </section>;
}
