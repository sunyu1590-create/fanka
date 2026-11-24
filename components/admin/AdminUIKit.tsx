"use client";

import { type ReactNode } from "react";
import { Activity, ArrowLeft, ChevronRight, LayoutGrid, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";

export type AdminTab = "overview" | "review" | "monitor" | "manage";

export type AdminSectionMeta = { title: string; tab: AdminTab; group: string };

/** 管理员信息架构：四大一级入口，所有二级页面归入对应分组。 */
export const ADMIN_NAV: Array<{ key: AdminTab; label: string; icon: typeof LayoutGrid }> = [
  { key: "overview", label: "总览", icon: LayoutGrid },
  { key: "review", label: "审核", icon: ShieldCheck },
  { key: "monitor", label: "监控", icon: Activity },
  { key: "manage", label: "管理", icon: SlidersHorizontal },
];

export const ADMIN_HUB_GROUPS: Record<Exclude<AdminTab, "overview">, Array<{ title: string; items: string[] }>> = {
  review: [
    { title: "审核工作台", items: ["ai-review", "content", "decor-review"] },
    { title: "审核工具", items: ["ai-batch", "ai-classify"] },
  ],
  monitor: [
    { title: "运行状态", items: ["system-monitor", "media-service", "storage", "alerts"] },
  ],
  manage: [
    { title: "社区治理", items: ["reports", "messages", "appeals", "comments", "keywords"] },
    { title: "用户与运营", items: ["users", "membership", "community-access", "topic-events", "official-notices", "exploration-ad"] },
    { title: "AI 与模型", items: ["ai-space", "ai-resource-center", "ai-usage", "ai-settings"] },
    { title: "系统", items: ["audit", "app-download"] },
  ],
};

export const ADMIN_TITLES: Record<string, string> = {
  overview: "控制中心",
  review: "审核",
  monitor: "监控",
  manage: "管理",
  "ai-review": "AI 审核中心",
  content: "人工复审",
  "decor-review": "装扮复审",
  "ai-batch": "批量任务",
  "ai-classify": "自动分类记录",
  "system-monitor": "系统监控",
  "media-service": "媒体服务",
  storage: "存储资源",
  alerts: "系统告警",
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
};

export const ADMIN_HUB_DESC: Record<Exclude<AdminTab, "overview">, string> = {
  review: "AI 初审、人工复审与审核工具",
  monitor: "服务器、媒体与告警",
  manage: "社区、用户与系统配置",
};

export function tabOfSection(section: string): AdminTab {
  if (section === "overview" || section === "review" || section === "monitor" || section === "manage") return section;
  if (["ai-review", "content", "decor-review", "ai-batch", "ai-classify"].includes(section)) return "review";
  if (["system-monitor", "media-service", "storage", "alerts"].includes(section)) return "monitor";
  return "manage";
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
  const isHub = section === "review" || section === "monitor" || section === "manage";
  const isOverview = section === "overview";
  const showBottomNav = isOverview || isHub;
  const title = titleOf(section);

  const goBack = () => {
    if (isOverview) { onBack(); return; }
    if (isHub) { onNavigate("overview"); return; }
    onNavigate(tab);
  };

  const navItems: Array<{ key: string; label: string; count?: number; icon?: typeof LayoutGrid }> = [];
  for (const item of ADMIN_NAV) {
    navItems.push({ key: item.key, label: item.label, icon: item.icon, count: item.key === "review" ? counts?.review : item.key === "monitor" ? counts?.alerts : undefined });
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
                {item.key === "review" && (counts?.review || 0) > 0 ? <span className="ab-side-item__count">{counts?.review}</span> : null}
                {item.key === "monitor" && (counts?.alerts || 0) > 0 ? <span className="ab-side-item__count">{counts?.alerts}</span> : null}
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
            {isOverview ? null : <span className="ab-topbar__title">{title}</span>}
          </header>

          <div className="ab-pagehead">
            <div>
              <h1 className="ab-h1">{title}</h1>
              {isOverview ? <p className="ab-sub">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</p> : null}
              {isHub ? <p className="ab-sub">{ADMIN_HUB_DESC[tab as Exclude<AdminTab, "overview">]}</p> : null}
            </div>
            <div className="ab-pagehead__actions">
              {actions}
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
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  tone?: "auto" | "gold" | "violet" | "blue" | "emerald" | "amber" | "coral";
  label?: string;
  large?: boolean;
}) {
  const safe = value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;
  const resolvedTone = tone && tone !== "auto" ? tone : safe >= 90 ? "coral" : safe >= 75 ? "amber" : "emerald";
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
  const padL = 30;
  const padR = 6;
  const padT = 8;
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
              <text x={4} y={gy + 3} fontSize="8.5" fill="var(--ab-ink-3)">{fmtValue(value)}</text>
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
  ariaLabel: string;
}) {
  return (
    <div className="ab-seg" role="tablist" aria-label={ariaLabel}>
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
