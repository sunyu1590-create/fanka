"use client";

/**
 * 系统监控：Apple Health 风格的真实指标呈现。
 * 数据全部来自 fanka-metrics 采集器写入的 system_metrics / system_alerts
 * 与进程内请求指标；无数据时显示空态，不生成任何模拟曲线。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Server } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { useRealtime } from "@/lib/admin-live";
import { Empty, fmtBytes, fmtNum, fmtTime, Group, Ring, Segmented, TrendChart } from "./admin/AdminUIKit";

type MetricRow = {
  captured_at: string;
  cpu_percent: number | null; load1: number | null; mem_percent: number | null;
  mem_used: number | null; mem_total: number | null; mem_available: number | null;
  disk_percent: number | null; disk_used: number | null; disk_total: number | null; disk_free: number | null;
  net_rx_rate: number | null; net_tx_rate: number | null;
  api_requests: number | null; api_errors: number | null; api_avg_ms: number | null; api_p95_ms: number | null;
};
type AlertRow = { id: string; alert_type: string; level: string; title: string; detail: string; status: string; first_seen_at: string; last_seen_at: string; occurrences: number };
type Live = { requests?: number; requests_per_second?: number; avg_ms?: number; p95_ms?: number; error_rate?: number; errors4xx?: number; errors5xx?: number };

type Range = "1h" | "24h" | "7d";
const RANGE_LABEL: Record<Range, string> = { "1h": "1 小时", "24h": "24 小时", "7d": "7 天" };

export default function AdminSystemMonitor({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [current, setCurrent] = useState<MetricRow | null>(null);
  const [live, setLive] = useState<Live>({});
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [range, setRange] = useState<Range>("1h");
  const [points, setPoints] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const mounted = useRef(true);

  const loadCurrent = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    try {
      const result = await cloudRequest("/api/v1/admin/metrics") as { current: MetricRow | null; live_requests: Live; open_alerts: AlertRow[]; has_history: boolean };
      if (!mounted.current) return;
      setCurrent(result.current);
      setLive(result.live_requests || {});
      setAlerts(result.open_alerts || []);
      setError("");
      setStale(false);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "监控数据读取失败");
      setStale(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const loadRange = useCallback(async (next: Range) => {
    setChartLoading(true);
    try {
      const result = await cloudRequest(`/api/v1/admin/metrics?range=${next}`) as { points: MetricRow[] };
      if (mounted.current) setPoints(result.points || []);
    } catch { /* 趋势失败不影响实时卡片 */ }
    finally { if (mounted.current) setChartLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadCurrent(true);
    return () => { mounted.current = false; };
  }, [loadCurrent]);

  useEffect(() => { void loadRange(range); }, [range, loadRange]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadCurrent(false);
    }, 20_000);
    const chartTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadRange(range);
    }, 120_000);
    return () => { window.clearInterval(timer); window.clearInterval(chartTimer); };
  }, [loadCurrent, loadRange, range]);

  const series = useMemo(() => ({
    cpu: points.map((row) => ({ t: Date.parse(row.captured_at), v: row.cpu_percent })),
    mem: points.map((row) => ({ t: Date.parse(row.captured_at), v: row.mem_percent })),
    api: points.map((row) => ({ t: Date.parse(row.captured_at), v: row.api_p95_ms })),
    net: points.map((row) => ({ t: Date.parse(row.captured_at), v: row.net_rx_rate == null ? null : Math.round((row.net_rx_rate / 1024) * 10) / 10 })),
  }), [points]);

  const cpuMax = useMemo(() => Math.max(0, ...series.cpu.map((point) => point.v || 0)), [series.cpu]);
  const cpuAvg = useMemo(() => {
    const values = series.cpu.map((point) => point.v).filter((value): value is number => value != null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [series.cpu]);

  // 实时卡片与总览页「系统健康」共用同一份快照：快照 1 秒一刷，metrics 的
  // 20 秒轮询只负责历史趋势与告警，避免同一指标在两个页面出现不同数字。
  const feed = useRealtime();
  const rt = feed.snapshot?.server ?? null;
  const rtLive = feed.snapshot?.live;
  const cpu = rt?.cpu_percent ?? current?.cpu_percent ?? null;
  const load1 = rt?.load1 ?? current?.load1 ?? null;
  const mem = rt?.mem_percent ?? current?.mem_percent ?? null;
  const memUsed = rt?.mem_used ?? current?.mem_used ?? null;
  const memTotal = rt?.mem_total ?? current?.mem_total ?? null;
  const memAvailable = current?.mem_available ?? null;
  const disk = rt?.disk_percent ?? current?.disk_percent ?? null;
  const diskUsed = rt?.disk_used ?? current?.disk_used ?? null;
  const diskTotal = rt?.disk_total ?? current?.disk_total ?? null;
  const diskFree = rt && rt.disk_total != null && rt.disk_used != null ? rt.disk_total - rt.disk_used : current?.disk_free ?? null;
  const netRx = rt?.net_rx_rate ?? current?.net_rx_rate ?? null;
  const netTx = rt?.net_tx_rate ?? current?.net_tx_rate ?? null;
  const liveAt = rt?.captured_at ?? current?.captured_at;
  const liveApi = {
    avg_ms: rtLive?.avg_ms ?? live.avg_ms,
    p95_ms: rtLive?.p95_ms ?? live.p95_ms,
    requests: rtLive?.requests ?? live.requests,
    error_rate: rtLive?.error_rate ?? live.error_rate,
  };
  const hasLive = Boolean(current || rt);

  if (loading && !current) {
    return <div style={{ marginTop: 16 }}><div className="ab-skel" style={{ height: 220, borderRadius: 20 }} /><div className="ab-skel" style={{ height: 160, marginTop: 12, borderRadius: 20 }} /></div>;
  }

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={`ab-chip ${error ? "bad" : hasLive ? "ok" : "warn"}`}><i className={`ab-dot ${error ? "bad" : hasLive ? "" : "warn"}`} aria-hidden="true" />{error ? "监控连接中断" : hasLive ? "采集正常" : "等待采集"}</span>
        {rt ? <span className="ab-chip info" title="采集器每 15 秒采样一次，页面每秒对齐最新样本">实时 · 每秒对齐</span> : null}
        <span className="ab-label">最后更新 {fmtTime(liveAt)}</span>
        {stale ? <span className="ab-chip warn">数据可能过期</span> : null}
      </div>
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}

      {hasLive ? (
        <>
          <div className="ab-bento">
            <div className="ab-card ab-c2 ab-m4" style={{ alignItems: "center", gap: 8 }}>
              <Ring value={cpu} size={96} stroke={9} label="CPU" large warnAt={80} critAt={92} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12.5, color: "var(--ab-ink-2)" }}>系统负载 <b style={{ fontVariantNumeric: "tabular-nums" }}>{load1 != null ? load1.toFixed(2) : "—"}</b></div>
                <div className="ab-label" style={{ marginTop: 2 }}>{RANGE_LABEL[range]}最高 {cpuMax ? `${Math.round(cpuMax)}%` : "—"} · 均值 {cpuAvg != null ? `${Math.round(cpuAvg)}%` : "—"}</div>
              </div>
            </div>
            <div className="ab-card ab-c2 ab-m4" style={{ alignItems: "center", gap: 8 }}>
              <Ring value={mem} size={96} stroke={9} label="内存" large warnAt={80} critAt={92} />
              <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--ab-ink-2)" }}>
                <div>已用 <b>{fmtBytes(memUsed)}</b> / {fmtBytes(memTotal)}</div>
                <div className="ab-label" style={{ marginTop: 2 }}>{memAvailable != null ? `可用 ${fmtBytes(memAvailable)}（MemAvailable）` : "可用内存以采集器采样为准"}</div>
              </div>
            </div>
            <div className="ab-card ab-c2 ab-m4" style={{ alignItems: "center", gap: 8 }}>
              <Ring value={disk} size={96} stroke={9} label="磁盘" large warnAt={70} critAt={85} />
              <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--ab-ink-2)" }}>
                <div>已用 <b>{fmtBytes(diskUsed)}</b> / {fmtBytes(diskTotal)}</div>
                <div className="ab-label" style={{ marginTop: 2 }}>剩余 {fmtBytes(diskFree)}{(disk || 0) >= 85 ? " · 容量紧张" : ""}</div>
              </div>
            </div>

            <div className="ab-card ab-c2 ab-m6" style={{ gap: 8 }}>
              <div className="ab-card__head"><span className="ab-card__title">网络速率</span><span className="ab-card__badge">实时</span></div>
              <div style={{ display: "flex", gap: 24 }}>
                <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtBytes(netRx)}/s</b><div className="ab-label">入站</div></div>
                <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtBytes(netTx)}/s</b><div className="ab-label">出站</div></div>
              </div>
              <TrendChart points={series.net} unit=" KB/s" color="var(--ab-cyan)" height={88} emptyText="暂无网络采样" />
            </div>
            <div className="ab-card ab-c2 ab-m6" style={{ gap: 8 }}>
              <div className="ab-card__head"><span className="ab-card__title">API 性能</span><span className="ab-card__badge">5 分钟窗口</span></div>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{liveApi.avg_ms != null ? `${Math.round(liveApi.avg_ms)} ms` : <span style={{ fontSize: 13, fontWeight: 550, color: "var(--ab-ink-3)" }}>暂无</span>}</b><div className="ab-label">平均响应</div></div>
                <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{liveApi.p95_ms != null ? `${Math.round(liveApi.p95_ms)} ms` : <span style={{ fontSize: 13, fontWeight: 550, color: "var(--ab-ink-3)" }}>暂无</span>}</b><div className="ab-label">P95</div></div>
                <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtNum(liveApi.requests)}</b><div className="ab-label">请求数</div></div>
                <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: (liveApi.error_rate || 0) > 0.02 ? "var(--ab-coral)" : undefined }}>{liveApi.error_rate != null ? `${(liveApi.error_rate * 100).toFixed(1)}%` : <span style={{ fontSize: 13, fontWeight: 550, color: "var(--ab-ink-3)" }}>暂无</span>}</b><div className="ab-label">错误率</div></div>
              </div>
              <TrendChart points={series.api} unit=" ms" color="var(--ab-blue)" height={88} emptyText="暂无 API 采样" />
            </div>
          </div>

          <div>
            <div className="ab-section__head">
              <h2 className="ab-section__title">历史趋势</h2>
              <span className="ab-section__meta">{RANGE_LABEL[range]} · {points.length} 个采样点</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <Segmented value={range} ariaLabel="时间范围" onChange={setRange} options={[{ value: "1h", label: "1 小时" }, { value: "24h", label: "24 小时" }, { value: "7d", label: "7 天" }]} />
            </div>
            {chartLoading && !points.length ? <div className="ab-skel" style={{ height: 150, borderRadius: 16 }} /> : (
              <div className="ab-bento">
                <div className="ab-card ab-c2 ab-m6" style={{ gap: 6 }}>
                  <div className="ab-card__head"><span className="ab-card__title">CPU 使用率</span><span className="ab-card__badge">%</span></div>
                  <TrendChart points={series.cpu} unit="%" color="var(--ab-blue)" emptyText="该时间范围暂无 CPU 数据" />
                </div>
                <div className="ab-card ab-c2 ab-m6" style={{ gap: 6 }}>
                  <div className="ab-card__head"><span className="ab-card__title">内存使用率</span><span className="ab-card__badge">%</span></div>
                  <TrendChart points={series.mem} unit="%" color="var(--ab-violet)" emptyText="该时间范围暂无内存数据" />
                </div>
                <div className="ab-card ab-c2 ab-m6" style={{ gap: 6 }}>
                  <div className="ab-card__head"><span className="ab-card__title">API P95 响应</span><span className="ab-card__badge">ms</span></div>
                  <TrendChart points={series.api} unit=" ms" color="var(--ab-amber)" emptyText="该时间范围暂无 API 数据" />
                </div>
                <div className="ab-card ab-c2 ab-m6" style={{ gap: 6 }}>
                  <div className="ab-card__head"><span className="ab-card__title">入站带宽</span><span className="ab-card__badge">KB/s</span></div>
                  <TrendChart points={series.net} unit=" KB/s" color="var(--ab-cyan)" emptyText="该时间范围暂无网络数据" />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="ab-section__head">
              <h2 className="ab-section__title">当前告警</h2>
              <button type="button" className="ab-label" style={{ border: 0, background: "none", color: "var(--ab-blue)", display: "inline-flex", alignItems: "center" }} onClick={() => onNavigate?.("alerts")}>全部记录<ChevronRight size={13} /></button>
            </div>
            <Group>
              {alerts.length ? alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="ab-row">
                  <span className={`ab-row__icon ${alert.level === "critical" ? "tone-coral" : "tone-amber"}`}><Server size={15} /></span>
                  <span className="ab-row__body">
                    <span className="ab-row__title">{alert.title}</span>
                    <span className="ab-row__meta">{alert.detail} · {fmtTime(alert.last_seen_at)} · 出现 {alert.occurrences} 次</span>
                  </span>
                  <span className={`ab-chip ${alert.level === "critical" ? "bad" : "warn"}`}>{alert.level === "critical" ? "严重" : "警告"}</span>
                </div>
              )) : <Empty title="当前没有未恢复告警" hint="告警恢复后会自动关闭并归入历史。" />}
            </Group>
          </div>
        </>
      ) : (
        <Empty icon={<Server size={22} />} title="监控采集器尚未上报数据" hint="采集器每 20 秒采样一次；没有数据时不显示任何推测数值。" />
      )}
    </div>
  );
}
