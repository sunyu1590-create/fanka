"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, Pause, PenLine, Play, RotateCcw, ShieldCheck, Sparkles, Square, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type Batch = { id: string; task_type: string; status: string; config_snapshot: { model?: string }; total_count: number; completed_count: number; review_count: number; failed_count: number; current_post_id: string | null; current_post_title: string | null; created_at: string; task_usage: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number; costs: Record<string, number> | null } | null };
type ReviewResult = { decision?: string; riskLevel?: string; riskTypes?: string[]; reason?: string; evidence?: string[]; evidenceValidated?: boolean; manualDecision?: string; manualReason?: string };
type ClassificationResult = { applied?: boolean; reason?: string; applyReason?: string; categoryName?: string | null; tagNames?: string[] };
type ReviewHistoryRow = { id: number; postId: string | null; title: string; channel: string; author: string; decision: string; reason: string; actor: string; createdAt: string };
type CollectionReview = { id: string; title: string; description: string; cover_url: string | null; kind: string; channel: string; review_status: string; pending_public: Record<string, unknown> | null; updated_at: string; profiles?: { nickname: string } | { nickname: string }[] | null };
type ClassificationItem = { id: string; batch_id: string; post_id: string | null; status: string; result: ClassificationResult | null; error_message: string | null; updated_at: string; post: { id: string; title: string; channel: string } | null };
type Profile = { nickname: string };
type ReviewItem = { id: string; batch_id: string; post_id: string | null; status: string; result: ReviewResult | null; result_history: Array<{ result: ReviewResult; model: string | null; recorded_at: string; status: string }>; error_message: string | null; created_at: string; updated_at: string; post: { id: string; title: string; body: string; channel: string; status: string; author_id: string | null; profiles: Profile | Profile[] | null } | null };
type UsageEntry = { request_id: string; purpose: string; model: string; status: string; elapsed_ms: number; input_tokens: number; output_tokens: number; output_tokens_per_second: number | null; total_tokens: number; estimated_cost: number | null; currency: string | null; created_at: string };
type Metrics = {
  periods?: Record<string, { tokens: number; costs: Record<string, number> | null; requests: number; success?: number; failure?: number }>;
  daily?: Array<{ day: string; tokens: number; costs: Record<string, number> | null; requests: number }>;
  purpose?: Array<{ purpose: string; input_tokens: number; output_tokens: number; total_tokens: number; requests: number }>;
  model?: Array<{ model: string; total_tokens: number; requests: number }>;
  recent?: UsageEntry[];
  pricingConfigured?: boolean;
};
type Price = { model: string; version: string; currency: string; input_per_million: number; cache_hit_input_per_million: number | null; output_per_million: number; valid_from: string };
type ModelState = { configs: Array<{ purpose: string; model: string; updated_at: string }>; availableModels: string[]; models?: string[]; usageModels?: Array<{ model: string; requests: number }>; discoveryAvailable: boolean; history: Array<{ purpose: string; model: string; changed_at: string; profiles: { nickname: string } | { nickname: string }[] | null }>; prices: Price[] };

const purposeLabels: Record<string, string> = { review: "内容审核", summary: "内容总结", classification: "自动分类", polish: "正文润色", markdown: "Markdown 优化", title: "标题生成", other: "其他 AI 功能" };
const taskLabels: Record<string, string> = { summary_all: "全量生成 AI 总结", summary_incremental: "增量生成 AI 总结", review_pending: "一键 AI 审核", classification: "自动分类与标签" };
const statusLabels: Record<string, string> = { queued: "等待启动", running: "处理中", paused: "已暂停", completed: "已完成", cancelled: "已中止", failed: "任务失败" };
const firstProfile = (value: Profile | Profile[] | null | undefined) => Array.isArray(value) ? value[0] || null : value || null;
const formatTokens = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Number(value) || 0);
const formatMoney = (value: Record<string, number> | null | undefined, requests = 0) => {
  if (requests === 0) return "—";
  if (!value) return "部分请求未登记价格";
  const rows = Object.entries(value);
  return rows.length ? rows.map(([currency, amount]) => `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(amount)} ${currency}`).join(" · ") : "—";
};

function highlightedBody(body: string, excerpts: string[]): ReactNode[] {
  const intervals = excerpts.filter(Boolean).flatMap((excerpt) => {
    const found: Array<{ start: number; end: number }> = [];
    let from = 0;
    while (from < body.length) {
      const start = body.indexOf(excerpt, from);
      if (start < 0) break;
      found.push({ start, end: start + excerpt.length });
      from = start + excerpt.length;
    }
    return found;
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  const unique = intervals.filter((range, index) => !index || range.start >= Math.max(...intervals.slice(0, index).map((item) => item.end)));
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const range of unique) {
    if (range.start > cursor) nodes.push(body.slice(cursor, range.start));
    nodes.push(<mark key={`${range.start}-${range.end}`}>{body.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  }
  if (cursor < body.length) nodes.push(body.slice(cursor));
  return nodes;
}

export default function AdminAITasks({ mode = "all" }: { mode?: "review" | "usage" | "all" } = {}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [classificationItems, setClassificationItems] = useState<ClassificationItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({});
  const [modelState, setModelState] = useState<ModelState | null>(null);
  const [includeExisting, setIncludeExisting] = useState(false);
  const [priceDraft, setPriceDraft] = useState({ model: "", version: "", currency: "CNY", inputPerMillion: "", cacheHitInputPerMillion: "", outputPerMillion: "" });
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [collectionReviews, setCollectionReviews] = useState<CollectionReview[]>([]);
  const [reviewFocus, setReviewFocus] = useState(false);
  const [reviewCursor, setReviewCursor] = useState(0);
  const [history, setHistory] = useState<ReviewHistoryRow[]>([]);
  const [historyFilters, setHistoryFilters] = useState({ days: "30", channel: "all", result: "all", q: "" });
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [taskData, configData] = await Promise.all([
        cloudRequest("/api/v1/admin/ai-tasks") as Promise<{ batches: Batch[]; reviewItems: ReviewItem[]; classificationItems: ClassificationItem[]; metrics: Metrics }>,
        cloudRequest("/api/v1/admin/ai-model-config") as Promise<ModelState>,
      ]);
      setBatches(taskData.batches || []); setReviewItems(taskData.reviewItems || []); setClassificationItems(taskData.classificationItems || []); setMetrics(taskData.metrics || {}); setModelState(configData);
      const collectionData = await cloudRequest("/api/v1/admin/collections").catch(() => ({ items: [] })) as { items?: CollectionReview[] };
      setCollectionReviews(collectionData.items || []);
      if (!priceDraft.model) {
        const preferred = configData.usageModels?.[0]?.model || configData.availableModels?.[0];
        if (preferred) setPriceDraft((current) => ({ ...current, model: preferred }));
      }
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI 资源数据加载失败"); }
  }, [priceDraft.model]);
  useEffect(() => { void load(); }, [load]);
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ page: String(historyPage), limit: "10" });
      if (historyFilters.days !== "0") params.set("days", historyFilters.days);
      if (historyFilters.channel !== "all") params.set("channel", historyFilters.channel);
      if (historyFilters.result !== "all") params.set("result", historyFilters.result);
      if (historyFilters.q.trim()) params.set("q", historyFilters.q.trim());
      const data = await cloudRequest(`/api/v1/admin/review-history?${params.toString()}`) as { items?: ReviewHistoryRow[]; total?: number };
      setHistory(data.items || []);
      setHistoryTotal(data.total || 0);
    } catch {
      setHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, historyFilters]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => {
    const active = batches.some((batch) => ["queued", "running"].includes(batch.status));
    if (!active) return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [batches, load]);

  const execute = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(label); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  };
  const createTask = (taskType: string) => execute("批量任务已建立。启动后由后台队列处理。", async () => {
    await cloudRequest("/api/v1/admin/ai-tasks", { taskType, includeExisting }, "POST");
  });
  const taskAction = (batch: Batch, action: string) => execute("任务状态已更新。", async () => {
    await cloudRequest(`/api/v1/admin/ai-tasks/${batch.id}`, { action }, "POST");
  });
  const reviewAction = (item: ReviewItem, decision: "published" | "hidden" | "revision") => execute(
    decision === "published" ? "人工复审已通过作品。" : decision === "revision" ? "已退回修改：作品回到作者草稿箱。" : "人工复审已驳回作品。",
    async () => {
    await cloudRequest(`/api/v1/admin/ai-tasks/${item.batch_id}`, { action: "review", itemId: item.id, decision, reason: reviewReasons[item.id] || "管理员已对照原文完成复核" }, "POST");
  });
  const changeModel = (purpose: string, model: string) => execute("任务模型配置已保存；当前运行任务仍使用启动时的配置快照。", async () => {
    await cloudRequest("/api/v1/admin/ai-model-config", { action: "model", purpose, model }, "PATCH");
  });
  const savePrice = (event: FormEvent) => {
    event.preventDefault();
    void execute("模型价格版本已保存，后续请求按该版本估算费用。", async () => {
      const saved = await cloudRequest("/api/v1/admin/ai-model-config", {
        action: "price", model: priceDraft.model, version: priceDraft.version, currency: priceDraft.currency,
        inputPerMillion: Number(priceDraft.inputPerMillion), cacheHitInputPerMillion: priceDraft.cacheHitInputPerMillion, outputPerMillion: Number(priceDraft.outputPerMillion),
      }, "PATCH") as Price | null;
      if (saved) setModelState((current) => current ? { ...current, prices: [saved, ...(current.prices || []).filter((price) => !(price.model === saved.model && price.version === saved.version))] } : current);
      setPriceDraft((current) => ({ ...current, version: "", inputPerMillion: "", cacheHitInputPerMillion: "", outputPerMillion: "" }));
    });
  };
  const dailyMaximum = useMemo(() => Math.max(1, ...(metrics.daily || []).map((day) => Number(day.tokens) || 0)), [metrics.daily]);
  const latestPrices = useMemo(() => {
    const map = new Map<string, Price>();
    for (const price of modelState?.prices || []) if (!map.has(price.model)) map.set(price.model, price);
    return map;
  }, [modelState]);
  const modelOptions = useMemo(() => {
    const usage = new Map((modelState?.usageModels || []).map((row): [string, number] => [row.model, row.requests]));
    const names = new Set<string>([...(modelState?.models || []), ...(modelState?.availableModels || []), ...(modelState?.configs || []).map((row) => row.model), ...(modelState?.prices || []).map((row) => row.model)]);
    return [...names].map((model) => ({ model, requests: usage.get(model) || 0 })).sort((a, b) => b.requests - a.requests || a.model.localeCompare(b.model));
  }, [modelState]);
  const currentActive = batches.some((batch) => ["queued", "running", "paused"].includes(batch.status));

  const visibleReviewItems = reviewFocus ? reviewItems.slice(Math.min(reviewCursor, Math.max(0, reviewItems.length - 1)), Math.min(reviewCursor, Math.max(0, reviewItems.length - 1)) + 1) : reviewItems;

  return <main className="admin-ai-center">
    <header className="admin-ai-center-head"><div><span>{mode === "usage" ? "模型用量中心" : "AI 审核中心"}</span><h2>{mode === "usage" ? "模型用量" : "审核任务与人工复审"}</h2><p>{mode === "usage" ? "调用次数、Token、费用与响应时间均读取真实请求记录。" : "新作品、合集与修改版本统一进入 AI 初审，风险内容转人工复审。"}</p></div><button type="button" className="soft-button" onClick={() => void load()} disabled={busy}>刷新</button></header>
    {error && <p className="admin-ai-center-message error" role="alert">{error}</p>}{notice && <p className="admin-ai-center-message" role="status">{notice}</p>}

    {mode !== "review" && <>
    <section className="admin-ai-metrics" aria-label="AI 请求用量">
      {([["today", "今日"], ["yesterday", "昨日"], ["sevenDays", "近 7 天"], ["thirtyDays", "近 30 天"], ["allTime", "历史累计"]] as const).map(([key, label]) => {
        const row = metrics.periods?.[key];
        return <article key={key}><small>{label}</small><strong>{formatTokens(row?.tokens || 0)}</strong><span>Token · {formatTokens(row?.requests || 0)} 次请求</span><em>{formatMoney(row?.costs, row?.requests || 0)}</em></article>;
      })}
    </section>
    {metrics.periods?.allTime && <p className="admin-ai-data-note">成功 {formatTokens(metrics.periods.allTime.success || 0)} 次 · 失败 {formatTokens(metrics.periods.allTime.failure || 0)} 次。费用为按已配置价格版本计算的预估值；未配置价格时不展示金额。</p>}

    <div className="admin-ai-center-grid">
      <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>每日用量趋势</h3><small>最近 30 天</small></div>
        <div className="admin-ai-daily-chart">{(metrics.daily || []).map((day) => <div key={day.day} title={`${day.day.slice(0, 10)} · ${formatTokens(day.tokens)} Token · ${formatMoney(day.costs, day.requests)}`}><i style={{ height: `${Math.max(3, Number(day.tokens) / dailyMaximum * 100)}%` }}/><span>{day.day.slice(8, 10)}</span></div>)}</div>
        {!metrics.daily?.length && <p className="admin-ai-data-note">暂无 AI 请求记录。</p>}
      </section>
      <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>按用途统计</h3><small>累计真实请求</small></div>
        {metrics.purpose?.length ? <div className="admin-ai-breakdown">{metrics.purpose.map((row) => <div key={row.purpose}><span>{purposeLabels[row.purpose] || row.purpose}</span><strong>{formatTokens(row.total_tokens)}</strong><small>输入 {formatTokens(row.input_tokens)} · 输出 {formatTokens(row.output_tokens)} · {row.requests} 次</small></div>)}</div> : <p className="admin-ai-data-note">尚无统计记录。</p>}
      </section>
    </div>
    <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>模型使用与最近请求</h3><small>不记录原始密钥或创作正文</small></div>
      <div className="admin-ai-model-summary">{metrics.model?.map((row) => <span key={row.model}><strong>{row.model}</strong> · {formatTokens(row.total_tokens)} Token · {row.requests} 次</span>)}</div>
      <div className="admin-ai-request-list">{metrics.recent?.slice(0, 12).map((row) => <div key={row.request_id}><span className={row.status === "success" ? "ok" : "failed"}>{row.status === "success" ? "成功" : "失败"}</span><strong>{purposeLabels[row.purpose] || row.purpose}</strong><small>{row.model} · 输入 {formatTokens(row.input_tokens)} / 输出 {formatTokens(row.output_tokens)} · {row.elapsed_ms} ms · 平均输出 {row.output_tokens_per_second == null ? "暂无" : `${Number(row.output_tokens_per_second).toFixed(1)} Token/秒`}</small><time>{new Date(row.created_at).toLocaleString("zh-CN")}</time></div>)}</div>
    </section>

    <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>模型与价格配置</h3><small>候选模型合并服务端列表与近 30 天真实请求</small></div>
      {!modelState?.discoveryAvailable && <p className="admin-ai-data-note">当前未能读取服务端模型列表。请先检查已保存的服务密钥和 DeepSeek 连接；不会展示未经验证的模型名称。</p>}
      {!!modelState?.usageModels?.length && <p className="admin-ai-data-note">近 30 天实际请求：{modelState.usageModels.map((row) => `${row.model}（${formatTokens(row.requests)} 次，${latestPrices.has(row.model) ? "已登记价格" : "未登记价格"}）`).join("；")}。请为实际请求的模型登记价格，费用才会显示。</p>}
      {modelState?.discoveryAvailable && <div className="admin-ai-model-config-grid">{(modelState.configs || []).map((row) => {
        const options = modelState.availableModels.includes(row.model) ? modelState.availableModels : [row.model, ...modelState.availableModels];
        const price = latestPrices.get(row.model);
        return <label key={row.purpose}>{purposeLabels[row.purpose] || row.purpose}<select value={row.model} disabled={busy} onChange={(event) => void changeModel(row.purpose, event.target.value)}>{options.map((model) => <option key={model} value={model}>{model}{modelState.availableModels.includes(model) ? "" : " · 服务端未列出"}</option>)}</select><small className={`admin-ai-model-price${price ? "" : " is-missing"}`}>{price ? `输入 ${price.input_per_million} · 缓存 ${price.cache_hit_input_per_million ?? "未区分"} · 输出 ${price.output_per_million} ${price.currency}` : "该模型尚未登记价格"}</small></label>;
      })}</div>}
      <p className="admin-ai-data-note">当前接口未确认独立的“思考强度”参数，因此此处不伪造档位。新任务会固定记录启动时选中的模型。</p>
      <form className="admin-ai-price-form" onSubmit={savePrice}><strong>添加价格版本（以服务商实际价格为准）</strong><select value={priceDraft.model} onChange={(event) => setPriceDraft((current) => ({ ...current, model: event.target.value }))} required><option value="">选择模型（优先当前在用）</option>{modelOptions.map(({ model, requests }) => <option value={model} key={model}>{model}{requests ? ` · 近 30 天 ${formatTokens(requests)} 次` : ""}{modelState?.availableModels.includes(model) ? "" : " · 服务端未列出"}</option>)}</select><input value={priceDraft.version} onChange={(event) => setPriceDraft((current) => ({ ...current, version: event.target.value }))} placeholder="价格版本或生效批次" required maxLength={60}/><select value={priceDraft.currency} onChange={(event) => setPriceDraft((current) => ({ ...current, currency: event.target.value }))}><option value="CNY">人民币</option><option value="USD">美元</option></select><input type="number" min="0" step="0.000001" value={priceDraft.inputPerMillion} onChange={(event) => setPriceDraft((current) => ({ ...current, inputPerMillion: event.target.value }))} placeholder="普通输入价格 / 百万 Token" required/><input type="number" min="0" step="0.000001" value={priceDraft.cacheHitInputPerMillion} onChange={(event) => setPriceDraft((current) => ({ ...current, cacheHitInputPerMillion: event.target.value }))} placeholder="缓存输入价格（选填）"/><input type="number" min="0" step="0.000001" value={priceDraft.outputPerMillion} onChange={(event) => setPriceDraft((current) => ({ ...current, outputPerMillion: event.target.value }))} placeholder="输出价格 / 百万 Token" required/><button className="soft-button" disabled={busy || !modelOptions.length}>保存价格</button></form>
      {priceDraft.model && !(modelState?.usageModels || []).some((row) => row.model === priceDraft.model && row.requests > 0) && !!modelState?.usageModels?.length && <p className="admin-ai-price-hint warn">该模型近 30 天没有请求；当前实际使用的是 {modelState.usageModels[0].model}，请确认是否为它登记价格。</p>}
      <p className="admin-ai-price-hint">保存后立即按该价格回填此模型尚未计费的历史请求，费用卡片与每日趋势会同步刷新。</p>
      {modelState?.prices?.length ? <div className="admin-ai-price-list">{modelState.prices.map((price) => <span key={`${price.model}-${price.version}`}>{price.model} · {price.version} · 普通输入 {price.input_per_million}/{price.currency} · 缓存输入 {price.cache_hit_input_per_million ?? "未区分"}/{price.currency} · 输出 {price.output_per_million}/{price.currency} · {new Date(price.valid_from).toLocaleDateString("zh-CN")} 起</span>)}</div> : <p className="admin-ai-data-note">尚未登记模型价格；费用将显示为未配置，不会估算虚构金额。</p>}
      {!!modelState?.history.length && <details className="admin-ai-config-history"><summary>查看模型配置变更记录</summary>{modelState.history.map((row, index) => <span key={`${row.changed_at}-${index}`}>{purposeLabels[row.purpose] || row.purpose} · {row.model} · {new Date(row.changed_at).toLocaleString("zh-CN")}</span>)}</details>}
    </section>
    </>}

    {mode !== "usage" && <>
    <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>批量任务</h3><small>每个任务逐篇处理，可暂停、恢复和继续失败项</small></div>
      <div className="admin-ai-task-buttons"><button type="button" className="primary-button" disabled={busy || currentActive} onClick={() => void createTask("summary_all")}><Sparkles size={15}/>全量生成 AI 总结</button><button type="button" className="soft-button" disabled={busy || currentActive} onClick={() => void createTask("summary_incremental")}><RotateCcw size={15}/>增量生成 AI 总结</button><button type="button" className="soft-button" disabled={busy || currentActive} onClick={() => void createTask("review_pending")}><ShieldCheck size={15}/>一键 AI 审核</button><label><input type="checkbox" checked={includeExisting} onChange={(event) => setIncludeExisting(event.target.checked)}/>全量任务重新生成已有总结</label></div>
      <div className="admin-ai-task-list">{batches.filter((batch) => ["queued", "running", "paused"].includes(batch.status)).map((batch) => {
        const percent = batch.total_count ? Math.min(100, Math.round((batch.completed_count + batch.review_count + batch.failed_count) / batch.total_count * 100)) : 100;
        return <article key={batch.id}><div className="admin-ai-task-top"><div><strong>{taskLabels[batch.task_type] || batch.task_type}</strong><small>{batch.config_snapshot?.model || "模型未记录"} · {new Date(batch.created_at).toLocaleString("zh-CN")}</small></div><span className={`status-${batch.status}`}>{statusLabels[batch.status] || batch.status}</span></div>{batch.status === "running" && batch.current_post_title && <p className="admin-ai-data-note">正在处理：{batch.current_post_title}</p>}<div className="admin-ai-task-progress"><i style={{ width: `${percent}%` }}/></div><div className="admin-ai-task-counts"><span>总数 {batch.total_count}</span><span>完成 {batch.completed_count}</span><span>待人工复审 {batch.review_count}</span><span>失败 {batch.failed_count}</span><b>{percent}%</b></div>{batch.task_usage && <p className="admin-ai-data-note">输入 {formatTokens(batch.task_usage.inputTokens)} · 输出 {formatTokens(batch.task_usage.outputTokens)} · 合计 {formatTokens(batch.task_usage.totalTokens)} Token · 预估费用 {formatMoney(batch.task_usage.costs, batch.task_usage.requests)}</p>}<div className="admin-ai-task-actions">{batch.status === "queued" && <button onClick={() => void taskAction(batch, "start")} disabled={busy}><Play size={14}/>启动</button>}{batch.status === "running" && <button onClick={() => void taskAction(batch, "pause")} disabled={busy}><Pause size={14}/>暂停</button>}{batch.status === "paused" && <button onClick={() => void taskAction(batch, "resume")} disabled={busy}><Play size={14}/>继续</button>}{["running", "queued", "paused"].includes(batch.status) && <button onClick={() => void taskAction(batch, "cancel")} disabled={busy}><Square size={13}/>中止</button>}{["completed", "failed"].includes(batch.status) && batch.failed_count > 0 && <button onClick={() => void execute("失败项目已重新开始。", () => cloudRequest(`/api/v1/admin/ai-tasks/${batch.id}`, { action: "retry" }, "PATCH"))} disabled={busy}><RotateCcw size={14}/>重试失败项</button>}</div></article>;
      })}</div>
      {!!batches.filter((batch) => !["queued", "running", "paused"].includes(batch.status)).length && <details className="admin-ai-task-history"><summary>已完成与失败的批量任务（{batches.filter((batch) => !["queued", "running", "paused"].includes(batch.status)).length}）</summary><div className="admin-ai-task-list">{batches.filter((batch) => !["queued", "running", "paused"].includes(batch.status)).map((batch) => {        const percent = batch.total_count ? Math.min(100, Math.round((batch.completed_count + batch.review_count + batch.failed_count) / batch.total_count * 100)) : 100;        return <article key={batch.id}><div className="admin-ai-task-top"><div><strong>{taskLabels[batch.task_type] || batch.task_type}</strong><small>{batch.config_snapshot?.model || "模型未记录"} · {new Date(batch.created_at).toLocaleString("zh-CN")}</small></div><span className={`status-${batch.status}`}>{statusLabels[batch.status] || batch.status}</span></div><div className="admin-ai-task-progress"><i style={{ width: `${percent}%` }}/></div><div className="admin-ai-task-counts"><span>总数 {batch.total_count}</span><span>完成 {batch.completed_count}</span><span>待人工复审 {batch.review_count}</span><span>失败 {batch.failed_count}</span><b>{percent}%</b></div>{["completed", "failed"].includes(batch.status) && batch.failed_count > 0 && <div className="admin-ai-task-actions"><button onClick={() => void execute("失败项目已重新开始。", () => cloudRequest(`/api/v1/admin/ai-tasks/${batch.id}`, { action: "retry" }, "PATCH"))} disabled={busy}><RotateCcw size={14}/>重试失败项</button></div>}</article>;      })}</div></details>}{!batches.length && <p className="admin-ai-data-note">尚无批量任务。</p>}
    </section>

    <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>自动分类与标签记录</h3><small>最近 {classificationItems.length} 条 · 保留模型建议、应用状态与处理结果</small></div>
      {classificationItems.length ? <div className="admin-ai-task-list">{classificationItems.map((item) => {
        const result = item.result || {};
        const outcome = item.status === "failed" ? "处理失败" : result.applied === true ? "已应用" : item.status === "skipped" || result.applied === false ? "未覆盖现有内容" : item.status;
        return <article key={item.id}><div className="admin-ai-task-top"><div><strong>{item.post?.title || "作品不可用"}</strong><small>{item.post?.channel === "ai" ? "AI 专区" : "精选内容"} · {new Date(item.updated_at).toLocaleString("zh-CN")}</small></div><span>{outcome}</span></div>{result.categoryName && <p className="admin-ai-data-note">建议分类：{result.categoryName} · 建议标签：{result.tagNames?.join("、") || "无"}</p>}<p className="admin-ai-data-note">{result.applyReason || result.reason || item.error_message || "尚无处理说明"}</p></article>;
      })}</div> : <p className="admin-ai-data-note">暂无自动分类记录。</p>}
    </section>

    <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>合集待审</h3><small>{collectionReviews.length} 条 · 新建合集与公开信息修改；线上版本保持可用</small></div>
      {collectionReviews.length ? <div className="admin-ai-task-list">{collectionReviews.map((collection) => {
        const creator = firstProfile(collection.profiles)?.nickname || "作者不可用";
        const pending = collection.pending_public || {};
        return <article key={collection.id}><div className="admin-ai-task-top"><div><strong>{collection.title}</strong><small>{creator} · {collection.channel === "ai" ? "AI 专区" : "精选"} · {new Date(collection.updated_at).toLocaleString("zh-CN")}</small></div><span>{pending.title ? "公开信息修改" : "新建合集"}</span></div><p className="admin-ai-data-note">{collection.description || "（无简介）"}</p>{!!pending.title && <p className="admin-ai-data-note">待审标题：{String(pending.title)} · 待审简介：{String(pending.description || "（空）")}</p>}<div className="admin-ai-review-actions"><button disabled={busy} onClick={() => void execute("合集已通过审核。", async () => { await cloudRequest("/api/v1/admin/collections", { id: collection.id, action: "approve" }); setCollectionReviews((current) => current.filter((row) => row.id !== collection.id)); })}><Check size={14}/>通过</button><button disabled={busy} onClick={() => void execute("合集已退回。", async () => { await cloudRequest("/api/v1/admin/collections", { id: collection.id, action: "reject", note: "公开信息不符合发布规范" }); setCollectionReviews((current) => current.filter((row) => row.id !== collection.id)); })}><X size={14}/>退回</button></div></article>;
      })}</div> : <p className="admin-ai-data-note">当前没有待审合集。</p>}
    </section>

    <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>人工复审</h3><small>{reviewItems.length} 条待处理；AI 不能驳回或删除作品</small></div>
      <div className="admin-ai-review-toolbar">
        <button type="button" className={reviewFocus ? "active" : ""} disabled={!reviewItems.length} onClick={() => { setReviewFocus((value) => !value); setReviewCursor(0); }}>{reviewFocus ? "退出逐条" : "逐条复审"}</button>
        {reviewFocus && <>
          <button type="button" disabled={reviewCursor <= 0} onClick={() => setReviewCursor((value) => Math.max(0, value - 1))}>上一条</button>
          <span>第 {Math.min(reviewCursor + 1, reviewItems.length)} / {reviewItems.length} 条</span>
          <button type="button" disabled={reviewCursor >= reviewItems.length - 1} onClick={() => setReviewCursor((value) => Math.min(reviewItems.length - 1, value + 1))}>下一条</button>
        </>}
      </div>
      {reviewItems.length ? <div className="admin-ai-review-list">{visibleReviewItems.map((item) => {
        const result = item.result || {};
        const author = firstProfile(item.post?.profiles)?.nickname || "作者资料不可用";
        const reason = reviewReasons[item.id] || "";
        return <article key={item.id}><header><div><strong>{item.post?.title || "作品不可用"}</strong><small>{author} · {item.post?.channel === "ai" ? "AI 专区" : "精选内容"} · 最近分析 {new Date(item.updated_at).toLocaleString("zh-CN")}</small></div><span>{result.riskLevel || "需人工判断"}</span></header><div className="admin-ai-review-risk"><b>{(result.riskTypes || []).join("、") || "AI 未确认具体风险类型"}</b><p>{result.reason || "模型未提供结构化审核理由"}</p><small>模型：{batches.find((batch) => batch.id === item.batch_id)?.config_snapshot?.model || "任务配置不可用"} · 摘录校验：{result.evidenceValidated === false ? "未通过，已转人工" : "已核验"}</small></div>{item.result_history.length > 0 && <details className="admin-ai-review-history"><summary>历次 AI 分析（{item.result_history.length}）</summary>{item.result_history.map((history, index) => <div key={`${history.recorded_at}-${index}`}><small>{history.model || "模型未记录"} · {new Date(history.recorded_at).toLocaleString("zh-CN")}</small><p>{history.result.reason || "无分析说明"}</p><small>{(history.result.riskTypes || []).join("、") || "未识别风险类型"} · 摘录：{(history.result.evidence || []).join("；") || "无"}</small></div>)}</details>}<div className="admin-ai-review-source">{item.post ? highlightedBody(item.post.body, result.evidence || []) : "原文不可用，无法进行复核。"}</div><div className="admin-ai-quick-reasons" role="group" aria-label="快捷审核原因">{["分类不准确", "标题不规范", "内容质量不足", "疑似广告", "版权或授权问题", "内容不适宜", "其他原因"].map((label) => <button type="button" key={label} onClick={() => setReviewReasons((current) => { const existing = (current[item.id] || "").trim(); if (existing.includes(label)) return current; return { ...current, [item.id]: existing ? `${existing}；${label}` : label }; })}>{label}</button>)}</div><label className="admin-ai-review-reason">人工处理原因<textarea value={reason} maxLength={500} onChange={(event) => setReviewReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="写明核对结果和处理依据，至少 3 个字"/></label><div className="admin-ai-review-actions"><button disabled={busy || !item.post || (reason.trim().length > 0 && reason.trim().length < 3)} onClick={() => void reviewAction(item, "published")}><Check size={14}/>通过</button><button disabled={busy || !item.post || reason.trim().length < 3} onClick={() => void reviewAction(item, "hidden")}><X size={14}/>驳回</button><button disabled={busy || !item.post || reason.trim().length < 3} onClick={() => void reviewAction(item, "revision")}><PenLine size={14}/>退回修改</button><button disabled={busy} onClick={() => void execute("已将记录重新加入 AI 分析队列。", () => cloudRequest(`/api/v1/admin/ai-tasks/${item.batch_id}`, { action: "reanalyze", itemId: item.id }, "POST"))}><RotateCcw size={14}/>重新分析</button></div></article>;
      })}</div> : <p className="admin-ai-data-note">当前没有待人工复审内容。</p>}
    </section>

    <section className="admin-ai-center-panel"><div className="admin-ai-panel-title"><h3>审核历史</h3><small>默认收起；结果与日志永久保留，可筛选、搜索与分页</small></div>
      <details className="admin-ai-task-history" open={false}>
        <summary>展开已完成的人工复审记录（{historyTotal} 条）</summary>
        <div className="admin-ai-history-filters">
          <select aria-label="时间范围" value={historyFilters.days} onChange={(event) => { setHistoryFilters((current) => ({ ...current, days: event.target.value })); setHistoryPage(1); }}><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 90 天</option><option value="0">全部时间</option></select>
          <select aria-label="频道" value={historyFilters.channel} onChange={(event) => { setHistoryFilters((current) => ({ ...current, channel: event.target.value })); setHistoryPage(1); }}><option value="all">全部频道</option><option value="community">精选</option><option value="ai">AI 专区</option></select>
          <select aria-label="审核结果" value={historyFilters.result} onChange={(event) => { setHistoryFilters((current) => ({ ...current, result: event.target.value })); setHistoryPage(1); }}><option value="all">全部结果</option><option value="published">通过</option><option value="revision">退回修改</option><option value="hidden">拒绝</option></select>
          <input aria-label="搜索作品或作者" placeholder="搜索作品标题或作者" value={historyFilters.q} onChange={(event) => { setHistoryFilters((current) => ({ ...current, q: event.target.value })); setHistoryPage(1); }}/>
          <button type="button" disabled={historyLoading} onClick={() => void loadHistory()}>{historyLoading ? "加载中…" : "查询"}</button>
        </div>
        {history.length ? <div className="admin-ai-history-list">{history.map((row) => <article key={row.id}><div><strong>{row.title}</strong><small>{row.author} · {row.channel === "ai" ? "AI 专区" : "精选"} · {new Date(row.createdAt).toLocaleString("zh-CN")}</small></div><span>{row.decision === "published" ? "通过" : row.decision === "revision" ? "退回修改" : "拒绝"}</span><p>{row.reason}</p><small>处理人：{row.actor}</small></article>)}</div> : <p className="admin-ai-data-note">{historyLoading ? "正在读取历史…" : "暂无符合条件的记录。"}</p>}
        <div className="admin-ai-history-pager">
          <button type="button" disabled={historyPage <= 1 || historyLoading} onClick={() => setHistoryPage((value) => Math.max(1, value - 1))}>上一页</button>
          <span>第 {historyPage} 页 · 共 {historyTotal} 条</span>
          <button type="button" disabled={historyLoading || historyPage * 10 >= historyTotal} onClick={() => setHistoryPage((value) => value + 1)}>下一页</button>
        </div>
      </details>
    </section>
    </>}
  </main>;
}
