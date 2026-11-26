"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Box, BrainCircuit, Crosshair,
  ExternalLink, Globe2, History, Maximize2, Minimize2, Network, Orbit, PanelRightClose,
  PanelRightOpen, Pause, Play, Radio, RotateCcw, Search, Server, Settings2,
  ShieldHalf, SlidersHorizontal, WifiOff, X,
} from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import type { PickResult, ProjectionMode, QualityMode } from "@/lib/nexus/engine";
import type {
  NexusAiScene, NexusContentScene, NexusGlobeScene, NexusHistoryResponse,
  NexusLink, NexusNode, NexusSceneKey, NexusSecurityScene, NexusSnapshot, NexusStorageScene,
} from "@/lib/nexus/types";
import { useNexusStream } from "@/lib/nexus/useNexusStream";
import NexusCanvas from "./NexusCanvas";
import NexusFallback2D from "./NexusFallback2D";

const SCENES: Array<{ key: NexusSceneKey; label: string; hint: string; icon: typeof Orbit }> = [
  { key: "overview", label: "全域运行态势", hint: "拓扑 · 健康 · 实时请求", icon: Orbit },
  { key: "globe", label: "全球网络态势", hint: "访问来源 · 连接 · 传输", icon: Globe2 },
  { key: "server", label: "服务器数字孪生", hint: "CPU · 内存 · 磁盘 · 网络 · 进程", icon: Server },
  { key: "storage", label: "资源数据城市", hint: "真实占用 · 文件下钻", icon: Box },
  { key: "ai", label: "AI 智能中枢", hint: "任务 · 模型 · 自动审核", icon: BrainCircuit },
  { key: "content", label: "内容知识宇宙", hint: "作品 · 合集 · 标签", icon: Network },
  { key: "security", label: "安全防御空间", hint: "规则 · 拦截 · 告警", icon: ShieldHalf },
  { key: "timeline", label: "时空回溯中心", hint: "历史快照 · 事件回放", icon: History },
];

const RANGES = [
  { key: "1h", label: "1 小时", ms: 3600_000 },
  { key: "6h", label: "6 小时", ms: 6 * 3600_000 },
  { key: "24h", label: "24 小时", ms: 24 * 3600_000 },
  { key: "7d", label: "7 天", ms: 7 * 24 * 3600_000 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const PROJECTIONS: Array<{ key: ProjectionMode; label: string }> = [
  { key: "perspective", label: "透视" },
  { key: "iso", label: "等距" },
  { key: "top", label: "俯视" },
];

const QUALITIES: Array<{ key: QualityMode; label: string }> = [
  { key: "auto", label: "自动" },
  { key: "eco", label: "节能 24" },
  { key: "balanced", label: "均衡 30" },
  { key: "ultra", label: "极致 60" },
];

const NODE_ACTIONS: Record<string, string> = {
  app: "system-monitor", edge: "tcp", db: "system-monitor", storage: "storage",
  "ai-worker": "ai-usage", "ai-provider": "ai-usage", auth: "users", rest: "system-monitor",
  realtime: "system-monitor", metrics: "process", "client-web": "traffic", "client-app": "traffic",
};

const EVENT_FILTERS = [
  { key: "all", label: "全部" },
  { key: "request", label: "请求" },
  { key: "security", label: "安全" },
  { key: "ai", label: "AI" },
  { key: "media", label: "媒体" },
  { key: "alert", label: "告警" },
  { key: "internal", label: "内部监控" },
] as const;

type SceneBundle = {
  globe?: NexusGlobeScene | null;
  storage?: NexusStorageScene | null;
  ai?: NexusAiScene | null;
  content?: NexusContentScene | null;
  security?: NexusSecurityScene | null;
};

function fmtBytes(bytes: number | null | undefined, digits = 1) {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 100 ? 0 : digits)} ${units[index]}`;
}
const fmtPct = (value: number | null | undefined, digits = 0) => (value == null ? "—" : `${value.toFixed(digits)}%`);
const fmtNum = (value: number | null | undefined) => (value == null ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value));
const fmtMs = (value: number | null | undefined) => (value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`);
const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("zh-CN", { hour12: false }) : "—");
const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function statusLabel(status: string) {
  switch (status) {
    case "healthy": return "运行正常";
    case "degraded": return "指标延迟 / 预警";
    case "down": return "服务异常";
    case "offline": return "离线";
    default: return "状态未知";
  }
}

export default function NexusCenter({ onExit, onNavigate, role }: { onExit: () => void; onNavigate: (section: string) => void; role: string }) {
  const [scene, setScene] = useState<NexusSceneKey>("overview");
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<QualityMode>(() => (localStorage.getItem("heika-nexus-quality") as QualityMode) || "auto");
  const [projection, setProjection] = useState<ProjectionMode>("perspective");
  const [labelMode, setLabelMode] = useState<"all" | "auto" | "none">("auto");
  const [force2D, setForce2D] = useState(false);
  const [explode, setExplode] = useState(false);
  const [sheetInset, setSheetInset] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [autoCruise, setAutoCruise] = useState(true);
  const [interruptOnAlert, setInterruptOnAlert] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [sheet, setSheet] = useState<"detail" | "events" | null>(null);
  // 移动端底部面板高度（px）。null 表示使用样式表里的默认高度；
  // 拖动把手时实时改写，松手后吸附到 45% / 72% / 92% 三档，拖到 30% 以下收起。
  const [sheetPx, setSheetPx] = useState<number | null>(null);
  const sheetDrag = useRef<{ startY: number; startHeight: number } | null>(null);
  const [bundle, setBundle] = useState<SceneBundle>({});
  const [selected, setSelected] = useState<{ type: "node" | "link"; id: string } | null>(null);
  const [sideTab, setSideTab] = useState<"detail" | "events">("events");
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [historyRange, setHistoryRange] = useState<RangeKey>("1h");
  const [history, setHistory] = useState<NexusHistoryResponse | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [eventSearch, setEventSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<(typeof EVENT_FILTERS)[number]["key"]>("all");
  const [eventPaused, setEventPaused] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [now, setNow] = useState(Date.now());
  const loadedAt = useRef<Partial<Record<NexusSceneKey, number>>>({});
  const alertSignature = useRef("");
  const sideRef = useRef<HTMLElement | null>(null);

  const stageHeight = () => sideRef.current?.parentElement?.getBoundingClientRect().height || window.innerHeight;

  const onSheetPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = sideRef.current;
    if (!element) return;
    sheetDrag.current = { startY: event.clientY, startHeight: element.getBoundingClientRect().height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onSheetPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = sheetDrag.current;
    if (!drag) return;
    const limit = stageHeight();
    const next = Math.min(limit * 0.92, Math.max(96, drag.startHeight + (drag.startY - event.clientY)));
    setSheetPx(next);
  };
  const onSheetPointerUp = () => {
    const drag = sheetDrag.current;
    sheetDrag.current = null;
    const element = sideRef.current;
    if (!drag || !element) return;
    const limit = stageHeight();
    const height = element.getBoundingClientRect().height;
    if (height < limit * 0.3) { setSheet(null); setSheetPx(null); return; }
    const snap = [0.45, 0.72, 0.92].map((ratio) => limit * ratio).reduce((near, value) => (Math.abs(value - height) < Math.abs(near - height) ? value : near));
    setSheetPx(snap);
  };

  const { snapshot, connection, error, lastAt } = useNexusStream(paused);
  const sceneMeta = SCENES.find((item) => item.key === scene) || SCENES[0];

  // 移动端底部面板会压住画布下缘：把面板实际高度交给引擎，由引擎上移取景中心。
  useEffect(() => {
    const element = sideRef.current;
    if (!element) return;
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => {
      if (!media.matches || !sheet) { setSheetInset(0); return; }
      setSheetInset(Math.max(0, Math.round(element.getBoundingClientRect().height)));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    media.addEventListener("change", sync);
    return () => { observer.disconnect(); media.removeEventListener("change", sync); };
  }, [sheet]);

  // 只有服务器场景才有分解结构，切换场景时自动收起，避免其他场景误用。
  useEffect(() => { if (scene !== "server") setExplode(false); }, [scene]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("heika-nexus-quality", quality); } catch { /* 偏好写入失败不阻塞 */ }
  }, [quality]);

  // 跟随站内主题（data-theme 由社区外壳统一维护）。
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onFullscreen = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  // 场景按需数据：只有进入相应场景才请求，重型统计 30–60 秒刷新一次。
  useEffect(() => {
    const fetchable = ["globe", "storage", "ai", "content", "security"].includes(scene);
    if (!fetchable) return;
    let alive = true;
    const load = async (force = false) => {
      const last = loadedAt.current[scene] || 0;
      if (!force && Date.now() - last < 25_000) return;
      try {
        const data = await cloudRequest(`/api/v1/admin/nexus/scenes/${scene}`) as SceneBundle[keyof SceneBundle];
        if (!alive) return;
        loadedAt.current[scene] = Date.now();
        setBundle((previous) => ({ ...previous, [scene]: data }));
      } catch (cause) {
        if (alive) setToast(cause instanceof Error ? cause.message : "场景数据读取失败");
      }
    };
    void load(true);
    const timer = setInterval(() => { void load(); }, scene === "ai" || scene === "security" || scene === "globe" ? 30_000 : 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [scene]);

  // 时空回溯：只查询真实快照；范围上限 7 天由服务端再次校验。
  useEffect(() => {
    if (scene !== "timeline") { setPlaying(false); return; }
    let alive = true;
    const range = RANGES.find((item) => item.key === historyRange) || RANGES[0];
    const to = new Date();
    const from = new Date(to.getTime() - range.ms);
    const bucket = Math.max(60, Math.round(range.ms / 1000 / 480));
    setHistory(null);
    cloudRequest(`/api/v1/admin/nexus/history?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&bucket=${bucket}`)
      .then((data) => {
        if (!alive) return;
        const next = data as NexusHistoryResponse;
        setHistory(next);
        setCursor(next.points.length ? next.points.length - 1 : null);
      })
      .catch((cause) => { if (alive) setToast(cause instanceof Error ? cause.message : "历史快照读取失败"); });
    return () => { alive = false; };
  }, [scene, historyRange]);

  useEffect(() => {
    if (!playing || !history?.points.length) return;
    const timer = setInterval(() => {
      setCursor((current) => {
        if (current == null) return null;
        if (current >= history.points.length - 1) { setPlaying(false); return current; }
        return current + 1;
      });
    }, Math.max(320, 1500 / speed));
    return () => clearInterval(timer);
  }, [playing, speed, history]);

  // 沉浸模式：自动轮播场景 + 镜头巡航；真实严重告警可中断巡航。
  useEffect(() => {
    if (!immersive || paused || !autoCruise) return;
    const timer = setInterval(() => {
      setScene((current) => {
        const index = SCENES.findIndex((item) => item.key === current);
        return SCENES[(index + 1) % SCENES.length].key;
      });
      setSelected(null);
    }, 35_000);
    return () => clearInterval(timer);
  }, [immersive, paused, autoCruise]);

  useEffect(() => {
    if (!snapshot) return;
    const signature = snapshot.alerts.map((alert) => alert.id).join("|");
    if (alertSignature.current && signature !== alertSignature.current && immersive && interruptOnAlert) {
      const severe = snapshot.alerts.find((alert) => ["critical", "error", "danger"].includes(alert.level));
      if (severe) {
        setAutoCruise(false);
        setScene("overview");
        setSelected({ type: "node", id: "app" });
        setFocusRequest({ id: "app", seq: Date.now() });
        setToast(`检测到严重告警：${severe.title}，已中断自动巡航并聚焦业务节点`);
      }
    }
    alertSignature.current = signature;
  }, [snapshot, immersive, interruptOnAlert]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail?.id) { setSelected({ type: "node", id: detail.id }); setSideTab("detail"); setSheet("detail"); }
    };
    window.addEventListener("heika:nexus-context", onContext);
    return () => window.removeEventListener("heika:nexus-context", onContext);
  }, []);

  const fetchSceneNow = useCallback(async (key: NexusSceneKey) => {
    loadedAt.current[key] = 0;
    setScene(key);
  }, []);

  const runPlayback = () => {
    if (!history?.points.length) { setToast("该时间范围没有可回放的历史快照"); return; }
    if (cursor == null || cursor >= history.points.length - 1) setCursor(0);
    setPlaying((value) => !value);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setToast("浏览器拒绝进入全屏，请使用快捷键或检查权限");
    }
  };

  const enterImmersive = async () => {
    setImmersive(true);
    setAutoCruise(true);
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch { /* 全屏被拒绝时仍保留沉浸布局 */ }
  };

  const exitImmersive = () => {
    setImmersive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };

  const onPick = (result: PickResult) => {
    if (!result) { setSelected(null); setSideTab("events"); return; }
    setSelected(result);
    setSideTab("detail");
    setSheet("detail");
  };

  const detail = useMemo(() => {
    if (!snapshot || !selected) return null;
    if (selected.type === "link") {
      const link = snapshot.links.find((item) => item.id === selected.id);
      return link ? { kind: "link" as const, link } : null;
    }
    const id = selected.id;
    const node = snapshot.nodes.find((item) => item.id === id);
    if (node) return { kind: "node" as const, node };
    if (id.startsWith("storage:")) {
      const key = id.slice(8);
      const building = bundle.storage?.buildings.find((item) => item.key === key);
      return building ? { kind: "storage" as const, building } : null;
    }
    if (id.startsWith("layer:")) return { kind: "layer" as const, layer: id };
    if (id.startsWith("rule:")) {
      const rule = bundle.security?.rules.find((item) => `rule:${item.id}` === id);
      return rule ? { kind: "rule" as const, rule } : null;
    }
    if (id.startsWith("stage:")) return { kind: "stage" as const, stage: id };
    if (id.startsWith("purpose:")) {
      const purpose = bundle.ai?.purposes.find((item) => `purpose:${item.purpose}` === id)
        || snapshot.ai.byPurpose.find((item) => `purpose:${item.purpose}` === id);
      return purpose ? { kind: "purpose" as const, purpose } : null;
    }
    if (id.startsWith("series:")) {
      const series = bundle.content?.series.find((item) => item.id === id);
      return series ? { kind: "series" as const, series } : null;
    }
    if (id.startsWith("tag:")) {
      const tag = bundle.content?.tags.find((item) => `tag:${item.id}` === id);
      return tag ? { kind: "tag" as const, tag } : null;
    }
    const post = bundle.content?.posts.find((item) => item.id === id);
    if (post) return { kind: "post" as const, post };
    return null;
  }, [selected, snapshot, bundle]);

  const events = useMemo(() => {
    // 「内部监控」是独立数据源：服务端把 Nexus 自身轮询与健康检查拆到 eventsInternal，
    // 其余分类统一取业务流，两者不混排但都不删除。
    const internal = eventFilter === "internal";
    const list = (internal ? snapshot?.eventsInternal : snapshot?.events) || [];
    const keyword = eventSearch.trim().toLowerCase();
    return list.filter((event) => {
      if (!internal && eventFilter !== "all" && event.type !== eventFilter) return false;
      if (!keyword) return true;
      return `${event.title} ${event.detail} ${event.source} ${event.target}`.toLowerCase().includes(keyword);
    }).slice(0, 60);
  }, [snapshot?.events, snapshot?.eventsInternal, eventFilter, eventSearch]);
  useEffect(() => { setEventCount(events.length); }, [events.length]);

  const sceneData = scene === "storage" ? bundle.storage : scene === "ai" ? bundle.ai : scene === "content" ? bundle.content : scene === "security" ? bundle.security : scene === "globe" ? bundle.globe : null;
  const dataKey = `${scene}:${(sceneData as { generatedAt?: string; capturedAt?: string } | null)?.generatedAt || (sceneData as { capturedAt?: string } | null)?.capturedAt || ""}:${bundle.storage?.capturedAt || ""}`;
  const historicalPoint = scene === "timeline" && history && cursor != null ? history.points[cursor] || null : null;

  if (!snapshot) {
    return (
      <section className="nx nx--loading" aria-label="HEIKA Nexus">
        <div className="nx-loading">
          <i /><h1>HEIKA Nexus</h1>
          <p>{error || (connection === "paused" ? "已暂停数据更新" : "正在建立实时监控通道…")}</p>
          <button type="button" className="nx-btn" onClick={onExit}>返回控制中心</button>
        </div>
      </section>
    );
  }

  const stale = lastAt ? Math.max(0, Math.round((now - Date.parse(lastAt)) / 1000)) : null;
  const isLive = connection === "live" && stale != null && stale <= 5;

  return (
    <section className={`nx${immersive ? " is-immersive" : ""}${sideCollapsed ? " is-side-collapsed" : ""}`} aria-label="HEIKA Nexus 全域数字孪生控制中心">
      <header className="nx-head">
        <div className="nx-brand">
          <span className="nx-brand__mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="nx-brand__name">HEIKA <b>NEXUS</b></span>
          <span className="nx-brand__sub">全域数字孪生控制中心</span>
        </div>
        <div className="nx-kpis">
          <span><b>CPU</b>{fmtPct(snapshot.server.cpuPercent)}</span>
          <span><b>MEM</b>{fmtPct(snapshot.server.memPercent)}</span>
          <span><b>DISK</b>{fmtPct(snapshot.server.diskPercent)}</span>
          <span><b>REQ</b>{snapshot.traffic.rps == null ? "—" : `${snapshot.traffic.rps}/s`}</span>
          <span><b>TCP</b>{fmtNum(snapshot.server.tcpTotal)}</span>
          <span><b>AI 队列</b>{fmtNum(snapshot.ai.queue)}</span>
        </div>
        <div className="nx-head__actions">
          <span className={`nx-conn nx-conn--${isLive ? "live" : connection}`}>
            <i />{paused ? "已暂停" : isLive ? "实时" : connection === "live" ? `延迟 ${stale ?? 0}s` : connection === "reconnecting" ? "重连中" : connection === "error" ? "离线" : "连接中"}
          </span>
          <button type="button" className="nx-icon" onClick={() => { setPaused((value) => !value); setPlaying(false); }} aria-label={paused ? "恢复实时" : "暂停画面与事件更新"} title={paused ? "恢复实时" : "暂停"}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <div className="nx-pop-wrap">
            <button type="button" className="nx-icon" onClick={() => setSettingsOpen((value) => !value)} aria-label="可视化设置" aria-expanded={settingsOpen}><Settings2 size={16} /></button>
            {settingsOpen ? (
              <div className="nx-pop" role="dialog" aria-label="可视化设置">
                <div className="nx-pop__head">可视化设置<button type="button" className="nx-icon" onClick={() => setSettingsOpen(false)} aria-label="关闭"><X size={14} /></button></div>
                <label>画质<select value={quality} onChange={(event) => setQuality(event.target.value as QualityMode)}>{QUALITIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
                <label>标签<select value={labelMode} onChange={(event) => setLabelMode(event.target.value as "all" | "auto" | "none")}><option value="auto">自动避让</option><option value="all">全部显示</option><option value="none">隐藏</option></select></label>
                <label className="nx-pop__check"><input type="checkbox" checked={autoCruise} onChange={(event) => setAutoCruise(event.target.checked)} />沉浸模式自动巡航</label>
                <label className="nx-pop__check"><input type="checkbox" checked={interruptOnAlert} onChange={(event) => setInterruptOnAlert(event.target.checked)} />严重告警中断巡航</label>
                <label className="nx-pop__check"><input type="checkbox" checked={force2D} onChange={(event) => setForce2D(event.target.checked)} />强制二维降级</label>
                <button type="button" className="nx-pop__wide" onClick={() => { setProjection("perspective"); setQuality("auto"); setLabelMode("auto"); }}><RotateCcw size={13} />恢复默认视图</button>
              </div>
            ) : null}
          </div>
          {immersive ? (
            <button type="button" className="nx-icon" onClick={exitImmersive} aria-label="退出沉浸模式"><Minimize2 size={16} /></button>
          ) : (
            <>
              <button type="button" className="nx-icon" onClick={enterImmersive} aria-label="进入沉浸大屏"><Maximize2 size={16} /></button>
              <button type="button" className="nx-exit" onClick={onExit}>返回控制中心</button>
            </>
          )}
        </div>
      </header>

      <div className="nx-body">
        <aside className="nx-rail" aria-label="八大场景">
          <div className="nx-rail__label">场景</div>
          {SCENES.map((item, index) => {
            const Icon = item.icon;
            return (
              <button key={item.key} type="button" className={`nx-rail__item${scene === item.key ? " is-active" : ""}`} onClick={() => { setScene(item.key); setSelected(null); setSheet(null); }}>
                <Icon size={17} aria-hidden="true" />
                <span><b>{item.label}</b><small>{item.hint}</small></span>
                <em>{String(index + 1).padStart(2, "0")}</em>
              </button>
            );
          })}
          <div className="nx-rail__foot">
            <span className={snapshot.sources.agent ? "is-ok" : "is-warn"}><i />1s 宿主与边缘</span>
            <span className={snapshot.sources.db ? "is-ok" : "is-warn"}><i />数据库统计</span>
            <span className={snapshot.sources.ai ? "is-ok" : "is-warn"}><i />AI 用量</span>
            <span className={snapshot.sources.geo ? "is-ok" : "is-warn"}><i />IP 地理</span>
          </div>
        </aside>

        <main className="nx-stage">
          {force2D ? <NexusFallback2D snapshot={snapshot} onPick={onPick} /> : (
            <NexusCanvas
              snapshot={snapshot} scene={scene} sceneData={(sceneData as Record<string, unknown> | null) || null} dataKey={dataKey}
              theme={theme} quality={quality} projection={projection} labels={labelMode} paused={paused}
              historicalPoint={historicalPoint} markers={history?.markers || []} autoRotate={immersive && autoCruise && !paused}
              focusRequest={focusRequest} onPick={onPick} onNeedFallback={() => setForce2D(true)}
              explode={explode} bottomInset={sheetInset}
            />
          )}

          <div className="nx-float" role="status" aria-label="实时关键指标">
            <span><b>CPU</b>{fmtPct(snapshot.server.cpuPercent)}</span>
            <span><b>MEM</b>{fmtPct(snapshot.server.memPercent)}</span>
            <span><b>REQ</b>{snapshot.traffic.rps == null ? "—" : `${snapshot.traffic.rps}/s`}</span>
            <span><b>AI</b>{fmtNum(snapshot.ai.queue)}</span>
            {paused ? <span className="is-paused">已暂停</span> : null}
          </div>

          <div className="nx-stage__head">
            <div>
              <span className="nx-stage__index">{String(SCENES.findIndex((item) => item.key === scene) + 1).padStart(2, "0")}</span>
              <h1>{sceneMeta.label}</h1>
              <p>{sceneMeta.hint}</p>
            </div>
            <div className="nx-stage__badges">
              {snapshot.sources.agent ? <span className="nx-badge is-ok"><Radio size={12} />1s 实时</span> : <span className="nx-badge is-warn"><WifiOff size={12} />实时通道未接入</span>}
              {snapshot.sources.metricsCapturedAt ? <span className="nx-badge">落库 {fmtTime(snapshot.sources.metricsCapturedAt)}</span> : null}
              {snapshot.sources.geo ? null : <span className="nx-badge is-muted">IP 地理未接入</span>}
            </div>
          </div>

          {!snapshot.sources.agent ? (
            <div className="nx-notice is-warn" role="status"><AlertTriangle size={14} />1 秒实时接口不可达，当前展示数据库 15 秒快照{snapshot.sources.agentError ? `（${snapshot.sources.agentError}）` : ""}；不补造秒级数据。</div>
          ) : null}
          {scene === "globe" && bundle.globe && !bundle.globe.geoAvailable ? (
            <div className="nx-notice" role="status"><Globe2 size={14} />{bundle.globe.note}</div>
          ) : null}
          {scene === "timeline" && history && !history.points.length ? (
            <div className="nx-notice is-warn" role="status"><History size={14} />{history.note || "该时间范围没有历史快照。"}</div>
          ) : null}
          {scene === "storage" && bundle.storage && !bundle.storage.buildings.length ? (
            <div className="nx-notice is-warn" role="status"><Box size={14} />存储统计暂不可用，未生成任何估算建筑。</div>
          ) : null}
          {scene === "content" && bundle.content && !bundle.content.posts.length ? (
            <div className="nx-notice is-warn" role="status"><Network size={14} />暂无可展示的已发布作品。</div>
          ) : null}

          <div className="nx-stage__foot">
            <div className="nx-legend">
              <span><i className="is-http" />HTTP</span>
              <span><i className="is-data" />数据</span>
              <span><i className="is-media" />媒体</span>
              <span><i className="is-ai" />AI</span>
              <span><i className="is-ok" />正常</span>
              <span><i className="is-warn" />预警</span>
              <span><i className="is-down" />故障</span>
            </div>
            <div className="nx-viewops">
              <SlidersHorizontal size={13} />
              {PROJECTIONS.map((item) => (
                <button key={item.key} type="button" className={projection === item.key ? "is-active" : ""} onClick={() => setProjection(item.key)}>{item.label}</button>
              ))}
              <button type="button" className={force2D ? "is-active" : ""} onClick={() => setForce2D((value) => !value)}>2D</button>
              {scene === "server" ? (
                <button type="button" className={explode ? "is-active" : ""} onClick={() => setExplode((value) => !value)} title="按结构顺序展开外壳与内部层">{explode ? "合拢" : "分解"}</button>
              ) : null}
              <button type="button" onClick={() => setFocusRequest({ id: selected?.id || "app", seq: Date.now() })} aria-label="聚焦选中节点"><Crosshair size={13} /></button>
            </div>
          </div>
        </main>

        <aside
          className={`nx-side${sheet ? " is-open" : ""}`}
          ref={sideRef}
          style={sheetPx ? { height: `${Math.round(sheetPx)}px`, maxHeight: "none" } : undefined}
          aria-label="节点详情与实时事件"
        >
          <div
            className="nx-side__handle"
            role="separator"
            aria-label="拖动调整面板高度"
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerUp}
            onPointerCancel={onSheetPointerUp}
            onClick={() => { if (!sheetDrag.current && sheetPx == null) setSheet(null); }}
          ><i /></div>
          <div className="nx-side__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={sideTab === "detail"} className={sideTab === "detail" ? "is-active" : ""} onClick={() => setSideTab("detail")}>节点详情</button>
            <button type="button" role="tab" aria-selected={sideTab === "events"} className={sideTab === "events" ? "is-active" : ""} onClick={() => setSideTab("events")}>实时事件 <em>{eventCount}</em></button>
            <button type="button" className="nx-side__collapse" onClick={() => setSideCollapsed((value) => !value)} aria-label="折叠详情面板">{sideCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}</button>
          </div>

          {sideTab === "detail" ? (
            <div className="nx-side__body">
              {!detail ? <div className="nx-empty"><Crosshair size={26} /><p>点击三维节点或链路查看详情</p><small>双击节点可自动聚焦；长按节点打开管理入口。</small></div> : (
                <>
                  {detail.kind === "node" ? <NodeDetail node={detail.node} onNavigate={onNavigate} onFocus={(id) => setFocusRequest({ id, seq: Date.now() })} /> : null}
                  {detail.kind === "link" ? <LinkDetail link={detail.link} onFocus={(id) => setFocusRequest({ id, seq: Date.now() })} /> : null}
                  {detail.kind === "storage" ? <StorageDetail building={detail.building} files={bundle.storage?.topFiles || []} onNavigate={onNavigate} /> : null}
                  {detail.kind === "layer" ? <LayerDetail layer={detail.layer} snapshot={snapshot} onNavigate={onNavigate} /> : null}
                  {detail.kind === "rule" ? <RuleDetail rule={detail.rule} onNavigate={onNavigate} /> : null}
                  {detail.kind === "stage" ? <StageDetail stage={detail.stage} data={bundle.ai} onNavigate={onNavigate} /> : null}
                  {detail.kind === "purpose" ? <PurposeDetail purpose={detail.purpose} /> : null}
                  {detail.kind === "post" ? <PostDetail post={detail.post} /> : null}
                  {detail.kind === "series" ? <SeriesDetail series={detail.series} /> : null}
                  {detail.kind === "tag" ? <TagDetail tag={detail.tag} /> : null}
                </>
              )}
            </div>
          ) : (
            <div className="nx-side__body nx-events">
              <div className="nx-events__tools">
                <div className="nx-search"><Search size={13} /><input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="搜索事件 / 路径 / 模块" aria-label="搜索事件" /></div>
                <button type="button" className={`nx-mini${eventPaused ? " is-active" : ""}`} onClick={() => setEventPaused((value) => !value)} title={eventPaused ? "继续自动滚动" : "暂停自动滚动"}>{eventPaused ? <Play size={12} /> : <Pause size={12} />}</button>
              </div>
              <div className="nx-filters">
                {EVENT_FILTERS.map((item) => <button key={item.key} type="button" className={eventFilter === item.key ? "is-active" : ""} onClick={() => setEventFilter(item.key)}>{item.label}</button>)}
              </div>
              <div className={`nx-eventlist${eventPaused ? " is-paused" : ""}`}>
                {events.length ? events.map((event) => (
                  <button key={event.id} type="button" className={`nx-event nx-event--${event.result}`} onClick={() => {
                    if (event.nodeId) { setSelected({ type: "node", id: event.nodeId }); setSideTab("detail"); setFocusRequest({ id: event.nodeId, seq: Date.now() }); }
                  }}>
                    <time>{fmtTime(event.at)}</time>
                    <span className="nx-event__dot" />
                    <span className="nx-event__body"><b>{event.title}</b><small>{event.source} → {event.target}{event.durationMs != null ? ` · ${fmtMs(event.durationMs)}` : ""}</small></span>
                    <em>{event.type}</em>
                  </button>
                )) : <div className="nx-empty"><Activity size={24} /><p>暂无符合条件的事件</p><small>事件来自真实入口请求、AI 审核、告警与媒体任务，不做模拟。</small></div>}
              </div>
              <p className="nx-events__note">
                {snapshot.trafficSplit ? (
                  <>同一统计口径（近 {snapshot.trafficSplit.windowSeconds}s）：外部访问 {fmtNum(snapshot.trafficSplit.externalRps)}/s · 后台管理 {fmtNum(snapshot.trafficSplit.adminRps)}/s · 内部监控 {fmtNum(snapshot.trafficSplit.internalRps)}/s · 总负载 {fmtNum(snapshot.trafficSplit.totalRps)}/s。<br /></>
                ) : null}
                业务事件流默认不含 Nexus 自身轮询与健康检查，可在「内部监控」分类中查看；服务端缓冲 320 条，前端只渲染最近 60 条。
              </p>
            </div>
          )}
        </aside>
      </div>

      <footer className="nx-timeline">
        <div className="nx-timeline__live">
          <span className={`nx-dot${isLive ? " is-live" : ""}`} />
          <div><b>{paused ? "已暂停" : isLive ? "实时数据" : "连接中断"}</b><small>最后更新 {fmtTime(lastAt)} · {role === "admin" ? "管理员" : "内容管理员"}</small></div>
        </div>
        {scene === "timeline" ? (
          <>
            <div className="nx-timeline__ranges">
              {RANGES.map((item) => <button key={item.key} type="button" className={historyRange === item.key ? "is-active" : ""} onClick={() => setHistoryRange(item.key)}>{item.label}</button>)}
            </div>
            <button type="button" className="nx-mini" onClick={runPlayback} disabled={!history?.points.length} aria-label={playing ? "暂停回放" : "开始回放"}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
            <input
              className="nx-scrub" type="range" min={0} max={Math.max(0, (history?.points.length || 1) - 1)} value={cursor ?? 0}
              onChange={(event) => { setCursor(Number(event.target.value)); setPlaying(false); }}
              disabled={!history?.points.length} aria-label="历史时间轴"
            />
            <div className="nx-timeline__stamp">
              <b>{historicalPoint ? fmtDateTime(historicalPoint.bucketAt) : "—"}</b>
              <small>{history?.coverage.samples ? `${history.coverage.samples} 个真实采样 · ${history.points.length} 个聚合点` : "无快照"}</small>
            </div>
            <select className="nx-speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="回放倍速">
              {[0.5, 1, 2, 4].map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
            <button type="button" className="nx-btn nx-btn--ghost" onClick={() => { setPlaying(false); setCursor(history?.points.length ? history.points.length - 1 : null); setScene("overview"); }}>返回实时</button>
          </>
        ) : (
          <>
            <div className="nx-timeline__spark" aria-hidden="true">
              {(snapshot.traffic.appSeries || []).slice(-60).map((point, index) => (
                <i key={`${point.t}-${index}`} style={{ height: `${Math.min(100, 8 + point.requests * 4)}%` }} />
              ))}
            </div>
            <div className="nx-timeline__stamp"><b>{fmtDateTime(snapshot.ts)}</b><small>{snapshot.traffic.available ? `${fmtNum(snapshot.traffic.requests)} 次请求 / ${snapshot.traffic.windowSeconds}s 窗口` : "流量指标未接入"}</small></div>
            <button type="button" className="nx-btn nx-btn--ghost" onClick={() => { setScene("timeline"); setSideTab("events"); }}><History size={14} />进入时空回溯</button>
          </>
        )}
      </footer>

      {toast ? <div className="nx-toast" role="status">{toast}</div> : null}

      <div className="nx-mobilebar">
        <button type="button" className={sheet === "detail" ? "is-active" : ""} onClick={() => { setSheet("detail"); setSideTab("detail"); }}><Crosshair size={15} />详情</button>
        <button type="button" className={sheet === "events" ? "is-active" : ""} onClick={() => { setSheet("events"); setSideTab("events"); }}><Activity size={15} />事件</button>
        <button type="button" onClick={() => setScene("timeline")}><History size={15} />回溯</button>
        <button type="button" onClick={enterImmersive}><Maximize2 size={15} />大屏</button>
      </div>

      {immersive ? (
        <div className="nx-immersivebar">
          <button type="button" onClick={exitImmersive}><Minimize2 size={14} />退出大屏</button>
          <span>{sceneMeta.label} · {autoCruise ? "自动巡航中" : "巡航已暂停"}</span>
          <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "恢复" : "暂停"}</button>
        </div>
      ) : null}
    </section>
  );
}

// ---------- 详情子组件 ----------

function MetricGrid({ metrics }: { metrics: NexusNode["metrics"] }) {
  return <div className="nx-metricgrid">{metrics.map((metric) => (
    <div key={metric.label}><small>{metric.label}</small><b>{metric.value == null ? "未接入" : `${fmtNum(metric.value)}${metric.unit}`}</b></div>
  ))}</div>;
}

function NodeDetail({ node, onNavigate, onFocus }: { node: NexusNode; onNavigate: (section: string) => void; onFocus: (id: string) => void }) {
  const action = NODE_ACTIONS[node.id];
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className={`nx-status nx-status--${node.status}`}>{statusLabel(node.status)}</span><h2>{node.label}</h2><p>{node.subtitle}</p></div>
      <MetricGrid metrics={node.metrics} />
      <dl className="nx-kv">
        <div><dt>数据来源</dt><dd>{node.measured ? "真实采集" : "未接入链路级指标"}</dd></div>
        <div><dt>数据延迟</dt><dd>{node.staleSeconds == null ? "—" : `${node.staleSeconds}s`}</dd></div>
        <div><dt>节点标识</dt><dd><code>{node.id}</code></dd></div>
      </dl>
      <div className="nx-detail__actions">
        <button type="button" onClick={() => onFocus(node.id)}><Crosshair size={13} />聚焦</button>
        {action ? <button type="button" onClick={() => onNavigate(action)}><ExternalLink size={13} />打开管理页</button> : null}
      </div>
      <p className="nx-detail__note">三维状态由真实探活、进程表与请求指标驱动；未知状态不会显示为正常。</p>
    </div>
  );
}

function LinkDetail({ link, onFocus }: { link: NexusLink; onFocus: (id: string) => void }) {
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className={`nx-status ${link.measured ? "nx-status--healthy" : "nx-status--unknown"}`}>{link.measured ? "链路指标已接入" : "仅有结构关系"}</span><h2>{link.label}</h2><p>{link.from} → {link.to}</p></div>
      <MetricGrid metrics={[
        { label: "请求/事务", value: link.rate, unit: "/s" },
        { label: "传输", value: link.bytesPerSecond, unit: "B/s" },
        { label: "延迟", value: link.latencyMs, unit: "ms" },
        { label: "错误率", value: link.errorRate, unit: "%" },
      ]} />
      <dl className="nx-kv">
        <div><dt>方向</dt><dd>{link.direction === "two-way" ? "双向" : "单向"}</dd></div>
        <div><dt>链路类型</dt><dd>{link.kind}</dd></div>
        <div><dt>粒子驱动</dt><dd>{link.measured ? "真实请求频率" : "不生成粒子"}</dd></div>
      </dl>
      {link.note ? <p className="nx-detail__note">{link.note}</p> : null}
      <div className="nx-detail__actions"><button type="button" onClick={() => onFocus(link.from)}><Crosshair size={13} />聚焦来源节点</button></div>
    </div>
  );
}

function StorageDetail({ building, files, onNavigate }: { building: NexusStorageScene["buildings"][number]; files: NexusStorageScene["topFiles"]; onNavigate: (section: string) => void }) {
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--healthy">真实对象存储</span><h2>{building.label}</h2><p>{building.bucket || building.kind}</p></div>
      <MetricGrid metrics={[
        { label: "占用", value: building.bytes, unit: "B" },
        { label: "对象数", value: building.objects, unit: "个" },
      ]} />
      <p className="nx-detail__note">建筑高度按 log10(字节数) 统一映射，不是随机尺寸。</p>
      <h3 className="nx-subhead">该分类下的大文件</h3>
      <ul className="nx-filelist">
        {files.filter((file) => !building.bucket || file.bucket === building.bucket).slice(0, 6).map((file) => (
          <li key={`${file.bucket}/${file.name}`}><b title={file.name}>{file.name.split("/").pop()}</b><small>{fmtBytes(file.bytes)} · {file.bucket}</small></li>
        ))}
        {!files.length ? <li><small>暂无文件明细</small></li> : null}
      </ul>
      <div className="nx-detail__actions"><button type="button" onClick={() => onNavigate("storage")}><ExternalLink size={13} />打开资源管理</button></div>
    </div>
  );
}

function LayerDetail({ layer, snapshot, onNavigate }: { layer: string; snapshot: NexusSnapshot; onNavigate: (section: string) => void }) {
  const title = layer === "layer:cpu" ? "CPU 计算层" : layer === "layer:mem" ? "内存层" : layer === "layer:disk" ? "磁盘层" : layer === "layer:net" ? "网络层" : "进程层";
  const metrics = layer === "layer:cpu"
    ? [{ label: "使用率", value: snapshot.server.cpuPercent, unit: "%" }, { label: "1 分钟负载", value: snapshot.server.load1, unit: "" }]
    : layer === "layer:mem"
      ? [{ label: "使用率", value: snapshot.server.memPercent, unit: "%" }, { label: "已用", value: snapshot.server.memUsed, unit: "B" }, { label: "可用", value: snapshot.server.memAvailable, unit: "B" }]
      : layer === "layer:disk"
        ? [{ label: "使用率", value: snapshot.server.diskPercent, unit: "%" }, { label: "已用", value: snapshot.server.diskUsed, unit: "B" }, { label: "总量", value: snapshot.server.diskTotal, unit: "B" }]
        : layer === "layer:net"
          ? [{ label: "入站", value: snapshot.server.netRxRate, unit: "B/s" }, { label: "出站", value: snapshot.server.netTxRate, unit: "B/s" }, { label: "TCP", value: snapshot.server.tcpTotal, unit: "连接" }]
          : [{ label: "进程组", value: snapshot.processes.length, unit: "组" }];
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--healthy">服务器逻辑分层</span><h2>{title}</h2><p>数字孪生 · 非物理硬件结构</p></div>
      <MetricGrid metrics={metrics} />
      {layer === "layer:process" ? (
        <ul className="nx-proclist">
          {snapshot.processes.slice(0, 10).map((process) => (
            <li key={process.service_key}><span>{process.label}</span><b>{fmtPct(process.cpu_percent, 1)}</b><small>{fmtBytes(process.mem_bytes)}</small></li>
          ))}
        </ul>
      ) : null}
      <div className="nx-detail__actions"><button type="button" onClick={() => onNavigate(layer === "layer:process" ? "process" : "system-monitor")}><ExternalLink size={13} />打开监控</button></div>
    </div>
  );
}

function RuleDetail({ rule, onNavigate }: { rule: NexusSecurityScene["rules"][number]; onNavigate: (section: string) => void }) {
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--degraded">{rule.active ? "规则生效中" : "已停用"}</span><h2>{rule.value}</h2><p>{rule.type}</p></div>
      <dl className="nx-kv">
        <div><dt>原因</dt><dd>{rule.reason || "—"}</dd></div>
        <div><dt>创建</dt><dd>{fmtDateTime(rule.createdAt)}</dd></div>
        <div><dt>到期</dt><dd>{rule.expiresAt ? fmtDateTime(rule.expiresAt) : "永久"}</dd></div>
      </dl>
      <div className="nx-detail__actions"><button type="button" onClick={() => onNavigate("ip-rules")}><ExternalLink size={13} />打开访问控制</button></div>
      <p className="nx-detail__note">封禁、解封与规则变更必须回到管理页完成，经过服务端权限校验、二次确认与审计日志。</p>
    </div>
  );
}

function StageDetail({ stage, data, onNavigate }: { stage: string; data: NexusAiScene | null | undefined; onNavigate: (section: string) => void }) {
  const label = stage === "stage:submit" ? "提交修改" : stage === "stage:review" ? "AI 检测" : stage === "stage:approved" ? "自动通过" : "自动驳回";
  const count = stage === "stage:approved" ? data?.revision.approved ?? null : stage === "stage:rejected" ? data?.revision.rejected ?? null : stage === "stage:review" ? (data?.revision.queued ?? 0) + (data?.revision.running ?? 0) : null;
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--healthy">AI 自动审核链路</span><h2>{label}</h2><p>已发布作品的版本更新不再进入人工队列</p></div>
      <MetricGrid metrics={[{ label: "24 小时数量", value: count, unit: "条" }]} />
      <div className="nx-detail__actions"><button type="button" onClick={() => onNavigate("ai-review")}><ExternalLink size={13} />打开 AI 审核记录</button></div>
      <p className="nx-detail__note">通过即自动发布；仅重大违规自动驳回。异常任务进入重试，不会被当作违规，也不会绕过审核直接发布。</p>
    </div>
  );
}

function PurposeDetail({ purpose }: { purpose: NexusAiScene["purposes"][number] }) {
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--healthy">近 1 小时真实调用</span><h2>{purpose.purpose}</h2><p>AI 能力节点</p></div>
      <MetricGrid metrics={[
        { label: "调用", value: purpose.calls, unit: "次" }, { label: "Token", value: purpose.tokens, unit: "" },
        { label: "平均耗时", value: purpose.avgMs, unit: "ms" }, { label: "失败", value: purpose.errors, unit: "次" },
      ]} />
    </div>
  );
}

function PostDetail({ post }: { post: NexusContentScene["posts"][number] }) {
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--healthy">{post.channel === "ai" ? "AI 资源" : "社区作品"}</span><h2>{post.title}</h2><p>{fmtDateTime(post.createdAt)}</p></div>
      <MetricGrid metrics={[
        { label: "阅读", value: post.views, unit: "" }, { label: "点赞", value: post.likes, unit: "" }, { label: "收藏", value: post.bookmarks, unit: "" },
      ]} />
      <div className="nx-detail__actions"><a href={`/p/${post.id}`} target="_blank" rel="noreferrer"><ExternalLink size={13} />打开作品</a></div>
      <p className="nx-detail__note">节点大小按真实阅读量映射；不包含任何用户身份信息。</p>
    </div>
  );
}

function SeriesDetail({ series }: { series: NexusContentScene["series"][number] }) {
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--healthy">合集聚合节点</span><h2>{series.title}</h2><p>{series.posts} 篇关联作品</p></div>
      <div className="nx-detail__actions"><a href={`/series/${series.id.replace("series:", "")}`} target="_blank" rel="noreferrer"><ExternalLink size={13} />打开合集</a></div>
    </div>
  );
}

function TagDetail({ tag }: { tag: NexusContentScene["tags"][number] }) {
  return (
    <div className="nx-detail">
      <div className="nx-detail__head"><span className="nx-status nx-status--healthy">内容标签</span><h2>{tag.name}</h2><p>{tag.posts} 篇作品</p></div>
    </div>
  );
}
