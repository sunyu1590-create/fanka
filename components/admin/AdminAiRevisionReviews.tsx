"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Clock, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type ReviewStatus = "queued" | "running" | "approved" | "rejected" | "error" | "superseded";

type ReviewItem = {
  id: string;
  postId: string;
  title: string;
  author: string;
  status: ReviewStatus;
  attempts: number;
  maxAttempts: number;
  changedFields: string[];
  verdict: "approve" | "reject" | null;
  reason: string | null;
  suggestions: string[];
  riskLevel: string | null;
  riskTypes: string[];
  model: string | null;
  policyVersion: string | null;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  live: string | null;
  before: { title: string; body: string; category: string };
  after: { title: string; body: string; category: string; contentType: string; topics: string[]; mediaCount: number; attachments: number };
};

type Stats = { total: number; approved: number; rejected: number; error: number; pending: number; superseded: number; avgElapsedMs: number; avgAttempts: number; tokens: number; asOf: string };

const FIELD_LABELS: Record<string, string> = {
  title: "标题", body: "正文", category: "分类", contentType: "类型", topics: "标签", media: "图片/视频", resourceData: "资源信息",
};
const STATUS_META: Record<ReviewStatus, { label: string; tone: "ok" | "bad" | "warn" | "muted" }> = {
  queued: { label: "排队中", tone: "muted" },
  running: { label: "审核中", tone: "warn" },
  approved: { label: "自动通过", tone: "ok" },
  rejected: { label: "自动驳回", tone: "bad" },
  error: { label: "审核异常", tone: "warn" },
  superseded: { label: "已作废", tone: "muted" },
};
const FILTERS = [
  ["all", "全部"], ["pending", "审核中"], ["approved", "自动通过"], ["rejected", "自动驳回"], ["error", "异常"],
] as const;

const fmtDuration = (ms: number) => {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} 分 ${Math.round((ms % 60_000) / 1000)} 秒`;
};
const fmtNumber = (value: number) => value.toLocaleString("zh-CN");
const fmtTime = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";

export default function AdminAiRevisionReviews() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [range, setRange] = useState<string>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const inFlight = useRef(false);
  const seq = useRef(0);

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = ++seq.current;
    try {
      const params = new URLSearchParams({ status, range, page: String(nextPage), limit: "20" });
      const result = await cloudRequest(`/api/v1/admin/ai-reviews?${params}`) as { items: ReviewItem[]; total: number; stats: Stats };
      if (current !== seq.current) return;
      setItems((previous) => append ? [...previous, ...result.items] : result.items);
      setStats(result.stats);
      setTotal(result.total);
      setPage(nextPage);
      setError("");
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : "审核记录读取失败");
    } finally {
      if (current === seq.current) { setLoading(false); inFlight.current = false; }
      else inFlight.current = false;
    }
  }, [status, range]);

  useEffect(() => { setLoading(true); setShowHistory(false); void load(1, false); }, [load]);

  // 有任务在跑时 3 秒同步一次；空闲时降到 15 秒。页面隐藏时暂停，避免无意义请求。
  useEffect(() => {
    const hasActive = items.some((item) => item.status === "queued" || item.status === "running");
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      void load(1, false);
    }, hasActive ? 3000 : 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(1, false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [items, load]);

  // 审核中任务的计时每秒走一次，只重渲染计时文本，不重新请求接口。
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const retry = async (item: ReviewItem) => {
    setRetrying(item.id); setError("");
    try {
      await cloudRequest(`/api/v1/admin/ai-reviews/${item.id}/retry`, {}, "POST");
      await load(1, false);
    } catch (e) { setError(e instanceof Error ? e.message : "重新排队失败"); }
    finally { setRetrying(null); }
  };

  const passRate = stats && stats.approved + stats.rejected > 0
    ? Math.round(stats.approved * 1000 / (stats.approved + stats.rejected)) / 10
    : null;
  const visibleItems = showHistory ? items : items.slice(0, 6);

  return <section className="cc-rev">
    <div className="cc-rev__stats" aria-label="版本审核统计">
      <div className="cc-rev__stat"><small>审核总量</small><b>{stats ? fmtNumber(stats.total) : "—"}</b><i>{range === "today" ? "今日" : range === "7d" ? "近 7 天" : range === "30d" ? "近 30 天" : "全部"}</i></div>
      <div className="cc-rev__stat" data-tone="ok"><small>自动通过</small><b>{stats ? fmtNumber(stats.approved) : "—"}</b><i>通过率 {passRate === null ? "—" : `${passRate}%`}</i></div>
      <div className="cc-rev__stat" data-tone="bad"><small>自动驳回</small><b>{stats ? fmtNumber(stats.rejected) : "—"}</b><i>驳回率 {passRate === null ? "—" : `${Math.round((100 - passRate) * 10) / 10}%`}</i></div>
      <div className="cc-rev__stat" data-tone="warn"><small>审核异常</small><b>{stats ? fmtNumber(stats.error) : "—"}</b><i>自动重试后仍失败</i></div>
      <div className="cc-rev__stat"><small>平均耗时</small><b>{stats ? fmtDuration(stats.avgElapsedMs) : "—"}</b><i>单次审核</i></div>
      <div className="cc-rev__stat"><small>Token 消耗</small><b>{stats ? fmtNumber(stats.tokens) : "—"}</b><i>区间累计</i></div>
    </div>

    <div className="cc-rev__bar">
      <div className="moderation-filters" role="group" aria-label="审核状态筛选">
        {FILTERS.map(([value, label]) => <button key={value} type="button" className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>)}
      </div>
      <div className="cc-rev__bar-right">
        <select aria-label="统计区间" value={range} onChange={(event) => setRange(event.target.value)}>
          <option value="today">今日</option>
          <option value="7d">近 7 天</option>
          <option value="30d">近 30 天</option>
          <option value="all">全部</option>
        </select>
        <button type="button" className="soft-button" disabled={loading} onClick={() => void load(1, false)}><RefreshCw size={14}/>{loading ? "同步中…" : "刷新"}</button>
      </div>
    </div>

    <p className="cc-rev__hint">版本更新提交后由 AI 自动审核：正常修改直接发布，仅重大违规自动驳回，管理员不参与通过/驳回。下方为真实审核记录与 Token 消耗。</p>
    {error && <p className="moderation-feedback error" role="alert">{error}</p>}

    {loading && !items.length ? <p className="moderation-empty">正在读取审核记录…</p> : items.length ? <>
      <div className="cc-rev__list">{visibleItems.map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.queued;
        const open = openId === item.id;
        const startedAt = item.startedAt ? new Date(item.startedAt).getTime() : null;
        const liveMs = item.status === "running" && startedAt ? Math.max(0, clock - startedAt) : item.elapsedMs;
        return <article className="cc-rev__row" data-open={open ? "1" : undefined} key={item.id}>
          <button type="button" className="cc-rev__head" aria-expanded={open} onClick={() => setOpenId(open ? null : item.id)}>
            <span className="cc-rev__state" data-tone={meta.tone}>
              {item.status === "running" || item.status === "queued" ? <Loader2 size={12} className="ab-spin" aria-hidden="true"/> : item.status === "approved" ? <Check size={12} aria-hidden="true"/> : item.status === "rejected" ? <X size={12} aria-hidden="true"/> : <AlertTriangle size={12} aria-hidden="true"/>}
              {meta.label}
            </span>
            <span className="cc-rev__title">{item.title}</span>
            <span className="cc-rev__author">{item.author}</span>
            <span className="cc-rev__fields">{(item.changedFields || []).map((field) => FIELD_LABELS[field] || field).join(" · ") || "无差异"}</span>
            <span className="cc-rev__meta"><Clock size={11} aria-hidden="true"/>{fmtDuration(liveMs)}</span>
            <span className="cc-rev__meta">{item.tokens ? `${fmtNumber(item.tokens)} tk` : "—"}</span>
            <span className="cc-rev__time">{fmtTime(item.finishedAt || item.createdAt)}</span>
            {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
          </button>
          {open ? <div className="cc-rev__detail">
            <div className="cc-rev__diff">
              <div><small>修改前（线上）</small><strong>{item.before.title || "—"}</strong><p>{item.before.body || "—"}</p><i>{item.before.category || "—"}</i></div>
              <div><small>修改后（提交版本）</small><strong>{item.after.title || "—"}</strong><p>{item.after.body || "—"}</p><i>{item.after.category || "—"} · {item.after.contentType} · {item.after.topics.length} 个标签 · {item.after.mediaCount} 个媒体 · {item.after.attachments} 个附件</i></div>
            </div>
            <dl className="cc-rev__facts">
              <div><dt>审核结论</dt><dd>{item.status === "approved" ? "自动通过并发布新版本" : item.status === "rejected" ? "自动驳回，保留原版本" : item.status === "error" ? "审核服务异常，等待重试" : item.status === "superseded" ? "已被更新的提交替代" : "AI 审核中"}</dd></div>
              <div><dt>耗时 / Token</dt><dd>{fmtDuration(item.elapsedMs)} · {fmtNumber(item.tokens)} tk（入 {fmtNumber(item.inputTokens || 0)} / 出 {fmtNumber(item.outputTokens || 0)}）</dd></div>
              <div><dt>模型 / 策略</dt><dd>{item.model || "—"} · {item.policyVersion || "—"}</dd></div>
              <div><dt>尝试次数</dt><dd>{item.attempts}/{item.maxAttempts}</dd></div>
              <div><dt>判定依据</dt><dd>{item.reason || "—"}{item.riskLevel ? `（风险：${item.riskLevel}${item.riskTypes.length ? ` · ${item.riskTypes.join(",")}` : ""}）` : ""}</dd></div>
              {item.error ? <div><dt>异常信息</dt><dd style={{ color: "var(--ab-coral)" }}>{item.error}</dd></div> : null}
              {item.suggestions.length ? <div><dt>给用户的建议</dt><dd>{item.suggestions.join("；")}</dd></div> : null}
            </dl>
            <div className="cc-rev__actions">
              <span>作品状态：{item.live === "published" ? "公开中（原版本未受影响）" : item.live === "hidden" ? "已下架" : item.live || "—"}</span>
              {item.status === "error" || item.status === "superseded" ? <button type="button" className="soft-button" disabled={retrying === item.id} onClick={() => void retry(item)}><RotateCcw size={13}/>{retrying === item.id ? "排队中…" : "重新排队"}</button> : null}
            </div>
          </div> : null}
        </article>;
      })}</div>
      {!showHistory && items.length > 6 ? <button type="button" className="comments-load-more" onClick={() => setShowHistory(true)}>展开历史记录（还有 {items.length - 6} 条）</button> : null}
      {showHistory && items.length < total ? <button type="button" className="comments-load-more" disabled={loading} onClick={() => void load(page + 1, true)}>{loading ? "加载中…" : `加载更多（${items.length}/${total}）`}</button> : null}
      {showHistory ? <button type="button" className="cc-rev__fold" onClick={() => setShowHistory(false)}>收起历史记录</button> : null}
    </> : <p className="moderation-empty">当前筛选没有版本审核记录。用户提交修改后会自动出现在这里。</p>}
  </section>;
}
