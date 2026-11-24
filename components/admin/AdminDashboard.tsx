"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronRight, CreditCard, Download, Flag, ScrollText, ShieldCheck, Sparkles, Users } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, fmtBytes, fmtNum, fmtPct, fmtTime, Group, Ring, Row, TrendChart } from "./AdminUIKit";

type Overview = { usersToday: number; postsToday: number; pending: number; pendingReports: number; aiResources: number; views: number; likes: number; saves: number; comments: number };
type MetricsCurrent = {
  captured_at?: string;
  cpu_percent?: number | null;
  mem_percent?: number | null;
  mem_used?: number | null;
  mem_total?: number | null;
  disk_percent?: number | null;
  disk_used?: number | null;
  disk_total?: number | null;
  api_requests?: number | null;
  api_errors?: number | null;
  api_avg_ms?: number | null;
  api_p95_ms?: number | null;
  upload_success_rate?: number | null;
};
type LiveRequests = { requests?: number; avg_ms?: number; p95_ms?: number; error_rate?: number; errors5xx?: number };
type AlertRow = { id: string; alert_type: string; level: string; title: string; status: string; last_seen_at: string; occurrences: number };
type MediaOverview = { window?: string; total_tasks?: number; ready?: number; failed?: number; first_attempt_success_rate?: number | null; final_success_rate?: number | null; total_bytes?: number; sample_note?: string };
type AiReviewItem = { id: string; status: string; error_message?: string | null };
type AiBatch = { id: string; status: string };

export default function AdminDashboard({
  role,
  onNavigate,
  refreshKey = 0,
}: {
  role: string;
  onNavigate: (section: string) => void;
  refreshKey?: number;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [dmPending, setDmPending] = useState<number | null>(null);
  const [current, setCurrent] = useState<MetricsCurrent | null>(null);
  const [live, setLive] = useState<LiveRequests | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [trend, setTrend] = useState<Array<{ t: number; v: number | null }>>([]);
  const [media, setMedia] = useState<MediaOverview | null>(null);
  const [reviewItems, setReviewItems] = useState<AiReviewItem[]>([]);
  const [batches, setBatches] = useState<AiBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    const [overviewResult, usersResult, dmResult, metricsResult, trendResult, mediaResult, aiResult] = await Promise.allSettled([
      cloudRequest("/api/v1/admin/overview") as Promise<Overview>,
      role === "admin" ? (cloudRequest("/api/v1/admin/users?limit=1") as Promise<{ total: number }>) : Promise.resolve({ total: -1 }),
      cloudRequest("/api/v1/admin/message-reports") as Promise<Array<{ status: string }>>,
      cloudRequest("/api/v1/admin/metrics") as Promise<{ current: MetricsCurrent | null; live_requests: LiveRequests; open_alerts: AlertRow[]; has_history: boolean }>,
      cloudRequest("/api/v1/admin/metrics?range=1h") as Promise<{ points: Array<{ captured_at: string; cpu_percent: number | null }> }>,
      cloudRequest("/api/v1/admin/media-service?view=overview") as Promise<MediaOverview>,
      cloudRequest("/api/v1/admin/ai-tasks") as Promise<{ batches: AiBatch[]; reviewItems: AiReviewItem[] }>,
    ]);
    if (!mounted.current) return;
    let failed = 0;
    if (overviewResult.status === "fulfilled") setOverview(overviewResult.value); else failed += 1;
    if (usersResult.status === "fulfilled") setUserTotal(Number(usersResult.value.total) < 0 ? null : Number(usersResult.value.total)); else failed += 1;
    if (dmResult.status === "fulfilled") setDmPending(dmResult.value.filter((item) => item.status === "open").length); else failed += 1;
    if (metricsResult.status === "fulfilled") {
      setCurrent(metricsResult.value.current);
      setLive(metricsResult.value.live_requests);
      setAlerts(metricsResult.value.open_alerts || []);
    } else failed += 1;
    if (trendResult.status === "fulfilled") {
      setTrend((trendResult.value.points || []).map((point) => ({ t: Date.parse(point.captured_at), v: point.cpu_percent })));
    }
    if (mediaResult.status === "fulfilled") setMedia(mediaResult.value);
    if (aiResult.status === "fulfilled") {
      setReviewItems(aiResult.value.reviewItems || []);
      setBatches(aiResult.value.batches || []);
    }
    setError(failed >= 5 ? "部分数据暂时无法读取，已显示可用内容。" : "");
    setLoading(false);
  }, [role]);

  useEffect(() => {
    mounted.current = true;
    void load(true);
    return () => { mounted.current = false; };
  }, [load, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const runningBatches = useMemo(() => batches.filter((batch) => batch.status === "running").length, [batches]);
  const anomalies = useMemo(() => reviewItems.filter((item) => Boolean(item.error_message)).length, [reviewItems]);
  const criticalAlerts = useMemo(() => alerts.filter((alert) => alert.level === "critical").length, [alerts]);
  const healthTone = criticalAlerts > 0 ? "bad" : alerts.length > 0 ? "warn" : current ? "ok" : "warn";
  const healthLabel = criticalAlerts > 0 ? `${criticalAlerts} 条严重告警` : alerts.length > 0 ? `${alerts.length} 条告警` : current ? "运行正常" : "等待采集";
  const pendingTotal = (overview?.pending ?? 0) + (overview?.pendingReports ?? 0) + (dmPending ?? 0) + alerts.length + (media?.failed ?? 0);

  return (
    <div style={{ marginTop: 16 }}>
      {error ? <p className="ab-sub" style={{ marginBottom: 10, color: "var(--ab-amber)" }}>{error}</p> : null}
      <div className="ab-bento">
        <div className="ab-card tone-blue ab-c2 ab-m8" style={{ gap: 14 }}>
          <div className="ab-card__head">
            <span className="ab-card__title">系统健康</span>
            <span className={`ab-chip ${healthTone}`}><i className={`ab-dot ${healthTone === "ok" ? "" : healthTone}`} aria-hidden="true" />{healthLabel}</span>
          </div>
          {loading && !current ? (
            <div className="ab-skel" style={{ height: 180 }} />
          ) : current ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <Ring value={current.cpu_percent ?? null} label="CPU" size={78} stroke={7} />
                  <Ring value={current.mem_percent ?? null} label="内存" size={78} stroke={7} />
                  <Ring value={current.disk_percent ?? null} label="磁盘" size={78} stroke={7} />
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="ab-label">API 延迟</span>
                  <b style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{live?.avg_ms != null ? `${Math.round(live.avg_ms)} ms` : "—"}</b>
                  <span className="ab-label">P95 {live?.p95_ms != null ? `${Math.round(live.p95_ms)} ms` : "—"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "var(--ab-ink-3)" }}>
                <span>内存 {fmtBytes(current.mem_used)} / {fmtBytes(current.mem_total)}</span>
                <span>磁盘 {fmtBytes(current.disk_used)} / {fmtBytes(current.disk_total)}</span>
                <span>错误率 {live?.error_rate != null ? `${(Number(live.error_rate) * 100).toFixed(1)}%` : "—"}</span>
              </div>
              <TrendChart points={trend} unit="%" color="var(--ab-blue)" height={120} emptyText="最近 1 小时暂无 CPU 采样" />
              <div className="ab-card__foot">
                <span>最后更新 {fmtTime(current.captured_at)}</span>
                <button type="button" className="ab-label" style={{ border: 0, background: "none", color: "var(--ab-blue)", display: "inline-flex", alignItems: "center" }} onClick={() => onNavigate("system-monitor")}>系统监控<ChevronRight size={13} /></button>
              </div>
            </>
          ) : (
            <Empty title="监控采集尚未就绪" hint="采集器每 20 秒上报一次；暂无数据时不显示推测值。" />
          )}
        </div>

        <div className="ab-card tone-violet ab-c2 ab-m4" style={{ cursor: "pointer" }} onClick={() => onNavigate("ai-review")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("ai-review"); }}>
          <div className="ab-card__head">
            <span className="ab-card__title">AI 人工复审</span>
            <ChevronRight size={15} style={{ color: "var(--ab-ink-3)" }} aria-hidden="true" />
          </div>
          <div className="ab-kpi ab-kpi--lg" style={{ color: "var(--ab-violet)" }}>{fmtNum(reviewItems.length)}<small>项</small></div>
          <div className="ab-label">等待人工判断</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <span className="ab-chip violet">异常 {anomalies}</span>
            <span className="ab-chip info">运行中 {runningBatches}</span>
          </div>
        </div>

        <div className="ab-card tone-emerald ab-c2 ab-m4" style={{ cursor: "pointer" }} onClick={() => onNavigate("media-service")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("media-service"); }}>
          <div className="ab-card__head">
            <span className="ab-card__title">媒体上传</span>
            <span className="ab-card__badge">24 小时</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Ring value={media?.final_success_rate ?? null} size={82} stroke={8} tone="emerald" label="最终成功" />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12 }}>成功 <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtNum(media?.ready)}</b></span>
              <span style={{ fontSize: 12 }}>失败 <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtNum(media?.failed)}</b></span>
              <span className="ab-label">样本 {fmtNum(media?.total_tasks)} · 首次 {fmtPct(media?.first_attempt_success_rate)}</span>
            </div>
          </div>
          <div className="ab-card__foot">
            <span>传输 {fmtBytes(media?.total_bytes)}</span>
            <span>{media?.total_tasks ? "统计口径 24h" : "暂无样本"}</span>
          </div>
        </div>

        <div className="ab-card ab-c2 ab-m7" style={{ gap: 12 }}>
          <div className="ab-card__head">
            <span className="ab-card__title">平台运营</span>
            <button type="button" className="ab-label" style={{ border: 0, background: "none", color: "var(--ab-blue)" }} onClick={() => onNavigate("users")}>用户管理 ›</button>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
            <div>
              <b style={{ fontSize: 34, fontWeight: 720, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{fmtNum(userTotal)}</b>
              <div className="ab-label">账号总数</div>
            </div>
            <div>
              <b style={{ fontSize: 22, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: "var(--ab-emerald)" }}>+{fmtNum(overview?.usersToday)}</b>
              <div className="ab-label">今日新增</div>
            </div>
          </div>
          <div className="ab-metric-row" style={{ gap: 22, borderTop: "1px solid var(--ab-line)", paddingTop: 10 }}>
            <div className="ab-metric"><b>{fmtNum(overview?.postsToday)}</b><span>今日发布作品</span></div>
            <div className="ab-metric"><b>{fmtNum(overview?.aiResources)}</b><span>已发布 AI 资源</span></div>
            <div className="ab-metric"><b>{fmtNum(overview?.pendingReports)}</b><span>待处理举报</span></div>
          </div>
        </div>

        <div className="ab-card ab-c2 ab-m5" style={{ gap: 12 }}>
          <div className="ab-card__head"><span className="ab-card__title">内容互动</span><span className="ab-card__badge">累计</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
            {[
              ["阅读", overview?.views],
              ["点赞", overview?.likes],
              ["收藏", overview?.saves],
              ["评论", overview?.comments],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtNum(value as number | undefined)}</b>
                <div className="ab-label">{label}</div>
              </div>
            ))}
          </div>
          <p className="ab-label" style={{ margin: 0 }}>无历史趋势数据时不生成模拟曲线。</p>
        </div>

        <div className="ab-card ab-c2 ab-m5" style={{ gap: 8 }}>
          <div className="ab-card__head">
            <span className="ab-card__title">待处理事项</span>
            <span className="ab-card__badge">{pendingTotal > 0 ? `${pendingTotal} 项` : ""}</span>
          </div>
          <Group plain>
            <Row title="人工复审" meta="AI 转人工的内容" value={reviewItems.length || (overview?.pending ?? 0)} onClick={() => onNavigate("ai-review")} />
            <Row title="内容举报" value={fmtNum(overview?.pendingReports)} onClick={() => onNavigate("reports")} />
            <Row title="私信举报" value={fmtNum(dmPending)} onClick={() => onNavigate("messages")} />
            <Row title="上传失败" meta="近 24 小时" value={fmtNum(media?.failed)} onClick={() => onNavigate("media-service")} />
            <Row title="系统告警" meta={alerts[0]?.title} value={alerts.length} onClick={() => onNavigate("alerts")} />
          </Group>
        </div>

        <div className="ab-card ab-c2 ab-m7" style={{ gap: 12 }}>
          <div className="ab-card__head"><span className="ab-card__title">管理工具</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            {[
              { key: "users", label: "用户", icon: Users },
              { key: "membership", label: "会员", icon: CreditCard },
              { key: "reports", label: "治理", icon: Flag },
              { key: "ai-space", label: "AI 专区", icon: Sparkles },
              { key: "ai-usage", label: "模型用量", icon: Activity },
              { key: "audit", label: "操作记录", icon: ScrollText },
              { key: "app-download", label: "版本", icon: Download },
              { key: "alerts", label: "告警", icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.key} type="button" onClick={() => onNavigate(item.key)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 4px", border: 0, borderRadius: 14, background: "var(--ab-fill)", color: "var(--ab-ink)", fontSize: 11 }}>
                  <Icon size={18} color="var(--ab-ink-2)" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {loading ? <p className="ab-sub" style={{ textAlign: "center", marginTop: 16 }}>正在读取实时数据…</p> : null}
    </div>
  );
}
