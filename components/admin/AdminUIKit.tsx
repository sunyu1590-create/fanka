"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Activity, ArrowLeft, ChevronRight, HardDrive, LayoutGrid, Network, RefreshCw, ScrollText, Server, Settings2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { startRealtime, stopRealtime } from "@/lib/admin-live";
import LiveIndicator, { LiveCount } from "./LiveIndicator";

export type AdminTab = "overview" | "monitor" | "network" | "access" | "server" | "media" | "ai" | "business" | "logs";

export type AdminSectionMeta = { title: string; tab: AdminTab; group: string };

/** 管理中心 3.0：八个并列模块 + 总览，运维/安全/资源统一入口。 */
export const ADMIN_NAV: Array<{ key: AdminTab; label: string; icon: typeof LayoutGrid }> = [
  { key: "overview", label: "总览", icon: LayoutGrid },
  { key: "monitor", label: "监控", icon: Activity },
  { key: "network", label: "网络", icon: Network },
  { key: "access", label: "访问", icon: ShieldCheck },
  { key: "server", label: "服务器", icon: Server },
  { key: "media", label: "资源", icon: HardDrive },
  { key: "ai", label: "审核与 AI", icon: Sparkles },
  { key: "business", label: "用户与业务", icon: Users },
  { key: "logs", label: "日志", icon: ScrollText },
];

export const ADMIN_HUB_GROUPS: Record<Exclude<AdminTab, "overview">, Array<{ title: string; items: string[] }>> = {
  monitor: [
    { title: "运行状态", items: ["system-monitor", "process", "tasks"] },
    { title: "业务观测", items: ["traffic", "media-service"] },
    { title: "告警", items: ["alerts", "alert-rules"] },
  ],
  network: [
    { title: "连接", items: ["tcp", "ips"] },
    { title: "流量", items: ["traffic", "media-service"] },
  ],
  access: [
    { title: "网络访问", items: ["ip-rules"] },
    { title: "账号能力", items: ["account-limits"] },
    { title: "内容拦截", items: ["keywords"] },
  ],
  server: [
    { title: "服务", items: ["services", "deployments"] },
    { title: "应急控制", items: ["emergency"] },
    { title: "资源占用", items: ["process"] },
  ],
  media: [
    { title: "资源", items: ["storage", "trash"] },
    { title: "传输", items: ["media-service", "traffic"] },
  ],
  ai: [
    { title: "审核", items: ["ai-review", "content", "decor-review"] },
    { title: "质量与策略", items: ["review-stats", "review-policy"] },
    { title: "模型", items: ["ai-usage", "ai-settings"] },
    { title: "工具", items: ["ai-batch", "ai-classify", "ai-space", "ai-resource-center"] },
  ],
  business: [
    { title: "用户", items: ["users", "membership", "community-access"] },
    { title: "社区治理", items: ["reports", "messages", "appeals", "comments"] },
    { title: "运营", items: ["distribution", "home-banners", "cover-templates", "topic-events", "official-notices", "exploration-ad", "cost"] },
    { title: "版本", items: ["app-download"] },
  ],
  logs: [
    { title: "日志", items: ["access-logs", "audit"] },
    { title: "告警", items: ["alerts", "alert-rules"] },
  ],
};

export const ADMIN_TITLES: Record<string, string> = {
  overview: "控制中心",
  monitor: "全局监控",
  network: "网络与连接",
  access: "访问控制",
  server: "服务器管理",
  media: "媒体与资源",
  ai: "AI 审核与用量",
  business: "用户与业务",
  logs: "日志与告警",
  "ai-review": "AI 审核中心",
  content: "人工复审",
  "decor-review": "装扮复审",
  "ai-batch": "批量任务",
  "ai-classify": "自动分类记录",
  "review-stats": "审核质量",
  "review-policy": "审核策略",
  "system-monitor": "系统监控",
  process: "进程监控",
  tcp: "TCP 连接",
  ips: "IP 访问分析",
  traffic: "流量分析",
  "ip-rules": "IP 规则",
  "account-limits": "账号限制",
  services: "服务状态",
  deployments: "部署记录",
  emergency: "紧急控制",
  trash: "资源回收站",
  "access-logs": "访问日志",
  "media-service": "媒体服务",
  storage: "资源管理",
  alerts: "系统告警",
  "alert-rules": "告警规则",
  tasks: "任务中心",
  cost: "运营成本",
  reports: "内容举报",
  messages: "私信举报",
  appeals: "申诉处理",
  comments: "评论管理",
  keywords: "关键词规则",
  users: "用户管理",
  membership: "会员与激励",
  "community-access": "认证与入驻",
  "topic-events": "话题共创",
  "official-notices": "系统通知",
  "exploration-ad": "运营广告位",
  "ai-space": "AI 专区",
  "ai-resource-center": "AI 资源",
  "ai-usage": "模型用量",
  "ai-settings": "AI 服务",
  audit: "操作记录",
  "app-download": "版本发布",
  distribution: "内容分发",
  "home-banners": "首页推荐位",
  "cover-templates": "合集封面",
};

export const ADMIN_HUB_DESC: Record<Exclude<AdminTab, "overview">, string> = {
  monitor: "服务器、业务、任务与告警",
  network: "TCP 连接、IP 访问与真实流量",
  access: "IP 规则、账号能力与内容拦截",
  server: "服务健康、部署历史与应急控制",
  media: "资源、回收站与传输任务",
  ai: "审核、策略、质量与模型用量",
  business: "用户、社区治理与运营位",
  logs: "访问日志、审计记录与告警",
};

export function tabOfSection(section: string): AdminTab {
  if (section === "overview" || section === "monitor" || section === "network" || section === "access" || section === "server" || section === "media" || section === "ai" || section === "business" || section === "logs") return section;
  if (["system-monitor", "process", "tasks"].includes(section)) return "monitor";
  if (["tcp", "ips", "traffic", "media-service"].includes(section)) return "network";
  if (["ip-rules", "account-limits", "keywords"].includes(section)) return "access";
  if (["services", "deployments", "emergency"].includes(section)) return "server";
  if (["storage", "trash"].includes(section)) return "media";
  if (["ai-review", "content", "decor-review", "ai-batch", "ai-classify", "review-stats", "review-policy", "ai-usage", "ai-settings", "ai-space", "ai-resource-center"].includes(section)) return "ai";
  if (["access-logs", "alerts", "alert-rules", "audit"].includes(section)) return "logs";
  return "business";
}

export function titleOf(section: string): string {
  return ADMIN_TITLES[section] || "控制中心";
}

/** 顶部标题栏 + 桌面侧栏 + 移动底栏。所有二级页面共用同一导航来源。 */
export function AdminShell({
  section,
  role,
  counts,
  onNavigate,
  onBack,
  onRefresh,
  refreshing,
  actions,
  children,
}: {
  section: string;
  role: string;
  counts?: Partial<Record<string, number>>;
  onNavigate: (section: string) => void;
  onBack: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const tab = tabOfSection(section);
  const isHub = section !== "overview" && Boolean(ADMIN_HUB_GROUPS[tab as Exclude<AdminTab, "overview">]) && section === tab;
  const isOverview = section === "overview";
  const showBottomNav = isOverview || isHub;
  const title = titleOf(section);

  // 进入控制中心即启动全局实时通道，离开时停止；切换二级页面不会重建连接。
  useEffect(() => {
    startRealtime();
    return () => stopRealtime();
  }, []);

  const goBack = () => {
    if (isOverview) { onBack(); return; }
    if (isHub) { onNavigate("overview"); return; }
    onNavigate(tab);
  };

  const navItems: Array<{ key: string; label: string; count?: number; icon?: typeof LayoutGrid }> = [];
  for (const item of ADMIN_NAV) {
    navItems.push({ key: item.key, label: item.label, icon: item.icon, count: item.key === "ai" ? counts?.review : item.key === "monitor" ? counts?.alerts : undefined });
  }

  return (
    <section className="admin-shell" aria-label="HEIKA 控制中心">
      <div className="ab-layout">
        <aside className="ab-sidebar" aria-label="控制中心导航">
          <div className="ab-side-brand"><i aria-hidden="true" />控制中心</div>
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} type="button" className={`ab-side-item${tab === item.key ? " active" : ""}`} onClick={() => onNavigate(item.key)}>
                <Icon size={15} aria-hidden="true" />
                <span className="ab-side-item__label">{item.label}</span>
                {item.key === "ai" ? <LiveCount of="review" fallback={counts?.review} /> : null}
                {item.key === "monitor" ? <LiveCount of="alerts" fallback={counts?.alerts} /> : null}
              </button>
            );
          })}
          {tab !== "overview" && ADMIN_HUB_GROUPS[tab as Exclude<AdminTab, "overview">].map((group) => (
            <div key={group.title}>
              <div className="ab-side-group">{group.title}</div>
              {group.items.map((key) => (
                <button key={key} type="button" className={`ab-side-item${section === key ? " active" : ""}`} onClick={() => onNavigate(key)}>
                  <span className="ab-side-item__label">{titleOf(key)}</span>
                  {key === "content" && (counts?.content || 0) > 0 ? <span className="ab-side-item__count">{counts?.content}</span> : null}
                  {key === "reports" && (counts?.reports || 0) > 0 ? <span className="ab-side-item__count">{counts?.reports}</span> : null}
                </button>
              ))}
            </div>
          ))}
          <div className="ab-side-foot">
            <button type="button" className="ab-side-item" onClick={onBack}>
              <ArrowLeft size={15} aria-hidden="true" />
              <span className="ab-side-item__label">返回应用</span>
            </button>
          </div>
        </aside>

        <main className="ab-main">
          {/* 顶栏只保留操作：返回与刷新相邻成组；总览页不再重复「控制中心」标题
              （底部导航已高亮「总览」），二级页保留标题作为当前位置提示。 */}
          <header className="ab-topbar">
            <button type="button" className="ab-iconbtn" aria-label="返回" onClick={goBack}><ArrowLeft size={19} /></button>
            <button type="button" className="ab-iconbtn" aria-label="刷新" onClick={onRefresh} disabled={refreshing}><RefreshCw size={17} className={refreshing ? "ab-spin" : undefined} /></button>
            <span className="ab-topbar__title">{title}</span>
            <LiveIndicator />
            {isOverview ? (
              <button type="button" className="ab-iconbtn" aria-label="控制台设置" onClick={() => window.dispatchEvent(new Event("heika:console-settings"))}><Settings2 size={17} /></button>
            ) : null}
          </header>

          <div className="ab-pagehead">
            <div>
              <h1 className="ab-h1">{title}</h1>
              {isOverview ? <p className="ab-sub">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</p> : null}
              {isHub ? <p className="ab-sub">{ADMIN_HUB_DESC[tab as Exclude<AdminTab, "overview">]}</p> : null}
            </div>
            <div className="ab-pagehead__actions">
              {actions}
              <LiveIndicator compact />
              {isOverview ? (
                <button type="button" className="ab-iconbtn" aria-label="控制台设置" onClick={() => window.dispatchEvent(new Event("heika:console-settings"))} style={{ background: "var(--ab-fill)" }}><Settings2 size={16} /></button>
              ) : null}
              <button type="button" className="ab-iconbtn" aria-label="刷新" onClick={onRefresh} disabled={refreshing} style={{ background: "var(--ab-fill)" }}><RefreshCw size={16} className={refreshing ? "ab-spin" : undefined} /></button>
            </div>
          </div>

          {children}
        </main>
      </div>

      {showBottomNav ? (
        <nav className="ab-bottomnav" aria-label="控制中心导航">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => onNavigate(item.key)}>
                <Icon size={19} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
      ) : null}
      <style>{".ab-spin{animation:ab-spin 1s linear infinite}@keyframes ab-spin{to{transform:rotate(360deg)}}"}</style>
    </section>
  );
}

/** 环形进度仪表，value 为 0–100；颜色随阈值变化（正常/偏高/危险）。 */
export function Ring({
  value,
  size = 74,
  stroke = 7,
  tone,
  label,
  large,
  warnAt = 75,
  critAt = 90,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  tone?: "auto" | "gold" | "violet" | "blue" | "emerald" | "amber" | "coral";
  label?: string;
  large?: boolean;
  /** 转琥珀的阈值。磁盘比内存更不耐满，调用方可以单独下调。 */
  warnAt?: number;
  /** 转珊瑚红的阈值。 */
  critAt?: number;
}) {
  const safe = value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;
  const resolvedTone = tone && tone !== "auto" ? tone : safe >= critAt ? "coral" : safe >= warnAt ? "amber" : "emerald";
  const color = `var(--ab-${resolvedTone})`;
  return (
    <div className={`ab-ring${large ? " ab-ring--lg" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--ab-fill-strong)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.2,1), stroke .3s ease" }}
        />
      </svg>
      <div className="ab-ring__value">
        <b style={{ color }}>{value == null || !Number.isFinite(value) ? "—" : `${Math.round(safe)}%`}</b>
        {label ? <small>{label}</small> : null}
      </div>
    </div>
  );
}

export type ChartPoint = { t: number; v: number | null };

/** 真实数据面积图：带纵轴刻度、时间范围、缺失值断点；无数据时显示空态。 */
export function TrendChart({
  points,
  height = 132,
  unit = "",
  color = "var(--ab-blue)",
  minSpan = 60,
  yMinZero = true,
  emptyText = "该时间范围内暂无采集数据",
}: {
  points: ChartPoint[];
  height?: number;
  unit?: string;
  color?: string;
  minSpan?: number;
  yMinZero?: boolean;
  emptyText?: string;
}) {
  const valid = points.filter((point) => point.v != null && Number.isFinite(point.v as number)) as Array<{ t: number; v: number }>;
  if (valid.length < 2) return <div className="ab-chart__empty">{emptyText}</div>;
  const width = 320;
  // 左侧刻度右对齐到曲线左缘，标签再长也不会压住曲线；顶部多留 2px 避免最高点贴边。
  const padL = 36;
  const padR = 8;
  const padT = 10;
  const padB = 16;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const tMin = valid[0].t;
  const tMax = Math.max(valid[valid.length - 1].t, tMin + minSpan * 1000);
  const values = valid.map((point) => point.v);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const maxV = rawMax === rawMin ? rawMax + 1 : rawMax;
  const minV = yMinZero ? 0 : rawMin - (rawMax - rawMin) * 0.15;
  const x = (t: number) => padL + ((t - tMin) / Math.max(1, tMax - tMin)) * innerW;
  const y = (v: number) => padT + innerH - ((v - minV) / Math.max(0.0001, maxV - minV)) * innerH;

  let path = "";
  let area = "";
  let lastX: number | null = null;
  for (const point of valid) {
    const px = x(point.t);
    const py = y(point.v);
    if (lastX === null || px - lastX > 12) {
      area += `${area ? " L" : "M"}${px.toFixed(1)},${height - padB} L${px.toFixed(1)},${py.toFixed(1)}`;
      path += `${path ? " M" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
    } else {
      area += ` L${px.toFixed(1)},${py.toFixed(1)}`;
      path += ` L${px.toFixed(1)},${py.toFixed(1)}`;
    }
    lastX = px;
  }
  const last = valid[valid.length - 1];
  area += ` L${x(last.t).toFixed(1)},${height - padB} Z`;
  const gradId = `ab-grad-${Math.abs(hashCode(`${color}-${tMin}`))}`;
  const fmtTime = (t: number) => new Date(t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const fmtValue = (v: number) => `${Math.round(v * 10) / 10}${unit}`;

  return (
    <div className="ab-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`趋势图，当前 ${fmtValue(last.v)}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const value = minV + (maxV - minV) * (1 - ratio);
          const gy = padT + innerH * ratio;
          return (
            <g key={ratio}>
              <line x1={padL} y1={gy} x2={width - padR} y2={gy} stroke="var(--ab-line)" strokeDasharray="3 4" strokeWidth="1" />
              <text x={padL - 5} y={gy + 3} fontSize="8.5" fill="var(--ab-ink-3)" textAnchor="end">{fmtValue(value)}</text>
            </g>
          );
        })}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(last.t)} cy={y(last.v)} r="3.2" fill={color} stroke="var(--ab-surface)" strokeWidth="1.5" />
        <text x={padL} y={height - 3} fontSize="8.5" fill="var(--ab-ink-3)">{fmtTime(tMin)}</text>
        <text x={width - padR} y={height - 3} fontSize="8.5" fill="var(--ab-ink-3)" textAnchor="end">{fmtTime(tMax)}</text>
      </svg>
    </div>
  );
}

function hashCode(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return hash;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="ab-seg" role="tablist" aria-label={ariaLabel || "筛选"}>
      {options.map((option) => (
        <button key={option.value} type="button" role="tab" aria-selected={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}{option.count != null ? ` ${option.count}` : ""}
        </button>
      ))}
    </div>
  );
}

export function Group({ children, plain }: { children: ReactNode; plain?: boolean }) {
  return <div className={`ab-group${plain ? " ab-group--plain" : ""}`}>{children}</div>;
}

export function Row({
  icon,
  tone,
  title,
  meta,
  value,
  onClick,
  chevron,
}: {
  icon?: ReactNode;
  tone?: "violet" | "blue" | "emerald" | "amber" | "coral" | "gold";
  title: string;
  meta?: string;
  value?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <>
      {icon ? <span className={`ab-row__icon${tone ? ` tone-${tone}` : ""}`}>{icon}</span> : null}
      <span className="ab-row__body">
        <span className="ab-row__title">{title}</span>
        {meta ? <span className="ab-row__meta">{meta}</span> : null}
      </span>
      {value != null ? <span className="ab-row__value">{value}</span> : null}
      {chevron || onClick ? <ChevronRight size={16} className="ab-row__chev" aria-hidden="true" /> : null}
    </>
  );
  return onClick
    ? <button type="button" className="ab-row" onClick={onClick}>{content}</button>
    : <div className="ab-row">{content}</div>;
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="ab-empty">
      {icon}
      <span>{title}</span>
      {hint ? <span style={{ fontSize: 11 }}>{hint}</span> : null}
    </div>
  );
}

export function fmtNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Number(value));
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(digits).replace(/\.0$/, "")}%`;
}

export function fmtBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

export function fmtTime(value: string | number | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)} 分 ${Math.round((value % 60_000) / 1000)} 秒`;
}

/** 历史记录折叠容器：默认收起、展开才渲染内容，实时刷新不会改变展开状态。 */
export function Collapse({
  title,
  count,
  hint,
  tone,
  children,
  defaultOpen = false,
  onOpen,
}: {
  title: string;
  count?: number;
  hint?: string;
  tone?: "emerald" | "violet" | "blue" | "amber" | "coral";
  children: ReactNode;
  defaultOpen?: boolean;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [touched, setTouched] = useState(defaultOpen);
  return (
    <div className={`ab-fold${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="ab-fold__head"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !touched) { setTouched(true); onOpen?.(); }
        }}
      >
        {tone ? <i className="ab-dot" style={{ background: `var(--ab-${tone})`, boxShadow: "none" }} aria-hidden="true" /> : null}
        <b>{title}</b>
        {hint ? <span className="ab-label" style={{ marginLeft: 2 }}>{hint}</span> : null}
        <small>{count == null ? "" : `${count} 条`}</small>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
      {open ? <div className="ab-fold__body">{touched || defaultOpen ? children : null}</div> : null}
    </div>
  );
}

/** 日粒度柱状图：null 表示未采集（画虚线占位），0 表示真实为零。 */
export function Bars({
  items,
  unit = "",
  color = "var(--ab-emerald)",
  height = 96,
  emptyText = "该范围内暂无数据",
}: {
  items: Array<{ label: string; value: number | null }>;
  unit?: string;
  color?: string;
  height?: number;
  emptyText?: string;
}) {
  if (!items.length) return <div className="ab-chart__empty">{emptyText}</div>;
  const max = Math.max(1, ...items.map((item) => item.value || 0));
  const labelStep = Math.max(1, Math.ceil(items.length / 6));
  return (
    <div className="ab-bars" style={{ height }}>
      <div className="ab-bars__plot">
        {items.map((item, index) => {
          const ratio = item.value == null ? 0 : item.value / max;
          return (
            <span key={`${item.label}-${index}`} className={`ab-bars__col${item.value == null ? " is-missing" : ""}`} title={`${item.label} · ${item.value == null ? "未采集" : `${item.value}${unit}`}`}>
              <i style={{ height: `${Math.max(item.value == null ? 2 : 3, Math.round(ratio * 100))}%`, background: item.value == null ? "transparent" : color }} />
              {index % labelStep === 0 ? <small>{item.label.slice(5)}</small> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
