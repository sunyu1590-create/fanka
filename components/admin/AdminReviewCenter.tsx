"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, FileWarning, PenLine, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { confirmInApp } from "@/lib/in-app-dialog";
import ChoiceSelect from "../ChoiceSelect";
import { Collapse, Empty, fmtNum, fmtTime, Group, Ring, Segmented } from "./AdminUIKit";

type ReviewResult = { decision?: string; riskLevel?: string; riskTypes?: string[]; reason?: string; evidence?: string[]; evidenceValidated?: boolean; manualDecision?: string; manualReason?: string };
type ReviewItem = {
  id: string; batch_id: string; post_id: string | null; status: string; result: ReviewResult | null;
  result_history: Array<{ result: ReviewResult; model: string | null; recorded_at: string; status: string }>;
  error_message: string | null; created_at: string; updated_at: string;
  postNotice?: "post_deleted" | "post_unreadable" | null;
  post: { id: string; title: string; body: string; channel: string; status: string; author_id: string | null; profiles: { nickname: string } | { nickname: string }[] | null } | null;
};
type Batch = { id: string; task_type: string; status: string; config_snapshot: { model?: string }; total_count: number; completed_count: number; review_count: number; failed_count: number; current_post_title: string | null; created_at: string };
type ClassificationItem = { id: string; status: string; result: { applied?: boolean; reason?: string; categoryName?: string | null } | null; error_message: string | null; updated_at: string; post: { id: string; title: string; channel: string } | null };
type HistoryRow = { id: number; postId: string | null; title: string; channel: string; author: string; decision: string; reason: string; actor: string; createdAt: string };

type Tab = "ai" | "manual" | "history" | "anomaly";

const riskLabel: Record<string, string> = { high: "高风险", medium: "中风险", low: "低风险", none: "无明显风险" };
const decisionLabel: Record<string, string> = { published: "通过", hidden: "驳回", revision: "退回修改", pending: "待处理" };
const QUICK_REASONS = ["分类不准确", "标题不规范", "内容质量不足", "疑似广告", "版权或授权问题", "内容不适宜"];

function firstProfile(value: { nickname: string } | { nickname: string }[] | null | undefined) {
  return Array.isArray(value) ? value[0]?.nickname || "" : value?.nickname || "";
}

export default function AdminReviewCenter({ refreshKey = 0, onNavigate }: { refreshKey?: number; onNavigate?: (section: string) => void }) {
  const [tab, setTab] = useState<Tab>("ai");
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classification, setClassification] = useState<ClassificationItem[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilters, setHistoryFilters] = useState({ days: "30", channel: "all", result: "all", q: "" });
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState<Array<{ id: string; post_id: string | null; archive_reason: string | null; archived_at: string; content_state: string | null }> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [taskResult, historyResult] = await Promise.allSettled([
      cloudRequest("/api/v1/admin/ai-tasks") as Promise<{ batches: Batch[]; reviewItems: ReviewItem[]; classificationItems: ClassificationItem[] }>,
      cloudRequest(`/api/v1/admin/review-history?days=${historyFilters.days}&channel=${historyFilters.channel}&result=${historyFilters.result}&q=${encodeURIComponent(historyFilters.q)}&page=1&limit=30`) as Promise<{ items?: HistoryRow[]; total?: number }>,
    ]);
    if (taskResult.status === "fulfilled") {
      setReviewItems(taskResult.value.reviewItems || []);
      setBatches(taskResult.value.batches || []);
      setClassification(taskResult.value.classificationItems || []);
    } else {
      setError(taskResult.reason instanceof Error ? taskResult.reason.message : "审核数据读取失败");
    }
    if (historyResult.status === "fulfilled") {
      setHistory(historyResult.value.items || []);
      setHistoryTotal(historyResult.value.total || 0);
    }
    setLoading(false);
  }, [historyFilters]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const anomalies = useMemo(() => reviewItems.filter((item) => !item.post || Boolean(item.error_message)), [reviewItems]);
  const pending = useMemo(() => reviewItems.filter((item) => item.post && !item.error_message), [reviewItems]);
  const runningBatch = useMemo(() => batches.find((batch) => ["running", "queued", "paused"].includes(batch.status)), [batches]);
  const classificationErrors = useMemo(() => classification.filter((item) => Boolean(item.error_message)), [classification]);
  const latestBatches = useMemo(() => batches.slice(0, 4), [batches]);

  const act = async (item: ReviewItem, action: "published" | "hidden" | "revision" | "reanalyze" | "close") => {
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "reanalyze") {
        if (!item.post) throw new Error("关联作品已不存在，无法重新分析；请关闭该审核项");
        await cloudRequest(`/api/v1/admin/ai-tasks/${item.batch_id}`, { action: "reanalyze", itemId: item.id }, "POST");
        setNotice("已重新加入 AI 分析队列。");
      } else if (action === "close") {
        if (reason.trim().length < 3) throw new Error("请填写至少 3 个字的关闭原因");
        const ok = await confirmInApp(`将关闭「${item.post?.title || "这条无关联作品的审核项"}」，关闭后不再出现在待复审队列。`, { title: "关闭审核项", confirmLabel: "确认关闭", danger: true });
        if (!ok) { setBusy(false); return; }
        await cloudRequest(`/api/v1/admin/ai-tasks/${item.batch_id}`, { action: "close", itemId: item.id, reason: reason.trim() }, "POST");
        setNotice("审核项已关闭。");
        setSelected(null); setReason("");
        await load();
      } else {
        if (reason.trim().length < 3) throw new Error("请填写至少 3 个字的审核依据");
        await cloudRequest(`/api/v1/admin/ai-tasks/${item.batch_id}`, { action: "review", itemId: item.id, decision: action, reason: reason.trim() }, "POST");
        setNotice(action === "published" ? "已通过并公开。" : action === "hidden" ? "已驳回并保持隐藏。" : "已退回作者修改。");
        setSelected(null); setReason("");
        await load();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  };

  const loadArchived = async () => {
    try {
      const result = await cloudRequest("/api/v1/admin/ai-tasks/archive?limit=30") as { items: Array<{ id: string; post_id: string | null; archive_reason: string | null; archived_at: string; content_state: string | null }> };
      setArchived(result.items || []);
    } catch (e) { setError(e instanceof Error ? e.message : "归档记录读取失败"); }
  };

  const archiveRecords = async (items: ReviewItem[]) => {
    if (!items.length) return;
    const ok = await confirmInApp(`将清理 ${items.length} 条复审记录。只从复审列表移除，不会删除原作品；仍有效且待审核的作品会被拒绝。`, { title: "清理复审记录", confirmLabel: "清理", danger: true });
    if (!ok) return;
    setArchiving(true); setError(""); setNotice("");
    try {
      const result = await cloudRequest("/api/v1/admin/ai-tasks/archive", { items: items.map((item) => ({ batchId: item.batch_id, itemId: item.id })), reason: "管理员清理失效复审记录" }) as { archived: string[]; blocked: Array<{ id: string; reason: string }> };
      setNotice(`已归档 ${result.archived.length} 条${result.blocked.length ? `，${result.blocked.length} 条被拒绝：${result.blocked[0]?.reason || ""}` : ""}。`);
      setPicked([]); setSelectMode(false);
      if (result.archived.length && archived) void loadArchived();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "清理失败"); }
    finally { setArchiving(false); }
  };

  const reviewRatio = batches.length ? Math.round((batches.filter((batch) => batch.status === "completed").length / batches.length) * 100) : 0;

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="ab-card tone-violet" style={{ gap: 12 }}>
        <div className="ab-card__head">
          <span className="ab-card__title">审核概况</span>
          <span className={`ab-chip ${runningBatch ? "violet" : "ok"}`}><i className={`ab-dot ${runningBatch ? "warn" : ""}`} aria-hidden="true" />{runningBatch ? "AI 正在处理" : "队列空闲"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Ring value={batches.length ? reviewRatio : null} size={82} stroke={8} tone="violet" label="任务完成" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, flex: 1 }}>
            <div><b className="ab-kpi ab-kpi--sm" style={{ display: "block" }}>{fmtNum(pending.length)}</b><span className="ab-label">待人工复审</span></div>
            <div><b className="ab-kpi ab-kpi--sm" style={{ display: "block", color: anomalies.length ? "var(--ab-coral)" : undefined }}>{fmtNum(anomalies.length)}</b><span className="ab-label">审核异常</span></div>
          </div>
        </div>
        {runningBatch ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span>{runningBatch.current_post_title || "准备下一项"}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{runningBatch.completed_count}/{runningBatch.total_count}</span>
            </div>
            <div className="ab-bar tone-blue"><i style={{ width: `${runningBatch.total_count ? Math.round(((runningBatch.completed_count + runningBatch.review_count + runningBatch.failed_count) / runningBatch.total_count) * 100) : 0}%` }} /></div>
          </div>
        ) : null}
      </div>

      <Segmented
        value={tab}
        ariaLabel="审核栏目"
        onChange={(next: Tab) => { setTab(next); setSelected(null); }}
        options={[
          { value: "ai", label: "AI 审核", count: batches.length },
          { value: "manual", label: "人工复审", count: pending.length },
          { value: "history", label: "历史" },
          { value: "anomaly", label: "异常", count: anomalies.length },
        ]}
      />

      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
      {notice ? <p className="ab-sub" style={{ color: "var(--ab-emerald)" }}>{notice}</p> : null}

      {tab === "ai" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div className="ab-section__head"><h2 className="ab-section__title">最近任务</h2><span className="ab-section__meta">{batches.length} 个</span></div>
            <Group>
              {latestBatches.length ? latestBatches.map((batch) => {
                const percent = batch.total_count ? Math.min(100, Math.round(((batch.completed_count + batch.review_count + batch.failed_count) / batch.total_count) * 100)) : 100;
                return (
                  <div key={batch.id} className="ab-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 8 }}>
                      <span className="ab-row__body">
                        <span className="ab-row__title">{batch.task_type === "review_pending" ? "一键 AI 审核" : batch.task_type === "classification" ? "自动分类" : "AI 总结"}</span>
                        <span className="ab-row__meta">{batch.config_snapshot?.model || "模型未记录"} · {fmtTime(batch.created_at)}</span>
                      </span>
                      <span className={`ab-chip ${batch.status === "running" ? "info" : batch.status === "failed" ? "bad" : batch.status === "completed" ? "ok" : ""}`}>{batch.status === "running" ? "处理中" : batch.status === "completed" ? "已完成" : batch.status === "paused" ? "已暂停" : batch.status === "failed" ? "失败" : batch.status}</span>
                      <span className="ab-row__value">{percent}%</span>
                    </div>
                    <div className="ab-bar" style={{ width: "100%" }}><i style={{ width: `${percent}%` }} /></div>
                  </div>
                );
              }) : <Empty title="暂无 AI 审核任务" hint="批量任务可在「批量任务」中创建。" />}
            </Group>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
            <button type="button" className="ab-card ab-card--link ab-card--tight" onClick={() => onNavigate?.("ai-batch")}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>批量任务</span>
              <span className="ab-label">总结 · 审核 · 分类</span>
            </button>
            <button type="button" className="ab-card ab-card--link ab-card--tight" onClick={() => onNavigate?.("ai-classify")}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>分类记录</span>
              <span className="ab-label">建议与应用结果</span>
            </button>
          </div>
        </div>
      ) : null}

      {tab === "manual" ? (
        selected ? (
          <ReviewDetail item={selected} reason={reason} setReason={setReason} busy={busy} onBack={() => setSelected(null)} onAct={act} onArchive={() => void archiveRecords([selected])} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className={`ab-chip ${selectMode ? "info" : ""}`} style={{ border: 0, padding: "7px 11px" }} onClick={() => { setSelectMode(!selectMode); setPicked([]); }}>{selectMode ? "退出选择" : "选择记录"}</button>
              {selectMode && picked.length ? <button type="button" className="ab-chip bad" style={{ border: 0, padding: "7px 11px" }} disabled={archiving} onClick={() => void archiveRecords(pending.filter((item) => picked.includes(item.id)))}><Trash2 size={12} /> 清理所选（{picked.length}）</button> : null}
              <span className="ab-label">{selectMode ? "勾选失效记录后可批量清理；有效且待审核的记录会被拒绝。" : "右上角可清理失效记录，不会删除原作品。"}</span>
            </div>
            <Group>
              {loading ? <div className="ab-skel" style={{ height: 180, margin: 12 }} /> : pending.length ? pending.map((item) => {
                const result = item.result || {};
                const risk = result.riskLevel || "";
                return (
                  <button key={item.id} type="button" className="ab-item" style={{ border: 0, borderRadius: 0, background: "transparent" }} onClick={() => { if (selectMode) { setPicked((current) => current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id]); return; } setSelected(item); setReason(""); }}>
                    {selectMode ? <input type="checkbox" readOnly checked={picked.includes(item.id)} aria-label={`选择 ${item.post?.title || "记录"}`} /> : null}
                    <span className="ab-item__body">
                      <span className="ab-item__title">{item.post?.title || "作品不可用"}</span>
                      <span className="ab-item__meta">
                        <span>{firstProfile(item.post?.profiles || null) || "作者不可用"}</span>
                        <span>·</span>
                        <span>{item.post?.channel === "ai" ? "AI 专区" : "精选"}</span>
                        <span>·</span>
                        <span>{fmtTime(item.updated_at)}</span>
                      </span>
                    </span>
                    <span className="ab-item__right">
                      {risk ? <span className={`ab-chip ${risk === "high" ? "bad" : risk === "medium" ? "warn" : "ok"}`}>{riskLabel[risk] || risk}</span> : null}
                      <ChevronRight size={16} style={{ color: "var(--ab-ink-3)" }} />
                    </span>
                  </button>
                );
              }) : <Empty icon={<ShieldCheck size={22} />} title="审核队列已清空" hint="AI 未转人工的内容不会出现在这里。" />}
            </Group>
            <Collapse title="已归档复审记录" count={archived?.length} hint="只保留审计信息，不进入复审计数" onOpen={() => void loadArchived()}>
              <Group plain>
                {(archived || []).map((row) => (
                  <div key={row.id} className="ab-row">
                    <span className="ab-row__body">
                      <span className="ab-row__title" style={{ fontSize: 12 }}>{row.post_id ? `作品 ${row.post_id.slice(0, 8)}` : "关联作品已删除"}</span>
                      <span className="ab-row__meta">{row.archive_reason || "管理员清理"} · {fmtTime(row.archived_at)}</span>
                    </span>
                    <span className="ab-chip">{(row.content_state === "post_deleted" ? "作品已删除" : row.content_state === "post_published" ? "作品已发布" : row.content_state === "post_hidden" ? "作品已隐藏" : "已处理")}</span>
                  </div>
                ))}
                {archived && !archived.length ? <Empty title="还没有归档记录" /> : null}
              </Group>
            </Collapse>
          </div>
        )
      ) : null}

      {tab === "history" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="ab-toolbar">
            <div className="ab-seg" style={{ flex: 1 }}>
              {["7", "30", "90"].map((days) => (
                <button key={days} type="button" aria-selected={historyFilters.days === days} onClick={() => setHistoryFilters((current) => ({ ...current, days }))}>{days} 天</button>
              ))}
            </div>
            <div style={{ width: 128, flex: "none" }}>
              <ChoiceSelect
                label="审核结果"
                value={historyFilters.result}
                onChange={(value) => setHistoryFilters((current) => ({ ...current, result: value }))}
                options={[
                  { value: "all", label: "全部结果" },
                  { value: "published", label: "通过" },
                  { value: "hidden", label: "驳回" },
                  { value: "revision", label: "退回修改" },
                ]}
              />
            </div>
          </div>
          <Group>
            {history.length ? history.map((row) => (
              <div key={row.id} className="ab-row">
                <span className="ab-row__body">
                  <span className="ab-row__title">{row.title}</span>
                  <span className="ab-row__meta">{row.author} · {row.actor} · {fmtTime(row.createdAt)}</span>
                  <span className="ab-row__meta" style={{ color: "var(--ab-ink-2)" }}>{row.reason}</span>
                </span>
                <span className={`ab-chip ${row.decision === "published" ? "ok" : row.decision === "hidden" ? "bad" : "warn"}`}>{decisionLabel[row.decision] || row.decision}</span>
              </div>
            )) : <Empty title="没有符合条件的审核记录" />}
          </Group>
          <p className="ab-label" style={{ textAlign: "center" }}>共 {historyTotal} 条 · 显示最近 {history.length} 条</p>
        </div>
      ) : null}

      {tab === "anomaly" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Group>
            {anomalies.length ? anomalies.map((item) => {
              const deleted = item.postNotice === "post_deleted";
              return (
                <button
                  key={item.id}
                  type="button"
                  className="ab-row"
                  style={{ alignItems: "flex-start", border: 0, background: "transparent", textAlign: "left", width: "100%" }}
                  onClick={() => { setSelected(item); setReason(""); }}
                >
                  <span className="ab-row__icon tone-coral"><FileWarning size={15} /></span>
                  <span className="ab-row__body">
                    <span className="ab-row__title">{item.post?.title || (deleted ? "关联作品已删除" : "作品不可用")}</span>
                    <span className="ab-row__meta">
                      {item.error_message || (deleted ? "作品记录已不存在（审核项的作品关联已被数据库置空），无法通过或驳回" : "作品记录存在但读取不到，可尝试重新分析")} · {fmtTime(item.updated_at)}
                    </span>
                  </span>
                  <span className="ab-item__right">
                    {deleted ? <span className="ab-chip warn">待关闭</span> : <span className="ab-chip info">可重新分析</span>}
                    <ChevronRight size={16} style={{ color: "var(--ab-ink-3)" }} />
                  </span>
                </button>
              );
            }) : <Empty title="没有审核异常" hint="关联完整、原文可读的审核任务不会出现在这里。" />}
          </Group>
          {classificationErrors.length ? (
            <div>
              <div className="ab-section__head"><h2 className="ab-section__title">分类异常</h2><span className="ab-section__meta">{classificationErrors.length} 条</span></div>
              <Group>
                {classificationErrors.map((item) => (
                  <div key={item.id} className="ab-row">
                    <span className="ab-row__body">
                      <span className="ab-row__title">{item.post?.title || "作品不可用"}</span>
                      <span className="ab-row__meta">{item.error_message || "自动分类未完成"} · {fmtTime(item.updated_at)}</span>
                    </span>
                  </div>
                ))}
              </Group>
            </div>
          ) : null}
          <p className="ab-label" style={{ lineHeight: 1.7 }}>原文不可用的记录不提供通过、驳回等操作，避免在缺少依据时改变作品状态。</p>
        </div>
      ) : null}
    </div>
  );
}

function ReviewDetail({
  item, reason, setReason, busy, onBack, onAct, onArchive,
}: {
  item: ReviewItem;
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  onBack: () => void;
  onAct: (item: ReviewItem, action: "published" | "hidden" | "revision" | "reanalyze" | "close") => Promise<void>;
  onArchive: () => void;
}) {
  const result = item.result || {};
  const author = Array.isArray(item.post?.profiles) ? item.post?.profiles[0]?.nickname : item.post?.profiles?.nickname;
  const blocked = !item.post;
  const deleted = item.postNotice === "post_deleted";
  return (
    <div className="ab-detail">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="ab-iconbtn" aria-label="返回列表" onClick={onBack}><ArrowLeft size={18} /></button>
        <span style={{ fontSize: 13, color: "var(--ab-ink-3)" }}>人工复审详情</span>
        <button type="button" className="ab-chip bad" style={{ marginLeft: "auto", border: 0, padding: "6px 10px" }} onClick={onArchive}><Trash2 size={12} /> 清理记录</button>
      </div>
      <div className="ab-panel">
        <h3 className="ab-panel__title">作品信息</h3>
        <dl className="ab-kv">
          <dt>标题</dt><dd>{item.post?.title || "作品不可用"}</dd>
          <dt>作者</dt><dd>{author || "资料不可用"}</dd>
          <dt>频道</dt><dd>{item.post?.channel === "ai" ? "AI 专区" : "精选内容"}</dd>
          <dt>提交时间</dt><dd>{fmtTime(item.created_at)}</dd>
          <dt>当前状态</dt><dd>{item.post?.status || "关联缺失"}</dd>
        </dl>
      </div>
      <div className="ab-panel" style={{ background: "linear-gradient(158deg, color-mix(in srgb, var(--ab-violet) 10%, var(--ab-surface)) 0%, var(--ab-surface) 60%)" }}>
        <h3 className="ab-panel__title">AI 审核结论</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span className={`ab-chip ${result.riskLevel === "high" ? "bad" : result.riskLevel === "medium" ? "warn" : "ok"}`}>{riskLabel[result.riskLevel || ""] || "未给出风险等级"}</span>
          {(result.riskTypes || []).map((type) => <span key={type} className="ab-chip">{type}</span>)}
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: 0 }}>{result.reason || "模型未提供结构化理由。"}</p>
        <p className="ab-label" style={{ marginTop: 6 }}>摘录校验：{result.evidenceValidated === false ? "未通过，已转人工" : "已核验"} · 处理建议：{decisionLabel[result.decision || ""] || result.decision || "—"}</p>
      </div>
      <div className="ab-panel">
        <h3 className="ab-panel__title">原文内容</h3>
        {blocked ? (
          <div className="ab-empty" style={{ padding: "16px 6px", lineHeight: 1.7 }}>
            {deleted
              ? "该审核项关联的作品记录已不存在（作者删帖或管理员删除后，作品关联被数据库置空）。没有原文就无法复审，只能关闭这条审核项。"
              : "作品记录仍在，但当前读取不到正文（数据异常或权限校验失败）。可先重新分析；若持续失败请联系技术排查。"}
          </div>
        ) : (
          <div style={{ maxHeight: 320, overflow: "auto", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--ab-ink-2)" }}>
            {result.evidence?.length ? highlight(item.post!.body, result.evidence) : item.post!.body}
          </div>
        )}
      </div>
      {item.result_history.length ? (
        <div className="ab-panel">
          <h3 className="ab-panel__title">历次 AI 分析（{item.result_history.length}）</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {item.result_history.slice(0, 3).map((row, index) => (
              <div key={`${row.recorded_at}-${index}`} style={{ fontSize: 11.5, color: "var(--ab-ink-3)" }}>
                {fmtTime(row.recorded_at)} · {row.model || "模型未记录"} · {row.result.reason || "无说明"}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="ab-panel">
        <h3 className="ab-panel__title">审核依据</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {QUICK_REASONS.map((label) => (
            <button key={label} type="button" className="ab-chip" style={{ border: "1px solid var(--ab-line)", background: "var(--ab-surface)" }} onClick={() => {
              const current = reason.trim();
              if (current.includes(label)) return;
              setReason(current ? `${current}；${label}` : label);
            }}>{label}</button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 500))}
          placeholder="写明核对结果和处理依据，至少 3 个字"
          style={{ width: "100%", minHeight: 76, border: "1px solid var(--ab-line)", borderRadius: 12, background: "var(--ab-fill)", color: "var(--ab-ink)", padding: 10, fontSize: 13, resize: "vertical" }}
        />
        {blocked ? <p className="ab-label" style={{ marginTop: 8, color: "var(--ab-coral)" }}>{deleted ? "作品已删除：不允许通过、驳回或退回，只能填写原因后关闭该审核项。" : "原文不可用：不允许执行通过、驳回或退回操作。"}</p> : null}
      </div>
      {/* 操作条固定在视口底部：手机上读完原文就能直接处理，不用滚回最底部。 */}
      <div className="ab-actionbar" role="group" aria-label="审核操作">
        <button type="button" className="is-ok" disabled={busy || blocked || reason.trim().length < 3} onClick={() => void onAct(item, "published")}><Check size={15} />通过</button>
        <button type="button" className="is-bad" disabled={busy || blocked || reason.trim().length < 3} onClick={() => void onAct(item, "hidden")}><X size={15} />驳回</button>
        <button type="button" className="is-warn" disabled={busy || blocked || reason.trim().length < 3} onClick={() => void onAct(item, "revision")}><PenLine size={15} />退回修改</button>
        {deleted ? (
          <button type="button" className="is-neutral" disabled={busy || reason.trim().length < 3} onClick={() => void onAct(item, "close")}><X size={15} />关闭</button>
        ) : (
          <button type="button" className="is-neutral" disabled={busy} onClick={() => void onAct(item, "reanalyze")}><RotateCcw size={15} />重新分析</button>
        )}
      </div>
    </div>
  );
}

function highlight(body: string, excerpts: string[]) {
  const ranges = excerpts.filter(Boolean).flatMap((excerpt) => {
    const found: Array<{ start: number; end: number }> = [];
    let from = 0;
    while (from < body.length) {
      const start = body.indexOf(excerpt, from);
      if (start < 0) break;
      found.push({ start, end: start + excerpt.length });
      from = start + excerpt.length;
    }
    return found;
  }).sort((a, b) => a.start - b.start);
  if (!ranges.length) return body;
  const nodes: Array<string | ReactNode> = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start < cursor) return;
    if (range.start > cursor) nodes.push(body.slice(cursor, range.start));
    nodes.push(<mark key={index} style={{ background: "color-mix(in srgb, var(--ab-amber) 30%, transparent)", color: "inherit", borderRadius: 3 }}>{body.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < body.length) nodes.push(body.slice(cursor));
  return nodes;
}
