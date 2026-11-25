"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, ChevronDown, ChevronRight, ChevronUp,
  Cpu, Flag, Gauge, GitBranch, Globe, GripVertical, HardDrive, LayoutGrid, ListChecks, Loader2, Network,
  Power, RotateCcw, ScrollText, Server, Settings2, ShieldCheck, Sparkles, Trash2, UserX, Users, X,
} from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { useRealtime } from "@/lib/admin-live";
import { fmtBytes, fmtNum, fmtPct, fmtTime, Ring } from "./AdminUIKit";
import ConsoleChart, { type ConsolePoint } from "./ConsoleChart";

/* ========================================================================== */
/* 类型                                                                        */
/* ========================================================================== */

type ModuleKey = "resource" | "todo" | "ops" | "services" | "quick" | "ai" | "activity";
type ConsoleMode = "lite" | "pro";
type MetricKey = "cpu" | "mem" | "disk" | "net_rx" | "net_tx" | "tcp" | "requests" | "errors";
type RangeKey = "5m" | "15m" | "1h" | "24h";
type OpsRange = "today" | "yesterday" | "7d" | "30d" | "custom";

type ConsoleLayout = {
  order: ModuleKey[];
  hidden: ModuleKey[];
  width: Record<string, 1 | 2>;
  quick: string[];
};

type OpsSummary = {
  users: { total: number; new: number; active: number; online: number };
  visits: { pv: number; requests: number; uv: number; ips: number; errors: number; errorRate: number | null; avgMs: number | null; p95Ms: number | null };
  content: { published: number; ai: number; series: number; featured: number; newPosts: number };
  engagement: { views: number; likes: number; saves: number; comments: number };
  membership: { total: number; new: number; byTier: Array<{ tier: string; count: number }> };
  meta: { logSince: string | null; logUntil: string | null; viewsCumulative?: boolean; likesCumulative?: boolean };
};
type OpsResponse = { range: { key: OpsRange; label: string; from: string; to: string }; summary: OpsSummary };

type SeriesResponse = {
  metric: MetricKey;
  range: { key: RangeKey; label: string; from: string; to: string; bucket_seconds: number };
  unit: string;
  label: string;
  axis: "percent" | "bytes" | "count";
  points: ConsolePoint[];
  note?: string;
};

type ServiceRow = {
  key: string; label: string; kind: string; container: string;
  status: string; health: string; version: string | null; started_at: string | null;
  cpu_percent: number | null; mem_bytes: number | null; pid: number | null; updated_at: string | null;
};
type ServicesResponse = {
  services: ServiceRow[];
  deployments: Array<{ id: string; version: string; image: string; status: string; note: string | null; deployed_at: string }>;
  site_mode: { mode?: string };
  features: Record<string, boolean>;
  uptime_seconds: number;
  note: string;
};

type MediaOverview = {
  window?: string; total_tasks?: number; ready?: number; failed?: number;
  first_attempt_success_rate?: number | null; final_success_rate?: number | null;
  avg_duration_ms?: number | null; total_bytes?: number; status_counts?: Record<string, number>;
};
type CostResponse = {
  currency: string; configured?: boolean;
  ai: { inputTokens: number; outputTokens: number; requests: number; estimate: number | null };
  totals: { estimate: number | null };
};
type StorageResponse = {
  buckets: Array<{ bucket: string; files: number; bytes: number; error: string | null }>;
  media_assets: number | null;
  post_media_rows: number | null;
};
type OverviewResponse = {
  usersToday: number; postsToday: number; pending: number; pendingReports: number;
  aiResources: number; views: number; likes: number; saves: number; comments: number;
  recent: Array<{ id: string; action: string; target_type: string; target_id: string; reason: string | null; created_at: string; nickname: string | null }>;
};
type TcpSummary = {
  available: boolean;
  reason?: string;
  captured_at: string | null;
  stale: boolean;
  totals: { total: number; by_state: Array<{ state: string; count: number }> };
};

const DEFAULT_LAYOUT: ConsoleLayout = {
  order: ["resource", "todo", "ops", "services", "quick", "ai", "activity"],
  hidden: [],
  width: { resource: 2, todo: 1, ops: 1, services: 2, quick: 2, ai: 1, activity: 1 },
  quick: ["monitor", "network", "access", "server", "media", "ai", "business", "logs"],
};

const CORE_MODULES: ModuleKey[] = ["resource", "todo", "services", "quick"];

const MODULE_META: Record<ModuleKey, { title: string; icon: typeof Activity }> = {
  resource: { title: "系统资源", icon: Gauge },
  todo: { title: "待处理事项", icon: ListChecks },
  ops: { title: "平台运营", icon: BarChart3 },
  services: { title: "服务运行状态", icon: Server },
  quick: { title: "快捷管理", icon: LayoutGrid },
  ai: { title: "AI 模型用量", icon: Cpu },
  activity: { title: "最近操作", icon: Activity },
};

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: "cpu", label: "CPU" },
  { key: "mem", label: "内存" },
  { key: "disk", label: "磁盘" },
  { key: "net_rx", label: "入站" },
  { key: "net_tx", label: "出站" },
  { key: "tcp", label: "TCP" },
  { key: "requests", label: "请求" },
  { key: "errors", label: "错误率" },
];

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "5m", label: "5 分钟" },
  { key: "15m", label: "15 分钟" },
  { key: "1h", label: "1 小时" },
  { key: "24h", label: "24 小时" },
];

const OPS_RANGES: Array<{ key: OpsRange; label: string }> = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "custom", label: "自定义" },
];

const QUICK_LIBRARY: Record<string, { label: string; icon: typeof Activity }> = {
  monitor: { label: "全局监控", icon: Activity },
  network: { label: "网络与连接", icon: Network },
  access: { label: "访问控制", icon: ShieldCheck },
  server: { label: "服务器管理", icon: Server },
  media: { label: "媒体与资源", icon: HardDrive },
  ai: { label: "AI 审核与用量", icon: Sparkles },
  business: { label: "用户与业务", icon: Users },
  logs: { label: "日志与告警", icon: ScrollText },
  "system-monitor": { label: "系统监控", icon: Gauge },
  process: { label: "进程监控", icon: Cpu },
  tasks: { label: "任务中心", icon: ListChecks },
  tcp: { label: "TCP 连接", icon: Network },
  ips: { label: "IP 访问分析", icon: Globe },
  traffic: { label: "流量分析", icon: BarChart3 },
  "ip-rules": { label: "IP 规则", icon: ShieldCheck },
  "account-limits": { label: "账号限制", icon: UserX },
  services: { label: "服务状态", icon: Server },
  deployments: { label: "部署记录", icon: GitBranch },
  emergency: { label: "紧急控制", icon: Power },
  storage: { label: "资源管理", icon: HardDrive },
  trash: { label: "资源回收站", icon: Trash2 },
  "media-service": { label: "媒体服务", icon: HardDrive },
  "ai-review": { label: "AI 审核中心", icon: Sparkles },
  "review-stats": { label: "审核质量", icon: BarChart3 },
  "review-policy": { label: "审核策略", icon: ShieldCheck },
  "ai-usage": { label: "模型用量", icon: Cpu },
  users: { label: "用户管理", icon: Users },
  reports: { label: "内容举报", icon: Flag },
  messages: { label: "私信举报", icon: Bell },
  alerts: { label: "系统告警", icon: Bell },
  "alert-rules": { label: "告警规则", icon: ShieldCheck },
  "access-logs": { label: "访问日志", icon: ScrollText },
  audit: { label: "操作记录", icon: ScrollText },
};

/* ========================================================================== */
/* 数据拉取：组件级轮询，页面隐藏暂停，请求不叠加                              */
/* ========================================================================== */

function useJson<T>(url: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const pendingUrl = useRef<string | null>(null);
  const seq = useRef(0);
  const alive = useRef(true);

  const load = useCallback(async (silent: boolean) => {
    if (!url) return;
    // 同一地址不叠加请求；地址变化（切换指标/范围）时立刻发起新请求，旧响应按序号丢弃。
    if (pendingUrl.current === url) return;
    pendingUrl.current = url;
    const id = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const result = await cloudRequest(url) as T;
      if (!alive.current || id !== seq.current) return;
      setData(result);
      setError("");
      setUpdatedAt(Date.now());
    } catch (cause) {
      if (!alive.current || id !== seq.current) return;
      setError(cause instanceof Error ? cause.message : "数据读取失败");
    } finally {
      if (pendingUrl.current === url) pendingUrl.current = null;
      if (alive.current && id === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    if (!url) {
      setLoading(false);
      return () => { alive.current = false; };
    }
    void load(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, intervalMs, load]);

  const reload = useCallback(() => { void load(false); }, [load]);
  return { data, error, loading, updatedAt, reload };
}

/* ========================================================================== */
/* 主组件                                                                      */
/* ========================================================================== */

export default function ControlCenter2({
  role,
  onNavigate,
  refreshKey = 0,
}: {
  role: string;
  onNavigate: (section: string) => void;
  refreshKey?: number;
}) {
  const [mode, setMode] = useState<ConsoleMode>("pro");
  const [layout, setLayout] = useState<ConsoleLayout>(DEFAULT_LAYOUT);
  const [prefsReady, setPrefsReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("cpu");
  const [range, setRange] = useState<RangeKey>("15m");
  const [opsRange, setOpsRange] = useState<OpsRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const opsUrl = useMemo(() => {
    if (opsRange !== "custom") return `/api/v1/admin/console/ops?range=${opsRange}`;
    if (!customFrom || !customTo) return null;
    const from = new Date(`${customFrom}T00:00:00+08:00`);
    const to = new Date(`${customTo}T23:59:59+08:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
    return `/api/v1/admin/console/ops?range=custom&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  }, [opsRange, customFrom, customTo]);

  const seriesInterval = range === "24h" ? 60_000 : range === "1h" ? 30_000 : 15_000;

  const ops = useJson<OpsResponse>(opsUrl, 60_000);
  const series = useJson<SeriesResponse>(`/api/v1/admin/console/series?metric=${metric}&range=${range}`, seriesInterval);
  const services = useJson<ServicesResponse>("/api/v1/admin/services", 30_000);
  const media = useJson<MediaOverview>("/api/v1/admin/media-service?view=overview", 60_000);
  const cost = useJson<CostResponse>("/api/v1/admin/cost", 300_000);
  const storage = useJson<StorageResponse>("/api/v1/admin/storage", 300_000);
  const overview = useJson<OverviewResponse>("/api/v1/admin/overview", 60_000);
  const dm = useJson<Array<{ status: string }>>("/api/v1/admin/message-reports", 60_000);
  const tcp = useJson<TcpSummary>("/api/v1/admin/network/tcp?summary=1", 15_000);

  /* ---- 布局偏好：本地缓存优先，服务端覆盖 ---- */
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem("heika:console:v2");
      if (cached) {
        const parsed = JSON.parse(cached) as { mode?: ConsoleMode; layout?: Partial<ConsoleLayout> };
        if (parsed.mode === "lite" || parsed.mode === "pro") setMode(parsed.mode);
        if (parsed.layout) setLayout({ ...DEFAULT_LAYOUT, ...parsed.layout, width: { ...DEFAULT_LAYOUT.width, ...(parsed.layout.width || {}) } });
      }
    } catch { /* 本地缓存损坏时忽略，继续读服务端 */ }
    let alive = true;
    cloudRequest("/api/v1/admin/console/prefs")
      .then((result) => {
        if (!alive) return;
        const prefs = result as { mode?: ConsoleMode; layout?: Partial<ConsoleLayout> | null };
        if (prefs.mode === "lite" || prefs.mode === "pro") setMode(prefs.mode);
        if (prefs.layout) {
          setLayout({ ...DEFAULT_LAYOUT, ...prefs.layout, width: { ...DEFAULT_LAYOUT.width, ...(prefs.layout.width || {}) } });
        }
        setPrefsReady(true);
      })
      .catch(() => { if (alive) setPrefsReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener("heika:console-settings", open);
    return () => window.removeEventListener("heika:console-settings", open);
  }, []);

  /* ---- 顶栏手动刷新：所有数据源重新拉取，不重置布局与筛选 ---- */
  useEffect(() => {
    if (!refreshKey) return;
    ops.reload(); series.reload(); services.reload(); media.reload();
    cost.reload(); storage.reload(); overview.reload(); dm.reload(); tcp.reload();
    // reload 由 useCallback 稳定，refreshKey 变化时才触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const saveLayout = async (nextMode: ConsoleMode, nextLayout: ConsoleLayout) => {
    // 先落库再改本地：保存失败时界面与已保存配置保持一致，不出现「看起来生效、刷新后回退」。
    await cloudRequest("/api/v1/admin/console/prefs", { mode: nextMode, layout: nextLayout }, "PUT");
    setMode(nextMode);
    setLayout(nextLayout);
    try { window.localStorage.setItem("heika:console:v2", JSON.stringify({ mode: nextMode, layout: nextLayout })); } catch { /* 忽略存储失败 */ }
    setEditing(false);
  };

  const resetLayout = async () => {
    await saveLayout("pro", DEFAULT_LAYOUT);
  };

  const visible = useMemo(() => {
    const allowed = mode === "lite" ? CORE_MODULES : DEFAULT_LAYOUT.order;
    return layout.order.filter((key) => allowed.includes(key) && !layout.hidden.includes(key));
  }, [layout, mode]);

  const opsPending = !ops.data || ops.data.range.key !== opsRange;
  const seriesPending = !series.data || series.data.metric !== metric || series.data.range?.key !== range;
  const errorSources = [ops, series, services, media, overview].filter((item) => item.error && !item.data).length;

  const lastUpdate = useMemo(() => {
    const stamps = [ops.updatedAt, series.updatedAt, services.updatedAt].filter((value): value is number => Boolean(value));
    return stamps.length ? Math.max(...stamps) : null;
  }, [ops.updatedAt, series.updatedAt, services.updatedAt]);

  return (
    <div className="cc2">
      <div className="cc2-head">
        <div>
          <div className="cc2-head__sub">
            <span className="cc2-chip" data-on="1">{mode === "pro" ? "专业模式" : "精简模式"}</span>
            <span>最后更新 {lastUpdate ? new Date(lastUpdate).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
            {errorSources > 0 ? <span style={{ color: "var(--ab-coral)" }}>{errorSources} 个数据源读取失败</span> : null}
          </div>
        </div>
        <div className="cc2-head__actions">
          {!prefsReady ? <span className="cc2-head__date">读取布局…</span> : null}
          <button type="button" className="cc2-btn" onClick={() => setEditing(true)}>
            <Settings2 size={14} aria-hidden="true" />编辑控制台
          </button>
        </div>
      </div>

      <CriticalBanner onNavigate={onNavigate} />

      <div className="cc2-grid">
        {visible.map((key) => {
          const span = layout.width[key] === 2 ? 2 : 1;
          const meta = MODULE_META[key];
          const Icon = meta.icon;
          if (key === "resource") {
            return (
              <Module key={key} id={key} title={meta.title} icon={<Icon size={14} />} span={2}>
                <ResourcePanel
                  series={series.data} seriesPending={seriesPending} seriesError={series.error}
                  metric={metric} setMetric={setMetric} range={range} setRange={setRange}
                  tcp={tcp.data} ops={ops.data?.summary ?? null} onNavigate={onNavigate}
                />
              </Module>
            );
          }
          if (key === "todo") {
            return (
              <Module key={key} id={key} title={meta.title} icon={<Icon size={14} />} span={span}>
                <TodoPanel dm={dm.data} dmError={dm.error} overview={overview.data} overviewError={overview.error} media={media.data} onNavigate={onNavigate} />
              </Module>
            );
          }
          if (key === "ops") {
            return (
              <Module key={key} id={key} title={meta.title} icon={<Icon size={14} />} span={span}
                headRight={
                  <div className="cc2-tabs" role="tablist" aria-label="运营统计范围">
                    {OPS_RANGES.map((item) => (
                      <button key={item.key} type="button" role="tab" aria-selected={opsRange === item.key} className="cc2-tab" onClick={() => setOpsRange(item.key)}>{item.label}</button>
                    ))}
                  </div>
                }
                footer={<><span>{ops.data ? `${ops.data.range.label} · ${new Date(ops.data.range.from).toLocaleDateString("zh-CN")} 至 ${new Date(ops.data.range.to).toLocaleDateString("zh-CN")}` : "等待统计"}</span><button type="button" className="cc2-link" onClick={() => onNavigate("users")}>用户管理<ChevronRight size={12} /></button></>}
              >
                <OpsPanel data={ops.data} pending={opsPending} error={ops.error} opsRange={opsRange} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
              </Module>
            );
          }
          if (key === "services") {
            return (
              <Module key={key} id={key} title={meta.title} icon={<Icon size={14} />} span={2}
                footer={<><span>{services.data ? `进程运行 ${formatUptime(services.data.uptime_seconds)} · ${services.data.services.filter((item) => item.status === "running").length}/${services.data.services.length} 服务在线` : "等待健康检查"}</span><button type="button" className="cc2-link" onClick={() => onNavigate("services")}>服务管理<ChevronRight size={12} /></button></>}
              >
                <ServicePanel services={services.data} servicesError={services.error} media={media.data} cost={cost.data} storage={storage.data} role={role} onNavigate={onNavigate} />
              </Module>
            );
          }
          if (key === "quick") {
            return (
              <Module key={key} id={key} title={meta.title} icon={<Icon size={14} />} span={2}
                headRight={<button type="button" className="cc2-link cc2-link--muted" onClick={() => setEditing(true)}>自定义</button>}
              >
                <div className="cc2-quick">
                  {(layout.quick.length ? layout.quick : DEFAULT_LAYOUT.quick).map((item) => {
                    const entry = QUICK_LIBRARY[item];
                    if (!entry) return null;
                    const EntryIcon = entry.icon;
                    return (
                      <button key={item} type="button" className="cc2-quick__item" onClick={() => onNavigate(item)}>
                        <EntryIcon size={16} aria-hidden="true" /><span>{entry.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Module>
            );
          }
          if (key === "ai") {
            return (
              <Module key={key} id={key} title={meta.title} icon={<Icon size={14} />} span={span}
                footer={<><span>{cost.data ? `计费币种 ${cost.data.currency}` : "等待用量"}</span><button type="button" className="cc2-link" onClick={() => onNavigate("ai-usage")}>模型用量<ChevronRight size={12} /></button></>}
              >
                <AiPanel cost={cost.data} costError={cost.error} onNavigate={onNavigate} />
              </Module>
            );
          }
          return (
            <Module key={key} id={key} title={meta.title} icon={<Icon size={14} />} span={span}
              footer={<><span>最近 6 条管理动作</span><button type="button" className="cc2-link" onClick={() => onNavigate("audit")}>操作记录<ChevronRight size={12} /></button></>}
            >
              <ActivityPanel data={overview.data} error={overview.error} />
            </Module>
          );
        })}
      </div>

      {editing ? (
        <ConsoleEditor
          mode={mode}
          layout={layout}
          onClose={() => setEditing(false)}
          onSave={saveLayout}
          onReset={resetLayout}
        />
      ) : null}
    </div>
  );
}

/* ========================================================================== */
/* 通用模块容器                                                                */
/* ========================================================================== */

function Module({
  id, title, icon, span, headRight, footer, children,
}: {
  id: string; title: string; icon: React.ReactNode; span: 1 | 2;
  headRight?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="cc2-mod" data-span={span} data-module={id}>
      <header className="cc2-mod__head">
        <div className="cc2-mod__title">{icon}{title}</div>
        {headRight}
      </header>
      <div className="cc2-mod__body">{children}</div>
      {footer ? <div className="cc2-mod__foot">{footer}</div> : null}
    </section>
  );
}

/* ========================================================================== */
/* 严重告警横幅：即使待办模块被隐藏也始终可见                                  */
/* ========================================================================== */

function CriticalBanner({ onNavigate }: { onNavigate: (section: string) => void }) {
  const live = useRealtime();
  const critical = (live.snapshot?.alerts || []).filter((alert) => alert.level === "critical");
  if (!critical.length) return null;
  return (
    <div className="cc2-todo__alert" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      <b>{critical.length} 条严重告警</b>
      <span>{critical[0].title}</span>
      <button type="button" className="cc2-link" onClick={() => onNavigate("alerts")}>立即处理<ChevronRight size={12} /></button>
    </div>
  );
}

/* ========================================================================== */
/* 系统资源                                                                    */
/* ========================================================================== */

function ResourcePanel({
  series, seriesPending, seriesError, metric, setMetric, range, setRange, tcp, ops, onNavigate,
}: {
  series: SeriesResponse | null; seriesPending: boolean; seriesError: string;
  metric: MetricKey; setMetric: (value: MetricKey) => void; range: RangeKey; setRange: (value: RangeKey) => void;
  tcp: TcpSummary | null; ops: OpsSummary | null; onNavigate: (section: string) => void;
}) {
  const live = useRealtime();
  const server = live.snapshot?.server;
  const traffic = live.snapshot?.traffic;
  const api = live.snapshot?.live;

  const cpu = server?.cpu_percent ?? null;
  const mem = server?.mem_percent ?? null;
  const disk = server?.disk_percent ?? null;

  const memPair = pair(memUsed(server), server?.mem_total ?? null);
  const diskPair = pair(server?.disk_used ?? null, server?.disk_total ?? null);
  const tcpTotal = tcp?.totals?.total ?? null;
  const online = ops?.users.online ?? null;
  const latency = api?.avg_ms ?? null;
  const p95 = api?.p95_ms ?? null;
  const errorRate = api?.error_rate ?? null;

  const chartNote = seriesError
    ? "趋势数据读取失败，下方数字仍来自实时通道"
    : series?.note || "该时间范围内暂无采集数据";

  return (
    <>
      <div className="cc2-rings">
        <div className="cc2-ring">
          <Ring value={cpu} label="CPU" size={92} stroke={7} warnAt={80} critAt={92} />
          <span className="cc2-ring__cap">负载 <b>{server?.load1 != null ? server.load1.toFixed(2) : "—"}</b></span>
        </div>
        <div className="cc2-ring">
          <Ring value={mem} label="内存" size={92} stroke={7} warnAt={80} critAt={92} />
          <span className="cc2-ring__cap">{memPair}</span>
        </div>
        <div className="cc2-ring">
          <Ring value={disk} label="磁盘" size={92} stroke={7} warnAt={70} critAt={85} />
          <span className="cc2-ring__cap">{diskPair}</span>
        </div>
      </div>

      <div className="cc2-metrics">
        <Metric label="内存" value={memPair} />
        <Metric label="磁盘" value={diskPair} />
        <Metric label="API 延迟" value={latency != null ? `${Math.round(latency)} ms` : "—"} hint={p95 != null ? `P95 ${Math.round(p95)} ms` : undefined} />
        <Metric label="错误率" value={errorRate != null ? `${(Number(errorRate) * 100).toFixed(1)}%` : "—"} tone={errorRate != null && errorRate > 0.02 ? "warn" : undefined} />
        <Metric label="TCP 连接" value={tcpTotal != null ? fmtNum(tcpTotal) : "—"} hint={tcp?.available === false ? "采集器未上报" : tcp?.stale ? "快照已过期" : tcp?.captured_at ? `采集 ${fmtTime(tcp.captured_at)}` : undefined} />
        <Metric label="在线用户" value={online != null ? fmtNum(online) : "—"} hint="5 分钟内活跃登录" />
        <Metric label="实时速率" value={server?.net_rx_rate != null ? `↓ ${fmtBytes(server.net_rx_rate)}/s` : "—"} hint={server?.net_tx_rate != null ? `↑ ${fmtBytes(server.net_tx_rate)}/s` : undefined} />
        <Metric label="今日流量" value={traffic ? `↑ ${fmtBytes(traffic.uploadBytes)}` : "—"} hint={traffic ? `↓ ${fmtBytes(traffic.downloadBytes)} · ${fmtNum(traffic.downloadRequests)} 次下载` : undefined} />
      </div>

      <div className="cc2-chartbar">
        <div className="cc2-tabs" role="tablist" aria-label="趋势指标">
          {METRICS.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={metric === item.key} className="cc2-tab" onClick={() => setMetric(item.key)}>{item.label}</button>
          ))}
        </div>
        <div className="cc2-tabs" role="tablist" aria-label="时间范围">
          {RANGES.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={range === item.key} className="cc2-tab" onClick={() => setRange(item.key)}>{item.label}</button>
          ))}
        </div>
      </div>

      <ConsoleChart
        points={series?.points ?? []}
        axis={series?.axis ?? "percent"}
        unit={series?.unit ?? ""}
        bucketMs={(series?.range.bucket_seconds ?? 60) * 1000}
        pending={seriesPending}
        color={metric === "errors" ? "var(--ab-coral)" : metric === "tcp" || metric === "requests" ? "var(--ab-emerald)" : "var(--ab-blue)"}
        emptyText={chartNote}
      />

      <div className="cc2-mod__foot" style={{ padding: 0, borderTop: 0 }}>
        <span>{series ? `${series.label} · ${series.range.label} · ${series.points.length} 个采样点` : "等待采样"}</span>
        <button type="button" className="cc2-link" onClick={() => onNavigate("system-monitor")}>全局监控<ChevronRight size={12} /></button>
      </div>
    </>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="cc2-metric" data-tone={tone}>
      <i>{label}</i>
      <b>{value}</b>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function memUsed(server: { mem_used?: number | null } | null | undefined) {
  return server?.mem_used ?? null;
}

function pair(used: number | null, total: number | null) {
  if (used == null || total == null) return "—";
  const a = fmtBytes(used);
  const b = fmtBytes(total);
  const [av, au] = a.split(" ");
  const [bv, bu] = b.split(" ");
  return au && au === bu ? `${av}/${bv} ${bu}` : `${a}/${b}`;
}

/* ========================================================================== */
/* 待处理事项                                                                  */
/* ========================================================================== */

type TodoItem = {
  key: string; name: string; count: number; severity: 1 | 2 | 3;
  meta: string; section: string; icon: typeof Flag; at?: string | null;
};

function TodoPanel({
  dm, dmError, overview, overviewError, media, onNavigate,
}: {
  dm: Array<{ status: string }> | null; dmError: string;
  overview: OverviewResponse | null; overviewError: string;
  media: MediaOverview | null; onNavigate: (section: string) => void;
}) {
  const live = useRealtime();
  const counts = live.snapshot?.counts;
  const alerts = live.snapshot?.alerts || [];
  const [open, setOpen] = useState(false);
  const lastTotal = useRef(0);

  const dmPending = dm ? dm.filter((item) => item.status === "open").length : null;
  const criticalCount = alerts.filter((alert) => alert.level === "critical").length;

  const items: TodoItem[] = [];
  if (counts) {
    if (alerts.length) {
      items.push({ key: "alerts", name: "系统告警", count: counts.alerts || alerts.length, severity: criticalCount ? 3 : 2, meta: alerts[0]?.title || "存在未恢复告警", section: "alerts", icon: AlertTriangle, at: alerts[0]?.last_seen_at });
    }
    if (counts.review) {
      items.push({ key: "review", name: "AI 人工复审", count: counts.review, severity: 2, meta: counts.reviewAnomaly ? `其中 ${counts.reviewAnomaly} 项采集异常` : "等待人工判断", section: "ai-review", icon: Sparkles });
    }
    if (counts.report) {
      items.push({ key: "reports", name: "内容举报", count: counts.report, severity: 2, meta: "待处理的内容举报", section: "reports", icon: Flag });
    }
    if (dmPending) {
      items.push({ key: "dm", name: "私信举报", count: dmPending, severity: 1, meta: "待处理的私信举报", section: "messages", icon: Bell });
    }
    if (counts.uploadFailed) {
      items.push({ key: "upload", name: "上传失败", count: counts.uploadFailed, severity: 1, meta: "近 24 小时失败任务", section: "media-service", icon: HardDrive });
    }
  }
  if (overview?.pending) {
    items.push({ key: "content", name: "待审内容", count: overview.pending, severity: 2, meta: "投稿与修改稿等待审核", section: "content", icon: ListChecks });
  }
  if (media?.failed) {
    items.push({ key: "media", name: "媒体失败", count: media.failed, severity: 1, meta: "近 24 小时上传失败", section: "media-service", icon: HardDrive });
  }

  const unique = new Map<string, TodoItem>();
  for (const item of items) {
    const existing = unique.get(item.key);
    if (!existing || existing.count < item.count) unique.set(item.key, item);
  }
  const sorted = [...unique.values()].sort((a, b) => b.severity - a.severity || b.count - a.count);
  const total = sorted.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    if (total > 0 && lastTotal.current === 0) setOpen(true);
    lastTotal.current = total;
  }, [total]);

  const loading = !live.snapshot && (live.status === "idle" || live.status === "reconnecting");
  const hardError = live.status === "offline" && !live.snapshot;

  return (
    <div className="cc2-todo">
      {criticalCount > 0 && !open ? (
        <div className="cc2-todo__alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <b>{criticalCount} 条严重告警</b>
          <span>{alerts.find((alert) => alert.level === "critical")?.title}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="cc2-todo__empty"><Loader2 size={14} className="ab-spin" aria-hidden="true" />正在读取待办…</div>
      ) : hardError ? (
        <div className="cc2-todo__empty" style={{ color: "var(--ab-coral)" }}>
          <AlertTriangle size={14} aria-hidden="true" />实时通道中断，待办数量暂不可用（{live.error || "连接异常"}）
        </div>
      ) : total === 0 ? (
        <button type="button" className="cc2-todo__empty" style={{ width: "100%", border: 0, background: "none", cursor: "pointer", textAlign: "left" }} onClick={() => setOpen((value) => !value)}>
          <ShieldCheck size={14} aria-hidden="true" />暂无待办
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2 }}>{open ? "收起" : "展开全部"}{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        </button>
      ) : null}

      {open ? (
        <>
          {sorted.length ? sorted.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} type="button" className="cc2-todo__row" onClick={() => onNavigate(item.section)}>
                <span className="cc2-todo__icon" data-tone={item.severity === 3 ? "bad" : item.severity === 2 ? "warn" : undefined}><Icon size={14} aria-hidden="true" /></span>
                <span className="cc2-todo__body">
                  <span className="cc2-todo__name">{item.name}</span>
                  <span className="cc2-todo__meta">{item.meta}</span>
                </span>
                <span className="cc2-todo__count" data-tone={item.severity === 3 ? "bad" : item.severity === 2 ? "warn" : undefined}>{fmtNum(item.count)}</span>
              </button>
            );
          }) : (
            <div className="cc2-todo__empty">所有待办均为 0，暂无需要处理的事项。</div>
          )}
        </>
      ) : null}

      {!open && total > 0 ? (
        <div className="cc2-mod__foot">
          <span>{total} 项待处理 · {sorted[0]?.name} 优先</span>
          <button type="button" className="cc2-fold" onClick={() => setOpen(true)}>展开<ChevronDown size={12} /></button>
        </div>
      ) : null}

      {dmError && !dm ? <p className="cc2-note" style={{ color: "var(--ab-amber)", padding: "0 14px 10px" }}>私信举报读取失败：{shortError(dmError)}</p> : null}
      {overviewError && !overview ? <p className="cc2-note" style={{ color: "var(--ab-amber)", padding: "0 14px 10px" }}>内容待办读取失败：{shortError(overviewError)}</p> : null}
    </div>
  );
}

/* ========================================================================== */
/* 平台运营                                                                    */
/* ========================================================================== */

function OpsPanel({
  data, pending, error, opsRange, customFrom, customTo, setCustomFrom, setCustomTo,
}: {
  data: OpsResponse | null; pending: boolean; error: string; opsRange: OpsRange;
  customFrom: string; customTo: string; setCustomFrom: (value: string) => void; setCustomTo: (value: string) => void;
}) {
  const customBar = opsRange === "custom" ? (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="date" className="cc2-btn" style={{ height: 28 }} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} aria-label="开始日期" />
      <span style={{ color: "var(--ab-ink-3)", fontSize: 11 }}>至</span>
      <input type="date" className="cc2-btn" style={{ height: 28 }} value={customTo} onChange={(event) => setCustomTo(event.target.value)} aria-label="结束日期" />
    </div>
  ) : null;

  if (error && !data) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{customBar}<div className="cc2-chart__empty" style={{ minHeight: 100 }}>运营数据读取失败：{shortError(error)}</div></div>;
  }
  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {customBar}
        {opsRange === "custom" && (!customFrom || !customTo)
          ? <div className="cc2-chart__empty" style={{ minHeight: 100 }}>选择起止日期后统计</div>
          : <div className="cc2-skel" style={{ height: 180 }} />}
      </div>
    );
  }
  const s = data.summary;
  const tierText = s.membership.byTier.map((item) => `${tierLabel(item.tier)} ${item.count}`).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: pending ? 0.55 : 1, transition: "opacity .15s ease" }}>
      {customBar}
      <div className="cc2-ops__top">
        <div className="cc2-kpi">
          <b>{fmtNum(s.users.total)}</b>
          <i>注册用户 · 累计</i>
        </div>
        <div className="cc2-kpi" data-tone="ok">
          <b>+{fmtNum(s.users.new)}</b>
          <i>新增用户 · {data.range.label}</i>
        </div>
        <div className="cc2-kpi">
          <b>{fmtNum(s.users.active)}</b>
          <i>活跃用户 · {data.range.label}</i>
        </div>
      </div>

      <dl className="cc2-cols">
        <div className="cc2-col"><dt>PV 访问</dt><dd>{fmtNum(s.visits.pv)}</dd></div>
        <div className="cc2-col"><dt>UV（账号或 IP）</dt><dd>{fmtNum(s.visits.uv)}</dd></div>
        <div className="cc2-col"><dt>独立 IP</dt><dd>{fmtNum(s.visits.ips)}</dd></div>
        <div className="cc2-col"><dt>错误率</dt><dd>{s.visits.errorRate == null ? "—" : `${(s.visits.errorRate * 100).toFixed(1)}%`}</dd></div>
      </dl>

      <dl className="cc2-cols">
        <div className="cc2-col"><dt>已发布作品</dt><dd>{fmtNum(s.content.published)}</dd></div>
        <div className="cc2-col"><dt>精选（{data.range.label}）</dt><dd>{fmtNum(s.content.featured)}</dd></div>
        <div className="cc2-col"><dt>AI 资源 · 累计</dt><dd>{fmtNum(s.content.ai)}</dd></div>
        <div className="cc2-col"><dt>合集 · 累计</dt><dd>{fmtNum(s.content.series)}</dd></div>
      </dl>

      <dl className="cc2-cols">
        <div className="cc2-col"><dt>阅读 · 累计</dt><dd>{fmtNum(s.engagement.views)}</dd></div>
        <div className="cc2-col"><dt>点赞 · 累计</dt><dd>{fmtNum(s.engagement.likes)}</dd></div>
        <div className="cc2-col"><dt>收藏（{data.range.label}）</dt><dd>{fmtNum(s.engagement.saves)}</dd></div>
        <div className="cc2-col"><dt>评论（{data.range.label}）</dt><dd>{fmtNum(s.engagement.comments)}</dd></div>
      </dl>

      <div className="cc2-cols" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div className="cc2-col"><dt>会员总数</dt><dd>{fmtNum(s.membership.total)}</dd></div>
        <div className="cc2-col"><dt>新增会员（{data.range.label}）</dt><dd>{fmtNum(s.membership.new)}</dd></div>
        <div className="cc2-col"><dt>会员构成</dt><dd style={{ fontSize: 12, fontWeight: 550 }}>{tierText || "—"}</dd></div>
      </div>

      <p className="cc2-note">
        阅读/点赞为作品累计口径，无法按时间段拆分；收藏/评论按创建时间落在区间内统计。独立 IP 不等同于真实用户数。
        {s.meta?.logSince ? ` 访问日志自 ${new Date(s.meta.logSince).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 起可用。` : ""}
      </p>
    </div>
  );
}

function tierLabel(tier: string) {
  return ({ free: "免费", plus: "Plus", pro: "Pro" } as Record<string, string>)[tier] || tier;
}

/* ========================================================================== */
/* 服务运行状态                                                                */
/* ========================================================================== */

function ServicePanel({
  services, servicesError, media, cost, storage, role, onNavigate,
}: {
  services: ServicesResponse | null; servicesError: string;
  media: MediaOverview | null; cost: CostResponse | null; storage: StorageResponse | null;
  role: string; onNavigate: (section: string) => void;
}) {
  const live = useRealtime();
  const counts = live.snapshot?.counts;
  if (servicesError && !services) {
    return <div className="cc2-chart__empty" style={{ minHeight: 120 }}>服务状态读取失败：{shortError(servicesError)}（当前角色 {role}）</div>;
  }
  if (!services) return <div className="cc2-skel" style={{ height: 220 }} />;

  const byKey = new Map(services.services.map((item) => [item.key, item]));
  const web = byKey.get("web");
  const api = byKey.get("api");
  const db = byKey.get("database");
  const storageService = byKey.get("storage");
  const ai = byKey.get("ai-worker");

  const storageFiles = storage?.buckets?.reduce((sum, item) => sum + (item.files || 0), 0) ?? null;
  const storageBytes = storage?.buckets?.reduce((sum, item) => sum + (item.bytes || 0), 0) ?? null;

  const rows: Array<{ key: string; label: string; icon: typeof Server; metric: string; state: StatusTone; stateText: string; section: string }> = [
    {
      key: "web", label: "Web 服务", icon: Globe,
      metric: `运行 ${formatUptime(services.uptime_seconds)} · 进程 CPU ${percent(web?.cpu_percent)}`,
      ...statusOf(web), section: "services",
    },
    {
      key: "api", label: "业务 API", icon: Activity,
      metric: `5 分钟 ${fmtNum(live.snapshot?.live.requests)} 次 · 延迟 ${live.snapshot?.live.avg_ms != null ? `${Math.round(live.snapshot.live.avg_ms)} ms` : "—"}`,
      ...statusOf(api), section: "services",
    },
    {
      key: "db", label: "数据库", icon: HardDrive,
      metric: db?.updated_at ? `最近探测 ${fmtTime(db.updated_at)}` : "等待探测",
      ...statusOf(db), section: "services",
    },
    {
      key: "media", label: "媒体服务", icon: HardDrive,
      metric: media ? `24h 成功 ${fmtNum(media.ready)} · 失败 ${fmtNum(media.failed)} · 成功率 ${fmtPct(media.final_success_rate)}` : "等待统计",
      ...(media && (media.failed || 0) > 0 ? { state: "warn" as StatusTone, stateText: "有失败任务" } : statusOf(storageService)), section: "media-service",
    },
    {
      key: "ai", label: "AI 服务", icon: Sparkles,
      metric: cost ? `本月 ${fmtNum((cost.ai.inputTokens || 0) + (cost.ai.outputTokens || 0))} Token · ${fmtNum(cost.ai.requests)} 次调用` : "等待用量",
      ...statusOf(ai), section: "ai-usage",
    },
    {
      key: "storage", label: "存储服务", icon: HardDrive,
      metric: storage ? `${fmtNum(storageFiles)} 个对象 · ${fmtBytes(storageBytes)}` : "等待统计",
      ...statusOf(storageService), section: "storage",
    },
    {
      key: "process", label: "服务器进程", icon: Cpu,
      metric: `负载 ${live.snapshot?.server?.load1 != null ? live.snapshot.server.load1.toFixed(2) : "—"} · ${services.services.filter((item) => item.status === "running").length} 个服务运行`,
      ...statusOf(web), section: "process",
    },
    {
      key: "queue", label: "后台任务队列", icon: ListChecks,
      metric: `运行中 ${fmtNum(counts?.tasksRunning)} · 上传 ${fmtNum(counts?.uploadActive)} · 扫描 ${fmtNum(counts?.scanRunning)}`,
      state: counts?.tasksRunning ? "ok" : "idle", stateText: counts?.tasksRunning ? "执行中" : "空闲", section: "tasks",
    },
  ];

  return (
    <div className="cc2-svc">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <button key={row.key} type="button" className="cc2-svc__row" onClick={() => onNavigate(row.section)}>
            <span className="cc2-svc__icon"><Icon size={14} aria-hidden="true" /></span>
            <span className="cc2-svc__name">{row.label}</span>
            <span className="cc2-svc__metric">{row.metric}</span>
            <span className="cc2-svc__state" data-tone={row.state}><i className="cc2-dot" data-tone={row.state} />{row.stateText}</span>
            <ChevronRight size={13} className="cc2-svc__chev" aria-hidden="true" />
          </button>
        );
      })}
      <p className="cc2-note" style={{ padding: "0 14px 12px" }}>
        状态来自宿主机进程表、容器可达性与真实任务执行结果；未接入的指标显示「等待探测」，不以静态文字冒充正常。
      </p>
    </div>
  );
}

type StatusTone = "ok" | "warn" | "bad" | "idle";

function statusOf(row?: ServiceRow | null): { state: StatusTone; stateText: string } {
  if (!row) return { state: "idle", stateText: "未上报" };
  if (row.status === "running" && row.health === "healthy") return { state: "ok", stateText: "运行正常" };
  if (row.status === "running") return { state: "warn", stateText: "运行中 · 待探活" };
  if (row.status === "stopped" || row.status === "failed") return { state: "bad", stateText: "已停止" };
  return { state: "idle", stateText: "状态未知" };
}

/* ========================================================================== */
/* AI 用量 / 最近操作                                                          */
/* ========================================================================== */

function AiPanel({ cost, costError, onNavigate }: { cost: CostResponse | null; costError: string; onNavigate: (section: string) => void }) {
  const live = useRealtime();
  if (costError && !cost) return <div className="cc2-chart__empty" style={{ minHeight: 96 }}>模型用量读取失败：{shortError(costError)}</div>;
  const totalTokens = cost ? (cost.ai.inputTokens || 0) + (cost.ai.outputTokens || 0) : null;
  return (
    <>
      <div className="cc2-ops__top">
        <div className="cc2-kpi"><b>{fmtNum(totalTokens)}</b><i>本月 Token</i></div>
        <div className="cc2-kpi"><b>{fmtNum(cost?.ai.requests)}</b><i>本月调用</i></div>
      </div>
      <dl className="cc2-cols" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
        <div className="cc2-col"><dt>运行中批次</dt><dd>{fmtNum(live.snapshot?.counts.tasksRunning)}</dd></div>
        <div className="cc2-col"><dt>复审异常</dt><dd>{fmtNum(live.snapshot?.counts.reviewAnomaly)}</dd></div>
      </dl>
      <p className="cc2-note">
        {cost?.configured ? `按已配置单价估算：${cost.totals.estimate == null ? "—" : `${cost.totals.estimate} ${cost.currency}`}` : "尚未配置计费单价，仅显示真实 Token 与调用次数。"}
      </p>
      <button type="button" className="cc2-link" onClick={() => onNavigate("ai-review")}>进入 AI 审核中心<ChevronRight size={12} /></button>
    </>
  );
}

function ActivityPanel({ data, error }: { data: OverviewResponse | null; error: string }) {
  if (error && !data) return <div className="cc2-chart__empty" style={{ minHeight: 96 }}>操作记录读取失败：{shortError(error)}</div>;
  if (!data) return <div className="cc2-skel" style={{ height: 120 }} />;
  const rows = data.recent || [];
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.length ? rows.map((row) => (
        <div key={row.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: "1px solid var(--ab-line)", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, color: "var(--ab-ink-2)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.nickname || "系统"} · {actionLabel(row.action)}
          </span>
          <span style={{ fontSize: 10, color: "var(--ab-ink-3)", flex: "none", fontVariantNumeric: "tabular-nums" }}>{fmtTime(row.created_at)}</span>
        </div>
      )) : <div className="cc2-todo__empty">暂无可展示的管理动作</div>}
    </div>
  );
}

/* ========================================================================== */
/* 编辑抽屉                                                                    */
/* ========================================================================== */

function ConsoleEditor({
  mode, layout, onClose, onSave, onReset,
}: {
  mode: ConsoleMode; layout: ConsoleLayout;
  onClose: () => void;
  onSave: (mode: ConsoleMode, layout: ConsoleLayout) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [draftMode, setDraftMode] = useState<ConsoleMode>(mode);
  const [order, setOrder] = useState<ModuleKey[]>(layout.order);
  const [hidden, setHidden] = useState<ModuleKey[]>(layout.hidden);
  const [width, setWidth] = useState<Record<string, 1 | 2>>(layout.width);
  const [quick, setQuick] = useState<string[]>(layout.quick);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const allowed = draftMode === "lite" ? CORE_MODULES : DEFAULT_LAYOUT.order;

  const move = (key: ModuleKey, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(key);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  const toggleQuick = (key: string) => {
    setQuick((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length >= 8 ? current : [...current, key]);
  };

  const submit = async () => {
    setSaving(true); setError("");
    try {
      await onSave(draftMode, { order, hidden, width, quick });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "布局保存失败");
      setSaving(false);
    }
  };

  return (
    <div className="cc2-drawer" role="dialog" aria-modal="true" aria-label="编辑控制台">
      <div className="cc2-drawer__panel">
        <div className="cc2-drawer__head">
          <h2>编辑控制台</h2>
          <button type="button" className="cc2-row__mini" onClick={onClose} aria-label="关闭"><X size={14} /></button>
        </div>

        <div className="cc2-drawer__group">
          <span className="cc2-drawer__label">显示模式</span>
          <div className="cc2-tabs" role="tablist" aria-label="显示模式">
            <button type="button" role="tab" aria-selected={draftMode === "lite"} className="cc2-tab" onClick={() => setDraftMode("lite")}>精简模式</button>
            <button type="button" role="tab" aria-selected={draftMode === "pro"} className="cc2-tab" onClick={() => setDraftMode("pro")}>专业模式</button>
          </div>
          <p className="cc2-note">精简模式只保留系统资源、待办、服务状态与快捷入口；专业模式额外显示运营数据、AI 用量与最近操作。</p>
        </div>

        <div className="cc2-drawer__group">
          <span className="cc2-drawer__label">模块顺序与显示</span>
          {order.map((key, index) => {
            const meta = MODULE_META[key];
            const enabled = allowed.includes(key) && !hidden.includes(key);
            return (
              <div key={key} className="cc2-row">
                <GripVertical size={13} color="var(--ab-ink-3)" aria-hidden="true" />
                <span className="cc2-row__name">{meta.title}</span>
                <button type="button" className="cc2-row__mini" disabled={index === 0} onClick={() => move(key, -1)} aria-label={`上移 ${meta.title}`}><ChevronUp size={13} /></button>
                <button type="button" className="cc2-row__mini" disabled={index === order.length - 1} onClick={() => move(key, 1)} aria-label={`下移 ${meta.title}`}><ChevronDown size={13} /></button>
                <button type="button" className="cc2-row__mini" onClick={() => setWidth((current) => ({ ...current, [key]: current[key] === 2 ? 1 : 2 }))} aria-label={`${meta.title}宽度`} title="切换半宽/全宽">
                  {width[key] === 2 ? "全" : "半"}
                </button>
                <button
                  type="button"
                  className="cc2-switch"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${meta.title}显示`}
                  disabled={!allowed.includes(key)}
                  onClick={() => setHidden((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])}
                />
              </div>
            );
          })}
          {draftMode === "lite" ? <p className="cc2-note">精简模式下运营、AI 用量与最近操作不参与展示，切回专业模式即可恢复。</p> : null}
        </div>

        <div className="cc2-drawer__group">
          <span className="cc2-drawer__label">快捷入口（{quick.length}/8）</span>
          <div className="cc2-chips">
            {Object.entries(QUICK_LIBRARY).map(([key, entry]) => (
              <button key={key} type="button" className="cc2-chip" data-on={quick.includes(key) ? "1" : "0"} onClick={() => toggleQuick(key)}>{entry.label}</button>
            ))}
          </div>
          <p className="cc2-note">只影响首页展示，不会删除功能或改变权限；完整入口始终保留在侧栏。</p>
        </div>

        {error ? <p className="cc2-note" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}

        <div className="cc2-drawer__foot">
          <button type="button" className="cc2-btn" onClick={() => void onReset()}><RotateCcw size={13} />恢复默认</button>
          <button type="button" className="cc2-btn cc2-btn--primary" onClick={() => void submit()} disabled={saving}>{saving ? "保存中…" : "保存布局"}</button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* 工具                                                                        */
/* ========================================================================== */

function percent(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatUptime(seconds?: number) {
  if (!seconds || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} 天 ${hours} 小时`;
  if (hours) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function shortError(message: string) {
  if (!message) return "未知错误";
  if (message.startsWith("HTTP 403")) return "权限不足";
  if (message.startsWith("HTTP 401")) return "登录已失效";
  return message.length > 60 ? `${message.slice(0, 60)}…` : message;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    post_hide: "隐藏内容", post_publish: "发布内容", user_restrict: "限制账号",
    report_resolve: "处理举报", report_dismiss: "驳回举报", "cost.update": "更新成本配置",
    system_flags_update: "更新功能开关", service_restart: "重启服务",
  };
  return map[action] || action;
}
