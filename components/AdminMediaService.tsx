"use client";

/**
 * 媒体服务：成功率、任务检索与上传链路详情。
 * 数据来自 upload_tasks / media_assets（服务端真实记录），不展示模拟统计。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FileText, Film, Image as ImageIcon, Search, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, fmtBytes, fmtDuration, fmtNum, fmtPct, fmtTime, Group, Ring, Segmented } from "./admin/AdminUIKit";
import AdminStorage from "./AdminStorage";

type Overview = {
  window: string; total_tasks: number; ready: number; failed: number;
  first_attempt_success_rate: number | null; final_success_rate: number | null;
  avg_duration_ms: number | null; p95_duration_ms: number | null; total_bytes: number;
  status_counts: Record<string, number>;
  recent_failures: { task_key: string; file_name: string | null; error_code: string | null; error_message: string | null; client_type: string | null; updated_at: string }[];
  sample_note: string;
};
type Task = {
  task_key: string; media_upload_id: string | null; post_id: string | null; file_name: string | null; file_size: number | null;
  mime_type: string | null; client_type: string | null; client_version: string | null; status: string; progress: number | null;
  bytes_sent: number | null; attempts: number | null; error_code: string | null; error_message: string | null;
  storage_path: string | null; verify_result: string | null; created_at: string; updated_at: string; finished_at: string | null; duration_ms: number | null;
};
type ChainStage = { stage: string; status: string; at?: string; note?: string };
type Trace = { task: Task; media_asset: { post_id: string | null; checksum_sha256: string | null; byte_size: number | null; status: string | null } | null; chain: ChainStage[] };

const STATUS_LABEL: Record<string, string> = {
  created: "已创建", preparing: "准备中", compressing: "压缩中", queued: "排队中", uploading: "上传中",
  verifying: "校验中", ready: "已就绪", failed: "失败", cancelled: "已取消", retrying: "重试中",
};

export default function AdminMediaService({ refreshKey = 0 }: { refreshKey?: number }) {
  const [view, setView] = useState<"tasks" | "storage">("tasks");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<"all" | "ready" | "failed" | "active">("all");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [verify, setVerify] = useState<{ exists: boolean; note: string; checked_at: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [overviewResult, taskResult] = await Promise.all([
        cloudRequest("/api/v1/admin/media-service?view=overview") as Promise<Overview>,
        cloudRequest(`/api/v1/admin/media-service?view=tasks${appliedQuery ? `&task_key=${encodeURIComponent(appliedQuery)}` : ""}`) as Promise<{ tasks: Task[] }>,
      ]);
      setOverview(overviewResult);
      setTasks(taskResult.tasks || []);
    } catch (e) { setError(e instanceof Error ? e.message : "媒体数据读取失败"); }
    finally { setLoading(false); }
  }, [appliedQuery]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const filtered = useMemo(() => tasks.filter((task) => {
    if (status === "ready") return task.status === "ready";
    if (status === "failed") return task.status === "failed";
    if (status === "active") return ["uploading", "queued", "verifying", "created", "preparing", "compressing", "retrying"].includes(task.status);
    return true;
  }), [tasks, status]);

  const openTrace = async (task: Task) => {
    setTraceLoading(true); setTrace(null); setVerify(null); setError("");
    try {
      const result = await cloudRequest(`/api/v1/admin/media-service?view=trace&task_key=${encodeURIComponent(task.task_key)}`) as Trace;
      setTrace(result);
    } catch (e) { setError(e instanceof Error ? e.message : "链路读取失败"); }
    finally { setTraceLoading(false); }
  };

  const runVerify = async () => {
    if (!trace?.task.storage_path) return;
    try {
      const result = await cloudRequest("/api/v1/admin/media-service", { action: "verify", storage_path: trace.task.storage_path }, "POST") as { exists: boolean; note: string; checked_at: string };
      setVerify(result);
    } catch (e) { setError(e instanceof Error ? e.message : "校验失败"); }
  };

  if (trace || traceLoading) return <TraceView trace={trace} loading={traceLoading} error={error} verify={verify} onVerify={runVerify} onBack={() => { setTrace(null); setVerify(null); }} />;

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <Segmented value={view} ariaLabel="媒体视图" onChange={setView} options={[{ value: "tasks", label: "上传任务" }, { value: "storage", label: "存储资源" }]} />

      {view === "storage" ? <AdminStorage /> : (
        <>
          <div className="ab-card tone-emerald" style={{ gap: 12 }}>
            <div className="ab-card__head"><span className="ab-card__title">上传成功率</span><span className="ab-card__badge">近 24 小时</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Ring value={overview?.final_success_rate ?? null} size={108} stroke={10} tone="emerald" label="最终成功" large />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, flex: 1 }}>
                <div><b className="ab-kpi ab-kpi--sm" style={{ display: "block" }}>{fmtNum(overview?.ready)}</b><span className="ab-label">成功</span></div>
                <div><b className="ab-kpi ab-kpi--sm" style={{ display: "block", color: (overview?.failed || 0) > 0 ? "var(--ab-coral)" : undefined }}>{fmtNum(overview?.failed)}</b><span className="ab-label">失败</span></div>
                <div><b style={{ fontSize: 15, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtPct(overview?.first_attempt_success_rate)}</b><span className="ab-label">首次成功率</span></div>
                <div><b style={{ fontSize: 15, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtBytes(overview?.total_bytes)}</b><span className="ab-label">传输流量</span></div>
              </div>
            </div>
            <p className="ab-label" style={{ margin: 0 }}>{overview?.sample_note || "样本不足时不做稳定性结论。"}</p>
          </div>

          <div className="ab-bento">
            {[
              ["平均耗时", fmtDuration(overview?.avg_duration_ms)],
              ["P95 耗时", fmtDuration(overview?.p95_duration_ms)],
              ["上传中", fmtNum(overview?.status_counts?.uploading)],
              ["排队", fmtNum(overview?.status_counts?.queued)],
            ].map(([label, value]) => (
              <div key={label} className="ab-card ab-card--tight ab-c2 ab-m3" style={{ gap: 2 }}>
                <span className="ab-label">{label}</span>
                <b style={{ fontSize: 17, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{value}</b>
              </div>
            ))}
          </div>

          <div className="ab-toolbar">
            <Segmented value={status} ariaLabel="任务状态" onChange={setStatus} options={[{ value: "all", label: "全部" }, { value: "ready", label: "成功" }, { value: "failed", label: "失败" }, { value: "active", label: "进行中" }]} />
          </div>
          <form className="ab-search" onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query.trim()); }}>
            <Search size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务编号或文件名" aria-label="搜索上传任务" />
            {appliedQuery ? <button type="submit" style={{ border: 0, background: "none", color: "var(--ab-ink-3)" }} aria-label="清除搜索"><X size={14} /></button> : null}
          </form>
          {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
          <Group>
            {loading ? <div className="ab-skel" style={{ height: 180, margin: 12 }} /> : filtered.length ? filtered.map((task) => {
              const Icon = task.mime_type?.startsWith("video") ? Film : task.mime_type?.startsWith("image") ? ImageIcon : FileText;
              return (
                <button key={task.task_key} type="button" className="ab-item" style={{ border: 0, borderRadius: 0, background: "transparent" }} onClick={() => void openTrace(task)}>
                  <span className="ab-item__thumb"><Icon size={18} /></span>
                  <span className="ab-item__body">
                    <span className="ab-item__title">{task.file_name || `任务 ${task.task_key.slice(0, 10)}`}</span>
                    <span className="ab-item__meta">
                      <span>{fmtBytes(task.file_size)}</span><span>·</span>
                      <span>{task.client_type || "未知客户端"}{task.client_version ? ` ${task.client_version}` : ""}</span><span>·</span>
                      <span>{fmtTime(task.created_at)}</span>
                      {task.attempts && task.attempts > 1 ? <><span>·</span><span>重试 {task.attempts - 1} 次</span></> : null}
                    </span>
                  </span>
                  <span className="ab-item__right">
                    <span className={`ab-chip ${task.status === "ready" ? "ok" : task.status === "failed" ? "bad" : "info"}`}>{STATUS_LABEL[task.status] || task.status}</span>
                  </span>
                </button>
              );
            }) : <Empty title={appliedQuery ? "没有匹配的上传任务" : "暂无上传任务"} hint="上线后新产生的上传会实时出现在这里。" />}
          </Group>
          {overview?.recent_failures?.length ? (
            <div>
              <div className="ab-section__head"><h2 className="ab-section__title">最近失败</h2><span className="ab-section__meta">{overview.recent_failures.length} 条</span></div>
              <Group>
                {overview.recent_failures.slice(0, 5).map((failure) => (
                  <div key={failure.task_key} className="ab-row">
                    <span className="ab-row__icon tone-coral"><FileText size={14} /></span>
                    <span className="ab-row__body">
                      <span className="ab-row__title">{failure.file_name || failure.task_key.slice(0, 10)}</span>
                      <span className="ab-row__meta">{failure.error_code || "未分类"} · {failure.error_message || "无错误描述"} · {fmtTime(failure.updated_at)}</span>
                    </span>
                  </div>
                ))}
              </Group>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function TraceView({
  trace, loading, error, verify, onVerify, onBack,
}: {
  trace: Trace | null; loading: boolean; error: string; verify: { exists: boolean; note: string; checked_at: string } | null;
  onVerify: () => void; onBack: () => void;
}) {
  const stages = useMemo(() => {
    if (!trace) return [];
    const chain = trace.chain || [];
    const find = (keyword: string) => chain.find((stage) => stage.stage.includes(keyword));
    return [
      { key: "read", title: "文件读取 / 压缩", status: find("文件读取")?.status || "unknown", note: find("文件读取")?.note || "历史任务未采集此阶段" },
      { key: "create", title: "任务创建", status: "completed", note: fmtTime(trace.task.created_at) },
      { key: "auth", title: "获取上传授权", status: "unknown", note: "历史任务未采集此阶段" },
      { key: "transfer", title: "文件传输", status: find("网络传输")?.status || "unknown", note: find("网络传输")?.note || (trace.task.bytes_sent ? `${fmtBytes(trace.task.bytes_sent)}` : "未上报字节数") },
      { key: "storage", title: "存储确认", status: trace.task.verify_result === "ok" ? "completed" : "unknown", note: trace.task.storage_path ? `路径 ${trace.task.storage_path}` : "无存储路径" },
      { key: "verify", title: "完整性校验", status: trace.task.verify_result === "ok" ? "completed" : trace.task.verify_result || "unknown", note: trace.task.verify_result === "ok" ? "对象存在且大小一致" : trace.task.error_message || "未完成校验" },
      { key: "link", title: "作品关联", status: trace.media_asset?.post_id ? "completed" : "pending", note: trace.media_asset?.post_id ? "已关联作品" : "未关联作品（staging 或已清理）" },
    ];
  }, [trace]);

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="ab-iconbtn" aria-label="返回任务列表" onClick={onBack}><ArrowLeft size={18} /></button>
        <span style={{ fontSize: 13, color: "var(--ab-ink-3)" }}>上传链路</span>
      </div>
      {loading ? <div className="ab-skel" style={{ height: 260, borderRadius: 18 }} /> : null}
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
      {trace ? (
        <>
          <div className="ab-panel">
            <h3 className="ab-panel__title">任务信息</h3>
            <dl className="ab-kv">
              <dt>文件</dt><dd>{trace.task.file_name || "未记录文件名"}</dd>
              <dt>大小</dt><dd>{fmtBytes(trace.task.file_size)}</dd>
              <dt>客户端</dt><dd>{trace.task.client_type || "未知"}{trace.task.client_version ? ` ${trace.task.client_version}` : ""}</dd>
              <dt>状态</dt><dd>{STATUS_LABEL[trace.task.status] || trace.task.status}</dd>
              <dt>重试</dt><dd>{Math.max(0, (trace.task.attempts || 1) - 1)} 次</dd>
              <dt>耗时</dt><dd>{fmtDuration(trace.task.duration_ms)}</dd>
              <dt>创建</dt><dd>{fmtTime(trace.task.created_at)}</dd>
              <dt>完成</dt><dd>{fmtTime(trace.task.finished_at)}</dd>
              <dt>任务号</dt><dd style={{ fontSize: 11 }}>{trace.task.task_key}</dd>
            </dl>
          </div>
          <div className="ab-panel">
            <h3 className="ab-panel__title">链路时间轴</h3>
            <div className="ab-timeline">
              {stages.map((stage) => (
                <div key={stage.key} className="ab-tl-item">
                  <span className={`ab-tl-dot ${stage.status === "completed" ? "ok" : stage.status === "failed" ? "bad" : "pending"}`}>
                    {stage.status === "completed" ? <Check size={10} /> : stage.status === "failed" ? <X size={10} /> : <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "block" }} />}
                  </span>
                  <span className="ab-tl-body">
                    <span className="ab-tl-title">{stage.title}</span>
                    <span className="ab-tl-meta">{stage.status === "unknown" ? "未采集 · " : ""}{stage.note}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="ab-label" style={{ marginTop: 10 }}>未采集的节点显示为「未采集」，不补造时间与状态。</p>
          </div>
          <div className="ab-panel">
            <h3 className="ab-panel__title">存储核验</h3>
            <button type="button" className="ab-chip info" style={{ border: 0, padding: "8px 12px" }} onClick={onVerify} disabled={!trace.task.storage_path}>核验对象是否仍然存在</button>
            {verify ? <p style={{ fontSize: 12, marginTop: 8, color: verify.exists ? "var(--ab-emerald)" : "var(--ab-coral)" }}>{verify.note} · {fmtTime(verify.checked_at)}</p> : <p className="ab-label" style={{ marginTop: 8 }}>只读取事实，不会修改或恢复存储对象。</p>}
          </div>
        </>
      ) : null}
    </div>
  );
}
