"use client";

/**
 * 媒体服务：概览 / 传输任务 / 资源管理 / 历史记录。
 * - 实时进度来自统一实时快照（服务端聚合，1 秒刷新），不使用任何假定时器；
 * - 流量来自反向代理访问日志与 upload_tasks，存储容量来自对象存储真实对象；
 * - 历史记录默认折叠且展开后才请求。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Download, FileText, Film, Image as ImageIcon, RotateCcw, Upload } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { useRealtime } from "@/lib/admin-live";
import { Bars, Collapse, Empty, fmtBytes, fmtDuration, fmtNum, fmtPct, fmtTime, Group, Ring, Segmented } from "./admin/AdminUIKit";
import AdminResources from "./AdminResources";

type Traffic = {
  range: { key: string; label: string; from: string; to: string; days: number };
  upload: { tasks: number; ready: number; failed: number; fileBytes: number; transferredBytes: number; retryExtraBytes: number; retryTasks: number; firstRate: number | null; finalRate: number | null; series: Array<{ day: string; tasks: number; ready: number; failed: number; bytes: number }> };
  download: { requests: number; bytes: number; failed: number; byKind: Array<{ kind: string; requests: number; bytes: number; failed: number; completed: number }>; series: Array<{ day: string; requests: number; bytes: number }> };
  storage: { bytes: number; objects: number; byKind: Array<{ kind: string; objects: number; bytes: number }>; byBucket: Array<{ bucket: string; objects: number; bytes: number }> };
  coverage: { firstDay: string | null; ingestAt: string | null; note: string };
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
const KIND_LABEL: Record<string, string> = { image: "图片", video: "视频音频", attachment: "附件", apk: "安装包", document: "文档" };
const RANGES = [
  { value: "today", label: "今天" }, { value: "yesterday", label: "昨天" }, { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" }, { value: "month", label: "本月" }, { value: "lastMonth", label: "上个月" },
  { value: "all", label: "累计" }, { value: "custom", label: "自定义" },
] as const;

function convert(bytes: number, unit: "auto" | "MB" | "GB") {
  if (unit === "MB") return { value: bytes / 1024 / 1024, label: "MB" };
  if (unit === "GB") return { value: bytes / 1024 / 1024 / 1024, label: "GB" };
  if (bytes >= 1024 ** 3) return { value: bytes / 1024 ** 3, label: "GB" };
  if (bytes >= 1024 ** 2) return { value: bytes / 1024 / 1024, label: "MB" };
  return { value: bytes / 1024, label: "KB" };
}
function round(value: number) { return Math.round(value * 10) / 10; }

export default function AdminMediaService({ refreshKey = 0 }: { refreshKey?: number }) {
  const live = useRealtime();
  const [tab, setTab] = useState<"overview" | "transfer" | "resources" | "history">("overview");
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [unit, setUnit] = useState<"auto" | "MB" | "GB">("auto");
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<"all" | "active" | "ready" | "failed" | "cancelled">("all");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [traceKey, setTraceKey] = useState<string | null>(null);
  const [speeds, setSpeeds] = useState<Record<string, number>>({});
  const prevBytes = useRef<Record<string, { bytes: number; at: number }>>({});
  // 长历史默认折叠：只有展开后才拉取，展开后每页 20 条，实时刷新不清空页码。
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(20);

  const loadTraffic = useCallback(async () => {
    try {
      const params = new URLSearchParams({ range });
      if (range === "custom") { if (!from || !to) return; params.set("from", from); params.set("to", to); }
      const result = await cloudRequest(`/api/v1/admin/media-traffic?${params.toString()}`) as Traffic;
      setTraffic(result);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "流量统计读取失败"); }
  }, [range, from, to]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cloudRequest(`/api/v1/admin/media-service?view=tasks${applied ? `&task_key=${encodeURIComponent(applied)}` : ""}`) as { tasks: Task[] };
      setTasks(result.tasks || []);
    } catch (e) { setError(e instanceof Error ? e.message : "上传任务读取失败"); }
    finally { setLoading(false); }
  }, [applied]);

  useEffect(() => { void loadTraffic(); }, [loadTraffic, refreshKey]);
  useEffect(() => { if (tab === "history" || (tab === "transfer" && historyOpen)) void loadTasks(); }, [tab, historyOpen, loadTasks, refreshKey]);

  // 活跃任务速度：用两次真实快照的 bytes_sent 差值计算，没有活跃任务就不显示速度。
  useEffect(() => {
    const uploads = (live.snapshot?.tasks || []).filter((task) => task.kind === "upload");
    const now = Date.now();
    const next: Record<string, number> = {};
    for (const task of uploads) {
      const key = task.key.replace(/^upload:/, "");
      const previous = prevBytes.current[key];
      if (previous && task.bytes_sent != null && now > previous.at) {
        const delta = task.bytes_sent - previous.bytes;
        if (delta >= 0) next[key] = (delta / Math.max(0.2, (now - previous.at) / 1000));
      }
      if (task.bytes_sent != null) prevBytes.current[key] = { bytes: task.bytes_sent, at: now };
    }
    setSpeeds(next);
  }, [live.snapshot?.revision, live.snapshot?.ts]);

  const activeTasks = useMemo(() => (live.snapshot?.tasks || []).filter((task) => task.kind === "upload"), [live.snapshot?.tasks]);
  const filtered = useMemo(() => tasks.filter((task) => {
    if (status === "active") return ["uploading", "queued", "verifying", "created", "preparing", "compressing", "retrying"].includes(task.status);
    if (status === "all") return true;
    return task.status === status;
  }), [tasks, status]);

  const today = live.snapshot?.traffic;
  const uploadSpeed = Object.values(speeds).reduce((sum, value) => sum + value, 0);
  const downloadView = traffic ? convert(traffic.download.bytes, unit) : null;
  const uploadView = traffic ? convert(traffic.upload.fileBytes, unit) : null;
  const maxTraffic = Math.max(1, traffic ? Math.max(...traffic.upload.series.map((row) => row.bytes), ...traffic.download.series.map((row) => row.bytes)) : 1);

  if (traceKey) {
    return <TraceView taskKey={traceKey} onBack={() => setTraceKey(null)} />;
  }

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <Segmented value={tab} ariaLabel="媒体服务视图" onChange={setTab} options={[{ value: "overview", label: "概览" }, { value: "transfer", label: "传输任务" }, { value: "resources", label: "资源管理" }, { value: "history", label: "历史记录" }]} />

      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}

      {tab === "overview" ? (
        <>
          <div className="ab-bento">
            <div className="ab-card ab-flow-card tone-emerald ab-c2 ab-m6" style={{ gap: 4 }}>
              <div className="ab-card__head"><span className="ab-card__title"><Upload size={13} /> 今日上传</span><span className="ab-card__badge">翡翠绿</span></div>
              <b style={{ fontSize: 28, fontWeight: 720, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{today ? fmtBytes(today.uploadBytes) : "—"}</b>
              <span className="ab-label">{today ? `${fmtNum(today.uploadFiles)} 个文件成功` : "等待数据"}</span>
              <span className="ab-label">当前速度 {uploadSpeed > 0 ? `${fmtBytes(uploadSpeed)}/s` : "—"}</span>
            </div>
            <div className="ab-card ab-flow-card tone-blue ab-c2 ab-m6" style={{ gap: 4 }}>
              <div className="ab-card__head"><span className="ab-card__title"><Download size={13} /> 今日下载</span><span className="ab-card__badge">科技蓝</span></div>
              <b style={{ fontSize: 28, fontWeight: 720, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{today ? fmtBytes(today.downloadBytes) : "—"}</b>
              <span className="ab-label">{today ? `${fmtNum(today.downloadRequests)} 次请求` : "等待数据"}</span>
              <span className="ab-label">服务器出站 {live.snapshot?.server?.net_tx_rate != null ? `${fmtBytes(live.snapshot.server.net_tx_rate)}/s` : "—"}</span>
            </div>
          </div>

          <div className="ab-card">
            <div className="ab-card__head"><span className="ab-card__title">上传质量</span><span className="ab-card__badge">{traffic?.range.label || "今天"}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Ring value={traffic?.upload.finalRate ?? null} size={104} stroke={10} tone="emerald" label="最终成功" large />
              <div className="ab-kv-grid" style={{ flex: 1 }}>
                <div><b>{fmtNum(traffic?.upload.ready)}</b><span>成功文件</span></div>
                <div><b style={{ color: (traffic?.upload.failed || 0) > 0 ? "var(--ab-coral)" : undefined }}>{fmtNum(traffic?.upload.failed)}</b><span>失败任务</span></div>
                <div><b>{fmtPct(traffic?.upload.firstRate)}</b><span>首次成功率</span></div>
                <div><b>{fmtBytes(traffic?.upload.transferredBytes)}</b><span>实际传输（上报）</span></div>
                <div><b>{fmtBytes(traffic?.upload.fileBytes)}</b><span>成功文件体积</span></div>
                <div><b>{traffic?.upload.retryTasks ? `+${fmtBytes(traffic.upload.retryExtraBytes)}` : "—"}</b><span>重试额外传输</span></div>
              </div>
            </div>
            <p className="ab-label" style={{ margin: 0 }}>成功率按任务数计算；体积、传输量、下载流量分别统计，不能互相替代。</p>
          </div>

          <div className="ab-toolbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <Segmented value={range} ariaLabel="流量时间范围" onChange={setRange} options={RANGES.map((item) => ({ value: item.value, label: item.label }))} />
            {range === "custom" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" className="ab-select" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="开始日期" />
                <span className="ab-label">至</span>
                <input type="date" className="ab-select" value={to} onChange={(event) => setTo(event.target.value)} aria-label="结束日期" />
                <button type="button" className="ab-chip info" style={{ border: 0, padding: "7px 10px" }} onClick={() => void loadTraffic()}>查询</button>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span className="ab-label">{traffic ? `${traffic.range.from} 至 ${traffic.range.to} · ${traffic.range.days} 天` : ""}</span>
              <Segmented value={unit} ariaLabel="容量单位" onChange={setUnit} options={[{ value: "auto", label: "自动" }, { value: "MB", label: "MB" }, { value: "GB", label: "GB" }]} />
            </div>
          </div>

          <div className="ab-toolbar" style={{ display: "grid", gap: 10 }}>
            <div className="ab-bento">
              <div className="ab-card ab-c2 ab-m6" style={{ gap: 6 }}>
                <div className="ab-card__head"><span className="ab-card__title">每日上传流量</span><span className="ab-card__badge">{uploadView?.label || "MB"}</span></div>
                <Bars items={(traffic?.upload.series || []).map((row) => ({ label: row.day, value: round(convert(row.bytes, unit).value) }))} unit={uploadView?.label || ""} color="var(--ab-emerald)" />
              </div>
              <div className="ab-card ab-c2 ab-m6" style={{ gap: 6 }}>
                <div className="ab-card__head"><span className="ab-card__title">每日下载流量</span><span className="ab-card__badge">{downloadView?.label || "MB"}</span></div>
                <Bars items={(traffic?.download.series || []).map((row) => ({ label: row.day, value: round(convert(row.bytes, unit).value) }))} unit={downloadView?.label || ""} color="var(--ab-blue)" />
              </div>
            </div>
            <div className="ab-card" style={{ gap: 8 }}>
              <div className="ab-card__head"><span className="ab-card__title">下载构成</span><span className="ab-card__badge">{traffic ? fmtNum(traffic.download.requests) : "—"} 次请求</span></div>
              {(traffic?.download.byKind || []).map((row) => (
                <div key={row.kind} style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr) 76px", gap: 8, alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "var(--ab-ink-2)" }}>{KIND_LABEL[row.kind] || row.kind}</span>
                  <span className="ab-bar tone-blue"><i style={{ width: `${Math.max(2, Math.round((row.bytes / Math.max(1, traffic?.download.bytes || 1)) * 100))}%` }} /></span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBytes(row.bytes)}</span>
                </div>
              ))}
              {!traffic?.download.byKind?.length ? <span className="ab-label">统计开始后还没有媒体下载记录。数据起始：{traffic?.coverage.firstDay || "本次部署"}</span> : null}
            </div>
          </div>

          <div className="ab-card" style={{ gap: 6 }}>
            <div className="ab-card__head"><span className="ab-card__title">当前任务</span><span className="ab-card__badge">{activeTasks.length} 个上传中</span></div>
            <div className="ab-kv-grid">
              <div><b>{fmtNum(activeTasks.length)}</b><span>上传中</span></div>
              <div><b>{fmtNum(tasks.filter((task) => task.status === "queued").length)}</b><span>排队</span></div>
              <div><b style={{ color: traffic?.upload.failed ? "var(--ab-coral)" : undefined }}>{fmtNum(live.snapshot?.counts.uploadFailed)}</b><span>24h 失败</span></div>
            </div>
            <p className="ab-label" style={{ margin: 0 }}>下载任务没有可用的实时字节来源，因此不展示虚构百分比；下载只统计请求数与真实响应字节。</p>
          </div>
        </>
      ) : null}

      {tab === "transfer" ? (
        <>
          <div className="ab-bento">
            {[
              ["上传中", activeTasks.filter((task) => ["uploading", "retrying"].includes(task.status)).length, "emerald"],
              ["等待中", activeTasks.filter((task) => ["queued", "created", "preparing"].includes(task.status)).length, "amber"],
              ["校验中", activeTasks.filter((task) => task.status === "verifying").length, "violet"],
              ["异常", live.snapshot?.counts.uploadFailed ?? 0, "coral"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className={`ab-card ab-card--tight ab-c2 ab-m3 tone-${tone}`} style={{ gap: 2 }}>
                <span className="ab-label">{label}</span>
                <b style={{ fontSize: 19, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: tone === "coral" && Number(value) > 0 ? "var(--ab-coral)" : undefined }}>{fmtNum(Number(value))}</b>
              </div>
            ))}
          </div>

          {activeTasks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeTasks.map((task) => {
                const key = task.key.replace(/^upload:/, "");
                const percent = task.file_size && task.bytes_sent != null ? Math.min(100, Math.round((task.bytes_sent / task.file_size) * 100)) : task.progress;
                return (
                  <button key={task.key} type="button" className="ab-card ab-card--tight" style={{ textAlign: "left", gap: 7 }} onClick={() => setTraceKey(key)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="ab-row__icon tone-emerald"><Upload size={14} /></span>
                      <span className="ab-row__body"><span className="ab-row__title">{task.title}</span><span className="ab-row__meta">{STATUS_LABEL[task.status] || task.status} · {fmtBytes(task.bytes_sent)} / {fmtBytes(task.file_size)} · {speeds[key] ? `${fmtBytes(speeds[key])}/s` : "速度未上报"}</span></span>
                      <span className="ab-row__value"><b>{percent == null ? "—" : `${percent}%`}</b></span>
                    </div>
                    <div className={`ab-progress${percent == null ? " is-indeterminate" : ""}`}><i style={{ width: `${percent ?? 34}%` }} /></div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ab-card ab-card--tight" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <span className="ab-row__icon tone-emerald"><Upload size={14} /></span>
              <span className="ab-row__body">
                <span className="ab-row__title">当前没有活跃上传任务</span>
                <span className="ab-row__meta">有新上传时会在这里实时出现；历史任务在下方折叠区，展开后才加载。</span>
              </span>
            </div>
          )}

          <Collapse
            title="历史传输任务"
            count={historyOpen ? filtered.length : undefined}
            hint="默认折叠，展开后才加载"
            onOpen={() => setHistoryOpen(true)}
          >
            <div className="ab-toolbar">
              <Segmented value={status} ariaLabel="任务筛选" onChange={(next) => { setStatus(next); setHistoryLimit(20); }} options={[{ value: "all", label: "全部" }, { value: "active", label: "进行中" }, { value: "ready", label: "已完成" }, { value: "failed", label: "失败" }, { value: "cancelled", label: "已取消" }]} />
            </div>
            <form className="ab-search" onSubmit={(event) => { event.preventDefault(); setApplied(query.trim()); setHistoryLimit(20); }}>
              <FileText size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务编号或文件名" aria-label="搜索上传任务" />
            </form>
            <Group plain>
              {loading ? <div className="ab-skel" style={{ height: 160, margin: 12 }} /> : filtered.length ? filtered.slice(0, historyLimit).map((task) => {
                const Icon = task.mime_type?.startsWith("video") ? Film : task.mime_type?.startsWith("image") ? ImageIcon : FileText;
                return (
                  <button key={task.task_key} type="button" className="ab-item" style={{ border: 0, borderRadius: 0, background: "transparent" }} onClick={() => setTraceKey(task.task_key)}>
                    <span className="ab-item__thumb"><Icon size={18} /></span>
                    <span className="ab-item__body">
                      <span className="ab-item__title">{task.file_name || `任务 ${task.task_key.slice(0, 10)}`}</span>
                      <span className="ab-item__meta"><span>{fmtBytes(task.file_size)}</span><span>·</span><span>{task.client_type || "未知客户端"}</span><span>·</span><span>{fmtTime(task.created_at)}</span>{task.attempts && task.attempts > 1 ? <><span>·</span><span>重试 {task.attempts - 1} 次</span></> : null}</span>
                    </span>
                    <span className="ab-item__right"><span className={`ab-chip ${task.status === "ready" ? "ok" : task.status === "failed" ? "bad" : "info"}`}>{STATUS_LABEL[task.status] || task.status}</span></span>
                  </button>
                );
              }) : <Empty title={applied ? "没有匹配的上传任务" : "暂无上传任务"} hint="上传任务由客户端创建，历史记录默认折叠。" />}
              {filtered.length > historyLimit ? (
                <button type="button" className="ab-row" style={{ justifyContent: "center" }} onClick={() => setHistoryLimit((value) => value + 20)}>
                  <span className="ab-row__body" style={{ alignItems: "center" }}><span className="ab-row__title" style={{ fontSize: 12 }}>加载更多（已显示 {Math.min(historyLimit, filtered.length)} / {filtered.length}）</span></span>
                </button>
              ) : null}
            </Group>
          </Collapse>
        </>
      ) : null}

      {tab === "resources" ? <AdminResources refreshKey={refreshKey} /> : null}

      {tab === "history" ? (
        <>
          <p className="ab-label" style={{ margin: 0 }}>历史记录默认折叠，展开后才加载内容；实时刷新不会改变展开状态。</p>
          <Collapse title="已完成上传" count={tasks.filter((task) => task.status === "ready").length} hint="最近 100 条">
            <Group plain>
              {tasks.filter((task) => task.status === "ready").slice(0, 20).map((task) => (
                <div key={task.task_key} className="ab-row">
                  <span className="ab-row__body"><span className="ab-row__title" style={{ fontSize: 12 }}>{task.file_name || task.task_key.slice(0, 10)}</span><span className="ab-row__meta">{fmtBytes(task.file_size)} · {fmtDuration(task.duration_ms)} · {fmtTime(task.finished_at || task.updated_at)}</span></span>
                  <span className="ab-chip ok">完成</span>
                </div>
              ))}
              {!tasks.some((task) => task.status === "ready") ? <Empty title="暂无已完成任务" /> : null}
            </Group>
          </Collapse>
          <Collapse title="失败任务" count={tasks.filter((task) => task.status === "failed").length} hint="含错误原因与客户端信息">
            <Group plain>
              {tasks.filter((task) => task.status === "failed").slice(0, 20).map((task) => (
                <button key={task.task_key} type="button" className="ab-row" onClick={() => setTraceKey(task.task_key)}>
                  <span className="ab-row__body"><span className="ab-row__title" style={{ fontSize: 12 }}>{task.file_name || task.task_key.slice(0, 10)}</span><span className="ab-row__meta">{task.error_code || "未分类"} · {task.error_message || "无错误描述"} · {task.client_type || "未知客户端"} {task.client_version || ""}</span></span>
                  <ChevronRight size={15} className="ab-row__chev" />
                </button>
              ))}
              {!tasks.some((task) => task.status === "failed") ? <Empty title="没有失败任务" hint="失败任务保留在数据库中可追溯。" /> : null}
            </Group>
          </Collapse>
          <Collapse title="已取消 / 其他" count={tasks.filter((task) => !["ready", "failed"].includes(task.status)).length}>
            <Group plain>
              {tasks.filter((task) => !["ready", "failed"].includes(task.status)).slice(0, 20).map((task) => (
                <div key={task.task_key} className="ab-row">
                  <span className="ab-row__body"><span className="ab-row__title" style={{ fontSize: 12 }}>{task.file_name || task.task_key.slice(0, 10)}</span><span className="ab-row__meta">{STATUS_LABEL[task.status] || task.status} · {fmtTime(task.updated_at)}</span></span>
                </div>
              ))}
            </Group>
          </Collapse>
          <Collapse title="每日流量明细" count={traffic?.upload.series.length || 0} hint={traffic?.range.label}>
            <Group plain>
              {(traffic?.upload.series || []).map((row, index) => {
                const download = traffic?.download.series[index];
                return (
                  <div key={row.day} className="ab-row">
                    <span className="ab-row__body"><span className="ab-row__title" style={{ fontSize: 12 }}>{row.day}</span><span className="ab-row__meta">上传 {row.ready} 个文件 · 下载 {fmtNum(download?.requests)} 次请求</span></span>
                    <span className="ab-row__value" style={{ textAlign: "right" }}><b style={{ fontSize: 11.5 }}>↑{fmtBytes(row.bytes)}</b><br /><b style={{ fontSize: 11.5, color: "var(--ab-blue)" }}>↓{fmtBytes(download?.bytes)}</b></span>
                  </div>
                );
              })}
            </Group>
          </Collapse>
          <p className="ab-label" style={{ lineHeight: 1.7 }}>{traffic?.coverage.note} {traffic?.coverage.firstDay ? `统计起始：${traffic.coverage.firstDay}；最近采集：${traffic.coverage.ingestAt ? fmtTime(traffic.coverage.ingestAt) : "—"}。` : "访问日志从本次部署开始采集，历史流量不回溯伪造。"}</p>
        </>
      ) : null}
    </div>
  );
}

/**
 * 上传链路：9 个节点按真实事件展示；未采集的节点明确标记「未采集」，不补造。
 * 任务未结束时，随统一实时快照的版本变化自动刷新，不需要手动刷新。
 */
function TraceView({ taskKey, onBack }: { taskKey: string; onBack: () => void }) {
  const live = useRealtime();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState("");
  const [verify, setVerify] = useState<{ exists: boolean; note: string; checked_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRevision = useRef(0);

  const load = useCallback(async () => {
    try {
      const result = await cloudRequest(`/api/v1/admin/media-service?view=trace&task_key=${encodeURIComponent(taskKey)}`) as Trace;
      setTrace(result);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "链路读取失败"); }
    finally { setLoading(false); }
  }, [taskKey]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const revision = live.snapshot?.revision || 0;
    if (!revision || revision === lastRevision.current) return;
    lastRevision.current = revision;
    if (trace && !["ready", "failed", "cancelled"].includes(trace.task.status)) void load();
  }, [live.snapshot?.revision, trace, load]);

  const runVerify = async () => {
    if (!trace?.task.storage_path) return;
    try {
      const result = await cloudRequest("/api/v1/admin/media-service", { action: "verify", storage_path: trace.task.storage_path }, "POST") as { exists: boolean; note: string; checked_at: string };
      setVerify(result);
    } catch (e) { setError(e instanceof Error ? e.message : "校验失败"); }
  };

  const stages = useMemo(() => {
    if (!trace) return [];
    const task = trace.task;
    const chain = trace.chain || [];
    const find = (keyword: string) => chain.find((stage) => stage.stage.includes(keyword));
    const started = task.created_at;
    const verified = task.verify_result === "ok";
    return [
      { key: "read", title: "文件读取 / 压缩", status: task.client_type ? "completed" : "unknown", note: task.client_type ? `客户端 ${task.client_type}${task.client_version ? ` ${task.client_version}` : ""}` : "客户端未上报" },
      { key: "create", title: "上传任务创建", status: "completed", note: fmtTime(started) },
      { key: "auth", title: "获取上传授权", status: "unknown", note: "该阶段没有独立事件，按未采集处理" },
      { key: "transfer", title: "文件传输", status: task.bytes_sent ? "completed" : task.status === "uploading" ? "running" : "unknown", note: task.bytes_sent ? `${fmtBytes(task.bytes_sent)} / ${fmtBytes(task.file_size)}` : "字节数未上报" },
      { key: "storage", title: "存储确认", status: task.storage_path ? "completed" : "unknown", note: task.storage_path ? "对象路径已登记" : "无存储路径" },
      { key: "verify", title: "完整性校验", status: verified ? "completed" : task.status === "verifying" ? "running" : "unknown", note: verified ? "对象存在且大小一致" : task.error_message || "未完成校验" },
      { key: "asset", title: "资源登记", status: trace.media_asset ? "completed" : "unknown", note: trace.media_asset ? `checksum ${String(trace.media_asset.checksum_sha256 || "").slice(0, 12)}…` : "没有媒体资产记录" },
      { key: "link", title: "作品关联", status: trace.media_asset?.post_id ? "completed" : "pending", note: trace.media_asset?.post_id ? "已关联作品" : "未关联作品（staging 或已清理）" },
    ];
  }, [trace]);

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="ab-iconbtn" aria-label="返回任务列表" onClick={onBack}><ArrowLeft size={18} /></button>
        <span style={{ fontSize: 13, color: "var(--ab-ink-3)" }}>上传链路</span>
        {trace && !["ready", "failed", "cancelled"].includes(trace.task.status) ? <span className="ab-chip info"><RotateCcw size={11} /> 实时跟进</span> : null}
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
              <dt>已传输</dt><dd>{fmtBytes(trace.task.bytes_sent)}</dd>
              <dt>客户端</dt><dd>{trace.task.client_type || "未知"}{trace.task.client_version ? ` ${trace.task.client_version}` : ""}</dd>
              <dt>状态</dt><dd>{STATUS_LABEL[trace.task.status] || trace.task.status}</dd>
              <dt>重试</dt><dd>{Math.max(0, (trace.task.attempts || 1) - 1)} 次</dd>
              <dt>耗时</dt><dd>{fmtDuration(trace.task.duration_ms)}</dd>
              <dt>创建</dt><dd>{fmtTime(trace.task.created_at)}</dd>
              <dt>完成</dt><dd>{fmtTime(trace.task.finished_at)}</dd>
            </dl>
            {trace.task.file_size && trace.task.bytes_sent != null ? <div className="ab-progress" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, Math.round((trace.task.bytes_sent / trace.task.file_size) * 100))}%` }} /></div> : null}
          </div>
          <div className="ab-panel">
            <h3 className="ab-panel__title">链路时间轴</h3>
            <div className="ab-timeline">
              {stages.map((stage) => (
                <div key={stage.key} className="ab-tl-item">
                  <span className={`ab-tl-dot ${stage.status === "completed" ? "ok" : stage.status === "failed" ? "bad" : "pending"}`}>
                    {stage.status === "completed" ? <Check size={10} /> : <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "block" }} />}
                  </span>
                  <span className="ab-tl-body">
                    <span className="ab-tl-title">{stage.title}</span>
                    <span className="ab-tl-meta">{stage.status === "unknown" ? "未采集 · " : stage.status === "running" ? "进行中 · " : ""}{stage.note}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="ab-label" style={{ marginTop: 10 }}>未采集的节点显示为「未采集」，不补造时间与状态；任务推进时本页自动更新。</p>
          </div>
          <div className="ab-panel">
            <h3 className="ab-panel__title">存储核验</h3>
            <button type="button" className="ab-chip info" style={{ border: 0, padding: "8px 12px" }} onClick={() => void runVerify()} disabled={!trace.task.storage_path}>核验对象是否仍然存在</button>
            {verify ? <p style={{ fontSize: 12, marginTop: 8, color: verify.exists ? "var(--ab-emerald)" : "var(--ab-coral)" }}>{verify.note} · {fmtTime(verify.checked_at)}</p> : <p className="ab-label" style={{ marginTop: 8 }}>只读取事实，不会修改或恢复存储对象。</p>}
          </div>
        </>
      ) : null}
    </div>
  );
}
