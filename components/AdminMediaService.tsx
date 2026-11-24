"use client";

/**
 * 媒体服务中心：上传任务检索、成功率口径、链路追踪、存储占用与孤立资源扫描。
 * 数据来自 upload_tasks / media_assets（服务端真实记录），不展示模拟统计。
 */

import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw, Search } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type Overview = {
  window: string;
  total_tasks: number;
  ready: number;
  failed: number;
  first_attempt_success_rate: number | null;
  final_success_rate: number | null;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  total_bytes: number;
  status_counts: Record<string, number>;
  recent_failures: { task_key: string; file_name: string | null; error_code: string | null; error_message: string | null; client_type: string | null; updated_at: string }[];
  sample_note: string;
};

type TaskRow = {
  task_key: string;
  post_id: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  client_type: string | null;
  client_version: string | null;
  status: string;
  progress: number;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  storage_path: string | null;
  verify_result: string | null;
  created_at: string;
  duration_ms: number | null;
};

type Trace = {
  task: TaskRow & { bytes_sent: number | null; events: unknown };
  media_asset: { storage_path: string; checksum_sha256: string | null; status: string; post_id: string | null } | null;
  chain: { stage: string; status: string; at?: string | null; note?: string }[];
};

type StorageOverview = {
  buckets: { bucket: string; files: number; bytes: number; error: string | null }[];
  media_assets: number | null;
  post_media_rows: number | null;
  note: string;
};

const STATUS_LABEL: Record<string, string> = {
  created: "已创建", preparing: "准备中", compressing: "压缩中", queued: "排队中",
  uploading: "上传中", retrying: "重试中", verifying: "校验中", ready: "成功",
  failed: "失败", cancelled: "已取消",
};

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminMediaService() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [storage, setStorage] = useState<StorageOverview | null>(null);
  const [scan, setScan] = useState<{ unclaimed_staging_assets: { storage_path: string; age_days: number; byte_size: number | null; status: string }[]; missing_objects: { storage_path: string; post_id: string }[]; note: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    setError("");
    try {
      const [overviewData, taskData, storageData] = await Promise.all([
        cloudRequest("/api/v1/admin/media-service?view=overview") as Promise<Overview>,
        cloudRequest(`/api/v1/admin/media-service?view=tasks${statusFilter !== "all" ? `&status=${statusFilter}` : ""}${query.trim() ? `&task_key=${encodeURIComponent(query.trim())}` : ""}`) as Promise<{ tasks: TaskRow[] }>,
        cloudRequest("/api/v1/admin/storage") as Promise<StorageOverview>,
      ]);
      setOverview(overviewData);
      setTasks(taskData.tasks || []);
      setStorage(storageData);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "媒体服务数据读取失败");
    } finally {
      setBusy(false);
    }
  }, [statusFilter, query]);

  useEffect(() => { void load(); }, [load]);

  const openTrace = async (taskKey: string) => {
    try {
      const data = await cloudRequest(`/api/v1/admin/media-service?view=trace&task_key=${encodeURIComponent(taskKey)}`) as Trace;
      setTrace(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "链路读取失败");
    }
  };

  return (
    <div className="admin-monitor">
      <div className="admin-module-heading">
        <div><strong>媒体服务中心</strong><small>上传任务全链路追踪 · 首次与最终成功率分开统计 · 存储占用真实遍历</small></div>
        <button type="button" className="soft-button" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> {busy ? "刷新中…" : "刷新"}</button>
      </div>
      {error && <p className="moderation-feedback error" role="alert">{error}</p>}

      {overview && <div className="admin-overview admin-overview-expanded" aria-label="上传服务指标">
        <div><strong>{overview.total_tasks}</strong><span>24h 上传任务</span><small>含重试，样本 {overview.total_tasks}</small></div>
        <div><strong>{overview.first_attempt_success_rate != null ? `${overview.first_attempt_success_rate}%` : "—"}</strong><span>首次上传成功率</span><small>不受重试结果美化</small></div>
        <div><strong>{overview.final_success_rate != null ? `${overview.final_success_rate}%` : "—"}</strong><span>最终上传成功率</span><small>成功 {overview.ready} / 失败 {overview.failed}</small></div>
        <div><strong>{overview.avg_duration_ms != null ? `${overview.avg_duration_ms} ms` : "—"}</strong><span>平均上传耗时</span><small>P95 {overview.p95_duration_ms != null ? `${overview.p95_duration_ms} ms` : "—"}</small></div>
        <div><strong>{formatBytes(overview.total_bytes)}</strong><span>24h 上传流量</span><small>按任务累计字节</small></div>
      </div>}
      {overview?.sample_note && <p className="moderation-empty">{overview.sample_note}</p>}

      <div className="admin-module-heading"><div><strong>上传任务检索</strong><small>点击任务查看完整链路；仅管理员可读。</small></div></div>
      <form className="admin-user-search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <input aria-label="任务编号" placeholder="按任务编号 / 上传编号搜索" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="soft-button" onClick={() => void load()}><Search size={14}/> 搜索</button>
      </form>
      <div className="moderation-filters" role="group" aria-label="任务状态">
        {["all", "ready", "uploading", "failed", "cancelled"].map((value) => (
          <button key={value} type="button" className={statusFilter === value ? "selected" : ""} onClick={() => setStatusFilter(value)}>{value === "all" ? "全部" : STATUS_LABEL[value] || value}</button>
        ))}
      </div>
      <ul className="monitor-alerts">
        {tasks.map((task) => <li key={task.task_key} className={`is-${task.status === "ready" ? "resolved" : task.status === "failed" ? "open" : "pending"}`}>
          <div>
            <strong>{task.file_name || task.task_key.slice(0, 12)}</strong>
            <small>{STATUS_LABEL[task.status] || task.status} · {formatBytes(task.file_size)} · {task.client_type || "未知客户端"} · 尝试 {task.attempts} 次{task.error_message ? ` · ${task.error_message}` : ""}</small>
          </div>
          <button type="button" className="soft-button" onClick={() => void openTrace(task.task_key)}>链路</button>
        </li>)}
        {!tasks.length && <li className="moderation-empty">暂无上传任务记录。</li>}
      </ul>

      {trace && <div className="monitor-trace" role="dialog" aria-label="上传链路详情">
        <div className="admin-module-heading"><div><strong>{trace.task.file_name || trace.task.task_key}</strong><small>完整任务事件链路</small></div><button type="button" className="soft-button" onClick={() => setTrace(null)}>关闭</button></div>
        <ol>{trace.chain.map((step) => <li key={step.stage}><strong>{step.stage}</strong><span>{step.status}{step.at ? ` · ${new Date(step.at).toLocaleString("zh-CN")}` : ""}</span>{step.note && <small>{step.note}</small>}</li>)}</ol>
        {trace.task.storage_path && <p className="monitor-trace-path">对象路径：{trace.task.storage_path}{trace.task.bytes_sent != null ? ` · ${formatBytes(trace.task.bytes_sent)}` : ""}{trace.task.error_code ? ` · 错误码 ${trace.task.error_code}` : ""}</p>}
      </div>}

      <div className="admin-module-heading"><div><strong>存储资源</strong><small>对象存储无固定容量上限，展示真实使用量。</small></div>
        <button type="button" className="soft-button" onClick={async () => { try { setScan(await cloudRequest("/api/v1/admin/storage", { action: "scan" }, "POST")); } catch (e) { setError(e instanceof Error ? e.message : "扫描失败"); } }}><HardDrive size={14}/> 孤立资源扫描</button>
      </div>
      {storage && <ul className="monitor-alerts">
        {storage.buckets.map((bucket) => <li key={bucket.bucket} className="is-resolved"><div><strong>{bucket.bucket}</strong><small>{bucket.error ? `读取失败：${bucket.error}` : `${bucket.files} 个对象 · ${formatBytes(bucket.bytes)}`}</small></div></li>)}
        <li className="is-pending"><div><strong>登记口径</strong><small>media_assets {storage.media_assets ?? "—"} 条 · post_media {storage.post_media_rows ?? "—"} 行。{storage.note}</small></div></li>
      </ul>}
      {scan && <div className="monitor-trace">
        <div className="admin-module-heading"><div><strong>孤立资源扫描报告（只读）</strong><small>{scan.note}</small></div></div>
        <p>未认领 staging 资产：{scan.unclaimed_staging_assets.length} 项（建议 7 天宽限期后清理）；缺失对象：{scan.missing_objects.length} 项（无法服务端恢复，需用户重新上传）。</p>
        <ul>{scan.unclaimed_staging_assets.slice(0, 10).map((item) => <li key={item.storage_path}>{item.storage_path} · {item.age_days} 天前 · {formatBytes(item.byte_size)}</li>)}</ul>
      </div>}
    </div>
  );
}
