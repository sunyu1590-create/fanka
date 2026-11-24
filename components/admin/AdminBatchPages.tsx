"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, Square, Sparkles } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, fmtNum, fmtTime, Group, Segmented } from "./AdminUIKit";

type Batch = {
  id: string; task_type: string; status: string; config_snapshot: { model?: string };
  total_count: number; completed_count: number; review_count: number; failed_count: number;
  current_post_title: string | null; last_error?: string | null; created_at: string;
  task_usage: { totalTokens: number; requests: number; costs: Record<string, number> | null } | null;
};
type ClassificationItem = { id: string; status: string; result: { applied?: boolean; reason?: string; categoryName?: string | null } | null; error_message: string | null; updated_at: string; post: { id: string; title: string; channel: string } | null };

const TASK_LABEL: Record<string, string> = { summary_all: "全量生成 AI 总结", summary_incremental: "增量生成 AI 总结", review_pending: "一键 AI 审核", classification: "自动分类与标签" };
const STATUS_LABEL: Record<string, string> = { queued: "等待启动", running: "处理中", paused: "已暂停", completed: "已完成", cancelled: "已中止", failed: "失败" };

export function AdminBatchTasks({ refreshKey = 0 }: { refreshKey?: number }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [includeExisting, setIncludeExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest("/api/v1/admin/ai-tasks") as { batches: Batch[] };
      setBatches(result.batches || []);
    } catch (e) { setError(e instanceof Error ? e.message : "任务读取失败"); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const create = async (taskType: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await cloudRequest("/api/v1/admin/ai-tasks", { taskType, includeExisting }, "POST");
      setNotice(`${TASK_LABEL[taskType]}任务已创建。`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "任务创建失败"); }
    finally { setBusy(false); }
  };

  const action = async (batch: Batch, key: string) => {
    setBusy(true); setError("");
    try {
      await cloudRequest(`/api/v1/admin/ai-tasks/${batch.id}`, { action: key }, key === "retry" ? "PATCH" : "POST");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  };

  const active = batches.filter((batch) => ["queued", "running", "paused"].includes(batch.status));
  const finished = batches.filter((batch) => !["queued", "running", "paused"].includes(batch.status));

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="ab-card" style={{ gap: 12 }}>
        <div className="ab-card__head"><span className="ab-card__title">新建任务</span><span className="ab-card__badge">真实逐篇处理</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
          {[
            ["review_pending", "一键 AI 审核"],
            ["classification", "自动分类"],
            ["summary_incremental", "增量总结"],
            ["summary_all", "全量总结"],
          ].map(([key, label]) => (
            <button key={key} type="button" disabled={busy} onClick={() => void create(key)} style={{ border: "1px solid var(--ab-line)", borderRadius: 13, background: "var(--ab-surface)", color: "var(--ab-ink)", padding: "12px 10px", fontSize: 12.5, fontWeight: 550 }}>
              {label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ab-ink-2)" }}>
          <input type="checkbox" checked={includeExisting} onChange={(event) => setIncludeExisting(event.target.checked)} />
          包含已处理内容（会重新消耗模型额度）
        </label>
        <p className="ab-label" style={{ margin: 0 }}>任务逐篇处理，可暂停、恢复和重试失败项；全量重算默认关闭。</p>
        {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
        {notice ? <p className="ab-sub" style={{ color: "var(--ab-emerald)" }}>{notice}</p> : null}
      </div>

      <div>
        <div className="ab-section__head"><h2 className="ab-section__title">进行中</h2><span className="ab-section__meta">{active.length} 个</span></div>
        <Group>
          {active.length ? active.map((batch) => <BatchRow key={batch.id} batch={batch} busy={busy} onAction={action} />) : <Empty title="没有进行中的任务" />}
        </Group>
      </div>

      <div>
        <div className="ab-section__head"><h2 className="ab-section__title">历史任务</h2><span className="ab-section__meta">{finished.length} 个</span></div>
        <Group>
          {finished.length ? finished.slice(0, 20).map((batch) => <BatchRow key={batch.id} batch={batch} busy={busy} onAction={action} />) : <Empty title="暂无历史任务" />}
        </Group>
      </div>
    </div>
  );
}

function BatchRow({ batch, busy, onAction }: { batch: Batch; busy: boolean; onAction: (batch: Batch, key: string) => Promise<void> }) {
  const percent = batch.total_count ? Math.min(100, Math.round(((batch.completed_count + batch.review_count + batch.failed_count) / batch.total_count) * 100)) : 100;
  const cost = batch.task_usage?.costs ? Object.entries(batch.task_usage.costs).map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`).join(" · ") : null;
  return (
    <div className="ab-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="ab-row__body">
          <span className="ab-row__title">{TASK_LABEL[batch.task_type] || batch.task_type}</span>
          <span className="ab-row__meta">{batch.config_snapshot?.model || "模型未记录"} · {fmtTime(batch.created_at)}{batch.current_post_title ? ` · 正在处理 ${batch.current_post_title}` : ""}</span>
        </span>
        <span className={`ab-chip ${batch.status === "running" ? "info" : batch.status === "failed" ? "bad" : batch.status === "completed" ? "ok" : "warn"}`}>{STATUS_LABEL[batch.status] || batch.status}</span>
        <span className="ab-row__value">{percent}%</span>
      </div>
      <div className="ab-bar"><i style={{ width: `${percent}%` }} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 10.5, color: "var(--ab-ink-3)" }}>
        <span>总数 {batch.total_count}</span><span>完成 {batch.completed_count}</span><span>待复审 {batch.review_count}</span><span>失败 {batch.failed_count}</span>
        {batch.task_usage ? <span>Token {fmtNum(batch.task_usage.totalTokens)}{cost ? ` · 费用 ${cost}` : ""}</span> : null}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {batch.status === "queued" ? <button type="button" className="ab-chip info" style={{ border: 0 }} disabled={busy} onClick={() => void onAction(batch, "start")}><Play size={11} />启动</button> : null}
          {batch.status === "running" ? <button type="button" className="ab-chip" style={{ border: 0 }} disabled={busy} onClick={() => void onAction(batch, "pause")}><Pause size={11} />暂停</button> : null}
          {batch.status === "paused" ? <button type="button" className="ab-chip info" style={{ border: 0 }} disabled={busy} onClick={() => void onAction(batch, "resume")}><Play size={11} />继续</button> : null}
          {["queued", "running", "paused"].includes(batch.status) ? <button type="button" className="ab-chip bad" style={{ border: 0 }} disabled={busy} onClick={() => void onAction(batch, "cancel")}><Square size={11} />中止</button> : null}
          {["completed", "failed"].includes(batch.status) && batch.failed_count > 0 ? <button type="button" className="ab-chip warn" style={{ border: 0 }} disabled={busy} onClick={() => void onAction(batch, "retry")}><RotateCcw size={11} />重试</button> : null}
        </span>
      </div>
      {batch.last_error ? <span style={{ fontSize: 10.5, color: "var(--ab-coral)" }}>最近失败：{batch.last_error}</span> : null}
    </div>
  );
}

export function AdminClassifyRecords({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<ClassificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "applied" | "pending" | "failed">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const result = await cloudRequest("/api/v1/admin/ai-tasks") as { classificationItems: ClassificationItem[] };
        if (alive) setItems(result.classificationItems || []);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "分类记录读取失败"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  const filtered = useMemo(() => items.filter((item) => {
    if (filter === "applied") return item.result?.applied;
    if (filter === "pending") return !item.error_message && !item.result?.applied;
    if (filter === "failed") return Boolean(item.error_message);
    return true;
  }), [items, filter]);

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <Segmented
        value={filter}
        ariaLabel="分类记录筛选"
        onChange={setFilter}
        options={[
          { value: "all", label: "全部", count: items.length },
          { value: "applied", label: "已应用" },
          { value: "pending", label: "未应用" },
          { value: "failed", label: "异常" },
        ]}
      />
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
      <Group>
        {loading ? <div className="ab-skel" style={{ height: 160, margin: 12 }} /> : filtered.length ? filtered.map((item) => (
          <div key={item.id} className="ab-row">
            <span className="ab-row__body">
              <span className="ab-row__title">{item.post?.title || "作品不可用"}</span>
              <span className="ab-row__meta">
                {item.result?.categoryName ? `建议分类：${item.result.categoryName}` : "无分类建议"} · {item.result?.reason || item.error_message || "无说明"} · {fmtTime(item.updated_at)}
              </span>
            </span>
            {item.error_message ? <span className="ab-chip bad">异常</span> : item.result?.applied ? <span className="ab-chip ok">已应用</span> : <span className="ab-chip">未应用</span>}
          </div>
        )) : <Empty icon={<Sparkles size={20} />} title="暂无分类记录" hint="批量分类任务完成后会在此留存建议与应用结果。" />}
      </Group>
    </div>
  );
}
