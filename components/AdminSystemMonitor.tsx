"use client";

/**
 * 系统监控中心：真实服务器指标 + 历史趋势 + 服务健康 + 系统告警。
 * 数据全部来自监控采集器（fanka-metrics）写入的 system_metrics / system_alerts
 * 与进程内请求指标；无数据时显示空态，不生成任何模拟曲线。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";

type MetricsPoint = {
  captured_at: string;
  cpu_percent: number | null;
  mem_percent: number | null;
  disk_percent: number | null;
  load1: number | null;
  net_rx_rate: number | null;
  net_tx_rate: number | null;
  api_requests: number | null;
  api_errors: number | null;
  api_avg_ms: number | null;
  api_p95_ms: number | null;
  upload_success_rate: number | null;
  upload_tasks: number | null;
  upload_failed: number | null;
};

type AlertRow = {
  id: string;
  alert_type: string;
  level: string;
  title: string;
  detail: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at?: string | null;
  occurrences: number;
  handle_note?: string | null;
};

type Overview = {
  current: (MetricsPoint & { mem_total: number | null; mem_used: number | null; disk_total: number | null; disk_used: number | null; inode_percent: number | null; swap_used: number | null }) | null;
  live_requests: { m5: { requests: number; errors4xx: number; errors5xx: number; error_rate: number; avg_ms: number | null; p95_ms: number | null; requests_per_second: number } };
  open_alerts: AlertRow[];
  has_history: boolean;
};

const RANGES: { key: string; label: string }[] = [
  { key: "15m", label: "15 分钟" },
  { key: "1h", label: "1 小时" },
  { key: "24h", label: "24 小时" },
  { key: "7d", label: "7 天" },
];

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Sparkline({ points, color = "var(--action)" }: { points: (number | null)[]; color?: string }) {
  const values = points.map((value) => (value == null ? 0 : value));
  const max = Math.max(1, ...values);
  const width = 220;
  const height = 44;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${(height - (value / max) * (height - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="monitor-spark" role="img" aria-label="趋势图">
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export default function AdminSystemMonitor() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<MetricsPoint[]>([]);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [range, setRange] = useState("1h");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    setError("");
    try {
      const [overviewData, historyData, alertData] = await Promise.all([
        cloudRequest("/api/v1/admin/metrics") as Promise<Overview>,
        cloudRequest(`/api/v1/admin/metrics?range=${range}`) as Promise<{ points: MetricsPoint[]; note?: string }>,
        cloudRequest("/api/v1/admin/alerts?status=all") as Promise<{ alerts: AlertRow[] }>,
      ]);
      setOverview(overviewData);
      setHistory(historyData.points || []);
      setHistoryNote(historyData.note || null);
      setAlerts(alertData.alerts || []);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "监控数据读取失败");
    } finally {
      setBusy(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
    // 监控页打开时 20s 轮询；离开即停止（页面不持有高频请求）。
    const timer = setInterval(() => void load(true), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const current = overview?.current;
  const m5 = overview?.live_requests?.m5;

  const summaryCards = useMemo(() => [
    { label: "CPU 使用率", value: current?.cpu_percent != null ? `${current.cpu_percent}%` : "—", sub: current?.load1 != null ? `负载 ${current.load1}` : "采集器未上报" },
    { label: "内存使用率", value: current?.mem_percent != null ? `${current.mem_percent}%` : "—", sub: current?.mem_used != null ? `${formatBytes(current.mem_used)} / ${formatBytes(current.mem_total)}` : "—" },
    { label: "磁盘使用率", value: current?.disk_percent != null ? `${current.disk_percent}%` : "—", sub: current?.disk_used != null ? `${formatBytes(current.disk_used)} / ${formatBytes(current.disk_total)}` : "—" },
    { label: "网络速率", value: current?.net_rx_rate != null ? `↓ ${formatBytes(current.net_rx_rate)}/s` : "—", sub: current?.net_tx_rate != null ? `↑ ${formatBytes(current.net_tx_rate)}/s` : "—" },
    { label: "API 请求（5 分钟）", value: m5 ? String(m5.requests) : "—", sub: m5 ? `错误率 ${m5.error_rate}% · ${m5.requests_per_second} req/s` : "—" },
    { label: "API 响应时间", value: m5?.avg_ms != null ? `${m5.avg_ms} ms` : "—", sub: m5?.p95_ms != null ? `P95 ${m5.p95_ms} ms` : "—" },
    { label: "上传成功率（24h）", value: current?.upload_success_rate != null ? `${current.upload_success_rate}%` : "—", sub: current?.upload_tasks != null ? `样本 ${current.upload_tasks}，失败 ${current.upload_failed ?? 0}` : "—" },
    { label: "最后采集时间", value: current?.captured_at ? new Date(current.captured_at).toLocaleTimeString("zh-CN") : "尚无数据", sub: current?.captured_at ? new Date(current.captured_at).toLocaleDateString("zh-CN") : "等待采集器写入" },
  ], [current, m5]);

  return (
    <div className="admin-monitor">
      <div className="admin-module-heading">
        <div><strong>系统监控中心</strong><small>由 fanka-metrics 采集器每 20 秒写入真实指标；离开本页后轮询停止。</small></div>
        <button type="button" className="soft-button" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> {busy ? "刷新中…" : "刷新"}</button>
      </div>
      {error && <p className="moderation-feedback error" role="alert">{error}</p>}
      <div className="admin-overview admin-overview-expanded" aria-label="服务器实时指标">
        {summaryCards.map((card) => <div key={card.label}><strong>{card.value}</strong><span>{card.label}</span><small>{card.sub}</small></div>)}
      </div>

      <div className="admin-module-heading"><div><strong>历史趋势</strong><small>按分钟聚合的真实历史；无样本时为空态。</small></div>
        <div className="moderation-filters" role="group" aria-label="时间范围">
          {RANGES.map((item) => <button key={item.key} type="button" className={range === item.key ? "selected" : ""} onClick={() => setRange(item.key)}>{item.label}</button>)}
        </div>
      </div>
      {historyNote && <p className="moderation-empty">{historyNote}</p>}
      <div className="monitor-charts">
        <section><h3>CPU / 内存</h3><Sparkline points={history.map((point) => point.cpu_percent)} /><Sparkline points={history.map((point) => point.mem_percent)} color="var(--metal)" /></section>
        <section><h3>API P95 响应时间</h3><Sparkline points={history.map((point) => point.api_p95_ms)} /></section>
        <section><h3>上传成功率</h3><Sparkline points={history.map((point) => point.upload_success_rate)} color="var(--metal)" /></section>
        <section><h3>网络速率（入站）</h3><Sparkline points={history.map((point) => point.net_rx_rate)} /></section>
      </div>

      <div className="admin-module-heading"><div><strong>系统告警</strong><small>阈值触发自动记录；同一故障去重合并，恢复后自动关闭。</small></div></div>
      {alerts.length ? <ul className="monitor-alerts">
        {alerts.map((alert) => <li key={alert.id} className={`is-${alert.status} level-${alert.level}`}>
          <span className="monitor-alert-icon">{alert.status === "resolved" ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}</span>
          <div>
            <strong>{alert.title}</strong>
            <small>{alert.detail || "—"} · 发生 {alert.occurrences} 次 · {alert.status === "resolved" ? `已于 ${new Date(alert.resolved_at || alert.last_seen_at).toLocaleString("zh-CN")} 恢复` : `最近 ${new Date(alert.last_seen_at).toLocaleString("zh-CN")}`}</small>
          </div>
          <span className="monitor-alert-status">{alert.status === "resolved" ? "已恢复" : alert.status === "acknowledged" ? "已确认" : alert.status === "resolving" ? "处理中" : "未处理"}</span>
          {alert.status !== "resolved" && <div className="monitor-alert-actions">
            <button type="button" className="soft-button" onClick={async () => { await cloudRequest("/api/v1/admin/alerts", { id: alert.id, action: "acknowledge" }, "PATCH"); void load(true); }}>确认</button>
            <button type="button" className="soft-button" onClick={async () => { await cloudRequest("/api/v1/admin/alerts", { id: alert.id, action: "resolve", note: "管理员处理完成" }, "PATCH"); void load(true); }}>标记恢复</button>
          </div>}
        </li>)}
      </ul> : <p className="moderation-empty"><Server size={15}/> 当前无告警记录。</p>}
    </div>
  );
}
