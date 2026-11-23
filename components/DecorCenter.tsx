"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Check, ChevronRight, Compass, Download, Eye, Heart, Home, Image as ImageIcon, Layers,
  MessageSquare, Palette, RotateCcw, Search, Send, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X,
} from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { blobToFile, renderBackdrop, renderIcon } from "@/lib/decor/image";
import { uploadDecorAsset } from "@/lib/decor/upload";
import { OFFICIAL_PRESETS } from "@/lib/decor/official";
import { loadDecor, saveDecor, useDecor, isDecorAppEmbed, installDecorAppliedHook } from "@/lib/decor/store";
import {
  DECOR_ICON_SLOTS, SLOT_LABELS, DEFAULT_BOTTOM_BAR, DEFAULT_CARD, normalizeBottomBar, normalizeCard,
  paletteFor, safeColor, withAlpha, type BottomBarConfig, type CardConfig, type DecorConfig, type DecorIconSlot, type DecorTheme,
} from "@/lib/decor/types";

/**
 * 三个主入口：发现装扮 / 我的装扮 / 创作工坊。
 *
 * 原来的官方精选、玩家工坊、我的装扮、我的投稿、工作室是五个平级 Tab，
 * 手机上要横向滚动才能看全，且「收藏」和「投稿」被拆到不同地方。
 * 现在二级内容用分段控件承载，功能一个不少，层级从三层压到两层。
 */
type Tab = "discover" | "mine" | "studio";
type DiscoverSection = "official" | "community";
type MineSection = "active" | "favorite" | "submissions";
type LegacyTab = "official" | "community" | "submissions";
type KindFilter = "all" | "bottom" | "card";

const TABS: { id: Tab; label: string }[] = [
  { id: "discover", label: "发现装扮" },
  { id: "mine", label: "我的装扮" },
  { id: "studio", label: "创作工坊" },
];

const DISCOVER_SECTIONS: { id: DiscoverSection; label: string }[] = [
  { id: "official", label: "官方精选" },
  { id: "community", label: "玩家工坊" },
];

const MINE_SECTIONS: { id: MineSection; label: string }[] = [
  { id: "active", label: "正在使用" },
  { id: "favorite", label: "我的收藏" },
  { id: "submissions", label: "我的投稿" },
];

const STATUS_LABEL: Record<string, string> = { pending: "审核中", approved: "已上架", rejected: "需修改", delisted: "已下架" };

/** 没有上传自定义图标时，预览用底栏真实的内置图标占位，避免出现一排空方块。 */
const SLOT_GLYPH = { home: Home, discover: Compass, messages: MessageSquare, mine: UserRound } as const;

function useMode(): "dark" | "light" {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () => setMode(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

function BarPreview({ config, mode, active = "home", compact = false, onActiveChange }: { config: BottomBarConfig; mode: "dark" | "light"; active?: DecorIconSlot; compact?: boolean; onActiveChange?: (slot: DecorIconSlot) => void }) {
  const palette = paletteFor(config, config.mode === "split" ? mode : "dark");
  return (
    <div
      className="decor-preview-bar"
      style={{
        background: withAlpha(palette.bg, Math.max(0.28, palette.bgOpacity)),
        borderColor: withAlpha(palette.border, palette.borderOpacity),
        ["--decor-bar-label" as string]: palette.label,
        ["--decor-bar-active-label" as string]: palette.activeLabel,
        ["--decor-bar-icon" as string]: palette.icon,
        ["--decor-bar-active-icon" as string]: palette.activeIcon,
        ["--decor-bar-pill" as string]: withAlpha(palette.activePill, palette.activePillOpacity),
        padding: compact ? "5px" : undefined,
      }}
    >
      {DECOR_ICON_SLOTS.map((slot) => {
        const icon = config.icons[slot];
        const src = slot === active ? icon?.active || icon?.normal : icon?.normal;
        const content = (
          <>
            {src ? (
              icon?.tint ? (
                <span
                  className="decor-nav-icon is-mask"
                  style={{
                    width: 22 * (icon.scale || 1), height: 22 * (icon.scale || 1),
                    WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")`,
                    backgroundColor: slot === active ? palette.activeIcon : palette.icon,
                  }}
                />
              ) : (
                <img src={src} alt="" className={`decor-nav-icon${icon?.fit === "cover" ? " is-cover" : ""}`} style={{ width: 22 * (icon?.scale || 1), height: 22 * (icon?.scale || 1) }} />
              )
            ) : (
              (() => {
                const Glyph = SLOT_GLYPH[slot];
                return <Glyph size={21} strokeWidth={1.7} />;
              })()
            )}
            {config.showLabel !== false && <span className="bottom-nav-label">{SLOT_LABELS[slot]}</span>}
          </>
        );
        // 只有真正可点时才用 button：卡片缩略图外层已经是 button，
        // 里面再嵌 button 会触发水合错误，也会让读屏把装饰当成两个控件。
        return onActiveChange ? (
          <button type="button" key={slot} className={slot === active ? "active" : ""} onClick={() => onActiveChange(slot)} aria-pressed={slot === active}>{content}</button>
        ) : (
          <span key={slot} className={slot === active ? "active" : ""} aria-hidden="true">{content}</span>
        );
      })}
    </div>
  );
}

function CardPreview({ config, mode, state = "back" }: { config: CardConfig; mode: "dark" | "light"; state?: "back" | "content" }) {
  const palette = paletteFor(config, config.mode === "split" ? mode : "dark");
  if (state === "content") {
    return (
      <div
        className="decor-preview-card is-content"
        style={{
          background: palette.contentImage ? `center / cover no-repeat url("${palette.contentImage}")` : palette.contentBg,
          borderColor: palette.contentBorder,
        }}
      >
        <div className="decor-preview-content" style={{ background: withAlpha(palette.contentBg, 0.94), borderTopColor: palette.contentBorder }}>
          <span className="decor-chip" style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.bodyColor }}>AI 知识</span>
          <strong style={{ color: palette.titleColor }}>把复杂的事讲清楚</strong>
          <p style={{ color: palette.bodyColor }}>这是一段示例摘要，用来确认翻开后的标题、正文与按钮在主题下的可读性。</p>
          <em style={{ background: palette.actionBg, color: palette.actionText }}>查看更多</em>
        </div>
      </div>
    );
  }
  return (
    <div
      className="decor-preview-card"
      style={{
        backgroundColor: palette.backBg,
        backgroundImage: palette.backImage ? `url("${palette.backImage}")` : undefined,
        borderColor: palette.backBorder,
        color: palette.numberColor,
      }}
    >
      {palette.texture === "linen" && <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `repeating-linear-gradient(42deg, ${withAlpha(palette.backBorder, .26)} 0 1px, transparent 1px 5px)` }} />}
      {palette.texture === "dots" && <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${withAlpha(palette.backBorder, .34)} 1.1px, transparent 1.3px)`, backgroundSize: "13px 13px" }} />}
      {palette.texture === "grid" && <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${withAlpha(palette.backBorder, .3)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(palette.backBorder, .3)} 1px, transparent 1px)`, backgroundSize: "22px 22px" }} />}
      {palette.texture === "paper" && <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${withAlpha(palette.backBorder, .3)} .7px, transparent .9px), radial-gradient(${withAlpha(palette.backBorder, .22)} .6px, transparent .8px)`, backgroundSize: "6px 6px, 9px 7px" }} />}
      {palette.texture === "noise" && <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${withAlpha(palette.backBorder, .32)} .8px, transparent .9px)`, backgroundSize: "5px 5px" }} />}
      {palette.texture === "rings" && <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `repeating-radial-gradient(circle at 50% 46%, ${withAlpha(palette.backBorder, .24)} 0 1px, transparent 1px 22px)` }} />}
      {palette.texture === "diamonds" && <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `repeating-linear-gradient(45deg, ${withAlpha(palette.backBorder, .24)} 0 1px, transparent 1px 16px), repeating-linear-gradient(-45deg, ${withAlpha(palette.backBorder, .24)} 0 1px, transparent 1px 16px)` }} />}
      {palette.pattern === "monogram" && <span aria-hidden="true" style={{ position: "absolute", fontFamily: "Georgia, serif", fontSize: 56, color: withAlpha(palette.backBorder, .55) }}>H</span>}
      {palette.pattern === "diamond" && <span aria-hidden="true" style={{ position: "absolute", width: "34%", aspectRatio: "1", border: `1px solid ${withAlpha(palette.backBorder, .8)}`, transform: "rotate(45deg)" }} />}
      {palette.pattern === "frame" && <span aria-hidden="true" style={{ position: "absolute", inset: 9, border: `1px solid ${withAlpha(palette.backBorder, .6)}` }} />}
      <span className="decor-preview-number">01</span>
      <span style={{ position: "relative", fontSize: 10, letterSpacing: ".2em", color: palette.hintColor }}>HEIKA</span>
      <span className="decor-preview-brand">黑卡</span>
      <span className="decor-preview-prompt">轻触翻开</span>
      <span style={{ position: "absolute", bottom: 33, left: "50%", transform: "translateX(-50%)", padding: "5px 12px", borderRadius: 8, background: palette.actionBg, color: palette.actionText, fontSize: 10 }}>确认翻开</span>
    </div>
  );
}

/** 常用色板：中性灰阶 + 品牌金 + 少量自然/冷色，覆盖现有官方预设的取色范围。 */
const COLOR_SWATCHES = [
  "#171A1E", "#1C2227", "#242830", "#2C3238", "#3A4148", "#4B535B",
  "#5A6068", "#6E767E", "#8A8F95", "#A7ADB4", "#C4CBD1", "#E3E6E8",
  "#EDEBE4", "#F4F4F1", "#FBFAF7", "#FFFFFF",
  "#D8C28D", "#C9A961", "#B8954A", "#8A6E28", "#6B5416", "#3B2F14",
  "#7C8F79", "#4F6B57", "#2F4638", "#7A8CA8", "#3F5566", "#243240",
  "#B7654F", "#8C4A3C", "#5A2E26",
  "#0B0D0F", "#12151A", "#1F242B", "#333A42", "#6B7480", "#D9D4C7",
];

function sameColor(a: string, b: string) {
  return a.replace("#", "").toLowerCase() === b.replace("#", "").toLowerCase();
}

/**
 * 统一颜色选择器：点开再选，不再让每一项都常驻十几个色点 + HEX 输入框。
 * 改动即时反映到右侧实时预览（走 onChange），但只有点「应用装扮」才写服务器。
 */
function ColorPickerSheet({ label, value, defaultValue, onChange, onClose }: {
  label: string;
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="decor-color-pop" role="dialog" aria-modal="true" aria-label={`${label}颜色`}>
      <div className="decor-color-pop-inner">
        <header>
          <strong>{label}</strong>
          <button type="button" onClick={onClose} aria-label="关闭"><X size={17} /></button>
        </header>
        <div className="decor-color-now">
          <span className="decor-color-now-chip" style={{ background: safeColor(value, "#000000") }} aria-hidden="true" />
          <span>{value.toUpperCase()}</span>
        </div>
        <div className="decor-color-grid" role="group" aria-label={`${label}常用颜色`}>
          {COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              className={sameColor(color, value) ? "active" : ""}
              style={{ background: color }}
              aria-label={color}
              aria-pressed={sameColor(color, value)}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
        <div className="decor-color-custom">
          <label className="decor-color-pick">
            <input type="color" value={safeColor(value, "#000000")} onChange={(event) => onChange(event.target.value)} aria-label={`${label}自定义颜色`} />
            <span>取色器</span>
          </label>
          <input
            type="text"
            value={text}
            inputMode="text"
            spellCheck={false}
            aria-label={`${label}色值`}
            onChange={(event) => {
              const next = event.target.value;
              setText(next);
              if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(next)) onChange(next);
            }}
            onBlur={() => setText(value)}
          />
        </div>
        <div className="decor-color-pop-actions">
          {defaultValue !== undefined && !sameColor(defaultValue, value) && (
            <button type="button" onClick={() => onChange(defaultValue)}>恢复默认</button>
          )}
          <button type="button" className="is-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange, defaultValue }: { label: string; value: string; onChange: (value: string) => void; defaultValue?: string }) {
  const [open, setOpen] = useState(false);
  const dirty = defaultValue !== undefined && !sameColor(defaultValue, value);
  return (
    <>
      <button type="button" className="decor-color-field" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="decor-color-chip" style={{ background: safeColor(value, "#000000") }} aria-hidden="true" />
        <span className="decor-color-name">{label}</span>
        <span className="decor-color-code">{value.toUpperCase()}{dirty ? " · 已修改" : ""}</span>
        <ChevronRight size={14} />
      </button>
      {open && <ColorPickerSheet label={label} value={value} defaultValue={defaultValue} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

function OpacityRow({ label, value, onChange, defaultValue }: { label: string; value: number; onChange: (value: number) => void; defaultValue?: number }) {
  return (
    <label className="decor-slider-row">
      <span>{label}<em>{Math.round(value * 100)}%</em>{defaultValue !== undefined && Math.abs(defaultValue - value) > 0.004 && (
        <button type="button" className="decor-row-reset" aria-label={`恢复${label}默认值`} onClick={() => onChange(defaultValue)}>↺</button>
      )}</span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/**
 * 保存后的反馈分层（4.3）：
 * - 纯网页：只报「已保存到账户」，不假装 APP 有回执；
 * - APP 内嵌：先报「正在同步到 APP」，收到原生渲染回执后报「APP 已应用」，
 *   超时未回执报「已保存，APP 待同步」，由用户决定是否重试。
 */
function announceSaved(onNotice: (message: string) => void) {
  if (!isDecorAppEmbed()) {
    onNotice("已保存到账户");
    return;
  }
  onNotice("已保存到账户，正在同步到 APP");
  let settled = false;
  const finish = (message: string) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    window.removeEventListener("heika-decor-applied", onApplied);
    onNotice(message);
  };
  const onApplied = () => finish("APP 已应用");
  const timer = window.setTimeout(() => finish("已保存，APP 待同步"), 5000);
  window.addEventListener("heika-decor-applied", onApplied, { once: true });
}

/** 旧调用方仍会传 official / community / submissions，这里统一收口。 */
const resolveTab = (value: Tab | LegacyTab): Tab =>
  value === "studio" ? "studio" : value === "mine" || value === "submissions" ? "mine" : "discover";
const resolveDiscover = (value: Tab | LegacyTab): DiscoverSection =>
  value === "community" ? "community" : "official";
const resolveMine = (value: Tab | LegacyTab): MineSection =>
  value === "submissions" ? "submissions" : "active";

/** 「正在使用」：只读呈现账号当前生效的装扮，改动一律从创作工坊发起。 */
function ActiveDecorPanel({ decor, mode, accountId, onEdit, onDiscover, onLogin }: {
  decor: { bottomBar: BottomBarConfig; card: CardConfig };
  mode: "dark" | "light";
  accountId: string | null;
  onEdit: () => void;
  onDiscover: () => void;
  onLogin: () => void;
}) {
  const [slot, setSlot] = useState<DecorIconSlot>("home");
  return (
    <div className="decor-active">
      <div className="decor-active-stage">
        <CardPreview config={decor.card} mode={mode} />
        <BarPreview config={decor.bottomBar} mode={mode} active={slot} onActiveChange={setSlot} />
      </div>
      <p className="decor-active-hint">这是账号当前生效的装扮，其他登录设备读到的也是它。调整会先进草稿，确认后才同步。</p>
      <div className="decor-active-actions">
        <button type="button" className="is-primary" onClick={() => accountId ? onEdit() : onLogin()}><Palette size={15} /> 继续调整</button>
        <button type="button" onClick={() => (accountId ? onDiscover() : onLogin())}><Sparkles size={15} /> 换个主题</button>
      </div>
    </div>
  );
}

export default function DecorCenter({
  open, initialTab = "discover", initialKind = "all", accountId, onClose, onNotice, onLogin,
}: {
  open: boolean;
  initialTab?: Tab | LegacyTab;
  initialKind?: KindFilter;
  accountId: string | null;
  onClose: () => void;
  onNotice: (message: string) => void;
  onLogin: () => void;
}) {
  const decor = useDecor();
  const mode = useMode();
  const [tab, setTab] = useState<Tab>(resolveTab(initialTab));
  const [discoverSection, setDiscoverSection] = useState<DiscoverSection>(resolveDiscover(initialTab));
  const [mineSection, setMineSection] = useState<MineSection>(resolveMine(initialTab));
  const [kind, setKind] = useState<KindFilter>(initialKind);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DecorTheme[]>([]);
  const [mine, setMine] = useState<DecorTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<DecorTheme | null>(null);
  const [detailSlot, setDetailSlot] = useState<DecorIconSlot>("home");
  const [demo, setDemo] = useState<{ config: DecorTheme; state: "back" | "confirm" | "content" } | null>(null);
  const [working, setWorking] = useState<{ bottomBar: BottomBarConfig; card: CardConfig }>({ bottomBar: decor.decor.bottomBar, card: decor.decor.card });
  // 按钮六态（需求 11）：idle 默认 / :active 按下 / loading 加载 / success 成功 / error 失败重试 / disabled 禁用。
  const [savePhase, setSavePhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [studioKind, setStudioKind] = useState<"bottom" | "card">(initialKind === "card" ? "card" : "bottom");
  // 单条底栏预览的选中状态切换（只预览，不改配置）。
  const [previewSlot, setPreviewSlot] = useState<DecorIconSlot>("home");
  const [studioMode, setStudioMode] = useState<"dark" | "light">("dark");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  // 草稿未应用就关窗，给一次明确选择，避免辛苦调好的配色被静默丢掉。
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [submitForm, setSubmitForm] = useState({ title: "", description: "", tags: "" });
  const [iconEditing, setIconEditing] = useState<{ slot: DecorIconSlot; state: "normal" | "active"; file: File; url: string } | null>(null);
  const [iconScale, setIconScale] = useState(1);
  const [iconFit, setIconFit] = useState<"contain" | "cover">("contain");
  const [iconTrim, setIconTrim] = useState(true);
  const [iconBusy, setIconBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(resolveTab(initialTab));
    setDiscoverSection(resolveDiscover(initialTab));
    setMineSection(resolveMine(initialTab));
    setKind(initialKind);
    // 从「卡片装扮」进来的直接落在卡片工作区，不用再手动切一次。
    if (initialKind === "card" || initialKind === "bottom") setStudioKind(initialKind);
    setDetail(null);
    setSubmitOpen(false);
    setWorking({ bottomBar: decor.decor.bottomBar, card: decor.decor.card });
    setDirty(false);
  }, [open, initialTab, initialKind]); // eslint-disable-line react-hooks/exhaustive-deps

  // APP 渲染完成后回执「APP 已应用」（4.3），钩子只在装扮中心生命周期内有效。
  useEffect(() => installDecorAppliedHook(), []);

  const loadList = useCallback(async (scope: "official" | "community" | "favorites" | "mine") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope });
      if (kind !== "all") params.set("kind", kind);
      if (query.trim()) params.set("q", query.trim());
      const response = await cloudFetch(`/api/v1/decor/themes?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "主题列表加载失败");
      const list = (payload.data?.items || []) as DecorTheme[];
      if (scope === "favorites" || scope === "mine") setMine(list);
      else setItems(list);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "主题列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [kind, query]);

  // 「正在使用」直接读本地配置，不需要请求列表。
  const listScope = tab === "discover"
    ? discoverSection
    : mineSection === "favorite" ? "favorites" : mineSection === "submissions" ? "mine" : null;

  useEffect(() => {
    if (!open || !listScope) return;
    const timer = window.setTimeout(() => { void loadList(listScope); }, query ? 260 : 0);
    return () => window.clearTimeout(timer);
  }, [open, listScope, loadList, query]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (demo) { setDemo(null); return; }
      if (detail) { setDetail(null); return; }
      if (submitOpen) { setSubmitOpen(false); return; }
      if (dirty) { setCloseConfirm(true); return; }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, detail, demo, submitOpen, onClose]);

  const requestClose = () => {
    if (dirty) { setCloseConfirm(true); return; }
    onClose();
  };

  const applyTheme = async (theme: DecorTheme, part: "all" | "palette" | "icons" = "all") => {
    if (!accountId) { onLogin(); return; }
    setBusy(true);
    try {
      const patch: Parameters<typeof saveDecor>[0] = {};
      if (theme.kind !== "card") {
        const bottomBar = normalizeBottomBar(theme.config.bottomBar);
        patch.bottomBar = part === "icons" ? { ...bottomBar, mode: "follow" as const, icons: bottomBar.icons } : { ...bottomBar, icons: part === "palette" ? {} : bottomBar.icons };
        patch.bottomBarThemeId = theme.id;
      }
      if (theme.kind !== "bottom") {
        patch.card = normalizeCard(theme.config.card);
        patch.cardThemeId = theme.id;
      }
      await saveDecor(patch);
      announceSaved(onNotice);
      setDetail(null);
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "应用失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  // 官方预设在本地就有完整配置：即使列表接口慢或离线，发现页也不会是一片空白。
  // 这类主题没有数据库 UUID，用一个前缀 id 区分，收藏等写操作只对真实记录开放。
  const applyPreset = async (theme: DecorTheme) => {
    if (!accountId) { onLogin(); return; }
    setBusy(true);
    try {
      await saveDecor({ bottomBar: theme.config.bottomBar, card: theme.config.card, bottomBarThemeId: null, cardThemeId: null });
      setWorking({ bottomBar: theme.config.bottomBar, card: theme.config.card });
      setDirty(false);
      announceSaved(onNotice);
      setDetail(null);
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "应用失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const favorite = async (theme: DecorTheme) => {
    if (!accountId) { onLogin(); return; }
    try {
      const result = await cloudRequest(`/api/v1/decor/themes/${theme.id}/favorite`, { favorite: !theme.favorite }) as { favorite: boolean; favoriteCount: number };
      const update = (list: DecorTheme[]) => list.map((item) => item.id === theme.id ? { ...item, favorite: result.favorite, favoriteCount: result.favoriteCount } : item);
      setItems(update); setMine(update);
      setDetail((current) => current && current.id === theme.id ? { ...current, favorite: result.favorite, favoriteCount: result.favoriteCount } : current);
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "收藏失败");
    }
  };

  const saveStudio = async (apply: boolean) => {
    if (!accountId) { onLogin(); return; }
    if (busy) return; // 加载期间防重复提交
    setBusy(true);
    setSavePhase("loading");
    try {
      if (apply) {
        await saveDecor({ bottomBar: working.bottomBar, card: working.card, bottomBarThemeId: null, cardThemeId: null });
        setDirty(false);
        // 成功依据真实保存结果，不按固定延时无条件显示。
        setSavePhase("success");
        window.setTimeout(() => setSavePhase((phase) => (phase === "success" ? "idle" : phase)), 1800);
        announceSaved(onNotice);
      } else {
        onNotice("方案已保存在本地预览，点击「应用」后才会同步到账号");
        setSavePhase("idle");
      }
    } catch (cause) {
      setSavePhase("error");
      onNotice(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const uploadIcon = async () => {
    if (!iconEditing) return;
    setIconBusy(true);
    try {
      const blob = await renderIcon(iconEditing.file, { scale: iconScale, fit: iconFit, trim: iconTrim });
      const response = await uploadDecorAsset(blobToFile(blob, `icon-${iconEditing.slot}.png`), "icon");
      const slot = iconEditing.slot;
      const existing = working.bottomBar.icons[slot];
      const next = {
        ...working.bottomBar,
        icons: {
          ...working.bottomBar.icons,
          [slot]: { ...(existing || { tint: true, scale: 1, fit: "contain", trim: true }), [iconEditing.state]: response.url },
        },
      };
      setWorking((current) => ({ ...current, bottomBar: next }));
      setDirty(true);
      setIconEditing(null);
      onNotice("图标已替换，记得点击应用");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "图标上传失败");
    } finally {
      setIconBusy(false);
    }
  };

  const uploadBackdrop = async (file: File, target: "backImage" | "contentImage") => {
    if (!accountId) { onLogin(); return; }
    setBusy(true);
    try {
      const blob = await renderBackdrop(file);
      const { url } = await uploadDecorAsset(blobToFile(blob, "backdrop.webp"), target === "backImage" ? "card-back" : "content-image");
      setWorking((current) => ({
        ...current,
        card: { ...current.card, [studioMode]: { ...current.card[studioMode], [target]: url } },
      }));
      setDirty(true);
      onNotice("底图已更新");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "底图上传失败");
    } finally {
      setBusy(false);
    }
  };

  const submitTheme = async () => {
    if (!accountId) { onLogin(); return; }
    if (submitForm.title.trim().length < 2) { onNotice("主题名称至少 2 个字"); return; }
    if (submitForm.description.trim().length < 4) { onNotice("写一句简介，方便别人了解这套装扮"); return; }
    setBusy(true);
    try {
      const config: DecorConfig = { version: 1, bottomBar: working.bottomBar, card: working.card };
      const created = await cloudRequest("/api/v1/decor/themes", {
        title: submitForm.title.trim(),
        description: submitForm.description.trim(),
        tags: submitForm.tags.split(/[,，\s]+/).filter(Boolean).slice(0, 4),
        kind: studioKind === "bottom" ? "bottom" : studioKind === "card" ? "card" : "bundle",
        config,
      }) as DecorTheme | null;
      if (!created) throw new Error("投稿失败，请重试");
      setSubmitOpen(false);
      setSubmitForm({ title: "", description: "", tags: "" });
      setTab("mine");
      setMineSection("submissions");
      onNotice("已提交审核，通过后其他用户就能使用");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "投稿失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const barPalette = working.bottomBar[studioMode];
  const cardPalette = working.card[studioMode];
  const barDefaults = DEFAULT_BOTTOM_BAR[studioMode];
  const cardDefaults = DEFAULT_CARD[studioMode];

  const updateBar = (patch: Partial<typeof barPalette>) => {
    setWorking((current) => ({ ...current, bottomBar: { ...current.bottomBar, mode: "split", [studioMode]: { ...current.bottomBar[studioMode], ...patch } } }));
    setDirty(true);
  };
  const updateCard = (patch: Partial<typeof cardPalette>) => {
    setWorking((current) => ({ ...current, card: { ...current.card, mode: "split", [studioMode]: { ...current.card[studioMode], ...patch } } }));
    setDirty(true);
  };

  const list = tab === "discover" ? items : mine;
  // 官方精选始终包含本地预设：数据库里缺某套主题时仍能看到真实效果，
  // 同 slug 时以数据库记录为准（有真实收藏与使用人数）。
  const galleryItems = (() => {
    if (tab !== "discover" || discoverSection !== "official") return list;
    const bySlug = new Map(list.filter((theme) => theme.slug).map((theme) => [theme.slug as string, theme]));
    const merged: DecorTheme[] = OFFICIAL_PRESETS.map((preset) => {
      const record = bySlug.get(preset.slug);
      if (record) { bySlug.delete(preset.slug); return record; }
      return {
        id: `preset:${preset.slug}`,
        slug: preset.slug,
        title: preset.title,
        description: preset.description,
        origin: "official" as const,
        kind: preset.kind,
        authorId: null,
        authorName: null,
        status: "approved" as const,
        version: 1,
        tags: preset.tags,
        config: preset.config,
        liveConfig: preset.config,
        reviewNote: null,
        publishedAt: null,
        createdAt: "",
        updatedAt: "",
        favorite: false,
        favoriteCount: 0,
        installCount: 0,
        mine: false,
        hasLiveVersion: true,
      };
    });
    return [...merged, ...bySlug.values()];
  })();

  if (!open) return null;

  return (
    <div className="decor-center" role="dialog" aria-modal="true" aria-label="装扮中心">
      <header className="decor-center-head">
        <button type="button" onClick={requestClose} aria-label="关闭"><ArrowLeft size={20} /></button>
        <strong>装扮中心</strong>
        <button type="button" className="decor-center-studio" onClick={() => setTab("studio")} aria-label="打开装扮工作室"><Palette size={18} /></button>
      </header>

      <div className="decor-center-tabs" role="tablist" aria-label="装扮分类">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setDetail(null); }}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="decor-center-body" ref={bodyRef}>
        {tab === "studio" ? (
          <div className="decor-studio">
            <div className="decor-studio-preview">
              <div className="decor-studio-preview-head">
                <span>实时预览</span>
                <div>
                  {(["dark", "light"] as const).map((value) => (
                    <button key={value} type="button" className={studioMode === value ? "active" : ""} onClick={() => setStudioMode(value)}>{value === "dark" ? "深色" : "浅色"}</button>
                  ))}
                </div>
              </div>
              <div className="decor-studio-kind">
                <button type="button" className={studioKind === "bottom" ? "active" : ""} onClick={() => setStudioKind("bottom")}><Layers size={15} /> 底栏</button>
                <button type="button" className={studioKind === "card" ? "active" : ""} onClick={() => setStudioKind("card")}><ImageIcon size={15} /> 卡片</button>
              </div>
              {studioKind === "bottom" ? (
                <div className="decor-studio-bars">
                  <BarPreview config={working.bottomBar} mode={studioMode} active={previewSlot} onActiveChange={setPreviewSlot} />
                  <div className="decor-preview-slot-tabs" role="group" aria-label="切换预览选中状态">
                    {DECOR_ICON_SLOTS.map((slot) => (
                      <button key={slot} type="button" className={previewSlot === slot ? "active" : ""} aria-pressed={previewSlot === slot} onClick={() => setPreviewSlot(slot)}>{SLOT_LABELS[slot]}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="decor-studio-cards">
                  <CardPreview config={working.card} mode={studioMode} />
                  <CardPreview config={working.card} mode={studioMode} state="content" />
                </div>
              )}
            </div>

            <div className="decor-studio-editor">
              <section>
                <h3>官方预设</h3>
                <p className="decor-section-hint">点选即套用到预览，确认后点击下方「应用装扮」保存并同步。</p>
                <div className="decor-preset-strip">
                  {OFFICIAL_PRESETS.map((preset) => {
                    // 缩略图直接用这套主题的卡背色与底栏色画，不另做宣传图。
                    const barPalette = paletteFor(preset.config.bottomBar, studioMode);
                    const cardPalette = paletteFor(preset.config.card, studioMode);
                    return (
                      <button key={preset.slug} type="button" className="decor-preset-tile" onClick={() => {
                        setWorking({ bottomBar: preset.config.bottomBar, card: preset.config.card });
                        setDirty(true);
                      }}>
                        <span className="decor-preset-thumb" style={{ background: cardPalette.backBg, borderColor: cardPalette.backBorder }}>
                          <span className="decor-preset-sheet" style={{ background: cardPalette.contentBg, borderColor: cardPalette.contentBorder }} />
                          <span
                            className="decor-preset-bar"
                            style={{
                              background: withAlpha(barPalette.bg, Math.max(0.34, barPalette.bgOpacity)),
                              borderColor: withAlpha(barPalette.border, barPalette.borderOpacity),
                            }}
                          >
                            <i style={{ background: barPalette.icon }} />
                            <i style={{ background: barPalette.activeIcon }} />
                            <i style={{ background: barPalette.icon }} />
                            <i style={{ background: barPalette.icon }} />
                          </span>
                        </span>
                        <span className="decor-preset-name">{preset.title}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              {studioKind === "bottom" ? (
                <>
                  <section>
                    <h3>基础设置</h3>
                    <div className="decor-row decor-row-toggle">
                      <span>显示导航文字<small>{working.bottomBar.showLabel !== false ? "图标＋文字" : "仅图标"}</small></span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={working.bottomBar.showLabel !== false}
                        aria-label="显示导航文字"
                        className={`toggle-switch ${working.bottomBar.showLabel !== false ? "on" : ""}`}
                        onClick={() => {
                          setWorking((current) => ({ ...current, bottomBar: { ...current.bottomBar, showLabel: current.bottomBar.showLabel === false } }));
                          setDirty(true);
                        }}
                      ><i /></button>
                    </div>
                    <p className="decor-section-hint">关闭后底栏只显示图标，图标在按钮内居中，点击区域与角标位置不变。该开关只作用于网页端。</p>
                  </section>
                  <section>
                    <h3>基础配色</h3>
                    <p className="decor-section-hint">先定背景与强调色就能看出气质，其余细节收在「高级自定义」。</p>
                    <ColorRow label="底栏背景"  value={barPalette.bg} onChange={(value) => updateBar({ bg: value })} defaultValue={barDefaults.bg} />
                    <ColorRow label="强调色 · 选中图标"  value={barPalette.activeIcon} onChange={(value) => updateBar({ activeIcon: value })} defaultValue={barDefaults.activeIcon} />
                    <OpacityRow label="背景透明度"  value={barPalette.bgOpacity} onChange={(value) => updateBar({ bgOpacity: value })} defaultValue={barDefaults.bgOpacity} />
                  </section>
                  <details className="decor-advanced">
                    <summary>高级自定义</summary>
                    <section>
                      <h3>文字与图标</h3>
                      <ColorRow label="图标"  value={barPalette.icon} onChange={(value) => updateBar({ icon: value })} defaultValue={barDefaults.icon} />
                      <ColorRow label="文字"  value={barPalette.label} onChange={(value) => updateBar({ label: value })} defaultValue={barDefaults.label} />
                      <ColorRow label="选中文字"  value={barPalette.activeLabel} onChange={(value) => updateBar({ activeLabel: value })} defaultValue={barDefaults.activeLabel} />
                    </section>
                    <section>
                      <h3>透明度与描边</h3>
                      <ColorRow label="描边"  value={barPalette.border} onChange={(value) => updateBar({ border: value })} defaultValue={barDefaults.border} />
                      <OpacityRow label="描边透明度"  value={barPalette.borderOpacity} onChange={(value) => updateBar({ borderOpacity: value })} defaultValue={barDefaults.borderOpacity} />
                      <ColorRow label="选中底色"  value={barPalette.activePill} onChange={(value) => updateBar({ activePill: value })} defaultValue={barDefaults.activePill} />
                      <OpacityRow label="选中底色透明度"  value={barPalette.activePillOpacity} onChange={(value) => updateBar({ activePillOpacity: value })} defaultValue={barDefaults.activePillOpacity} />
                    </section>
                    <section>
                      <h3>底栏图标</h3>
                      <p className="decor-section-hint">每个位置可分别替换普通态与选中态；只上传一张时，选中态用颜色与轻微缩放区分。单色图标可跟随主题色，彩色图标保留原色。</p>
                      {DECOR_ICON_SLOTS.map((slot) => {
                        const icon = working.bottomBar.icons[slot];
                        return (
                          <div className="decor-icon-slot" key={slot}>
                            <strong>{SLOT_LABELS[slot]}</strong>
                            <div className="decor-icon-slot-previews">
                              {(["normal", "active"] as const).map((state) => (
                                <label key={state} className="decor-icon-upload">
                                  <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.currentTarget.value = "";
                                    if (!file) return;
                                    setIconScale(1); setIconFit("contain"); setIconTrim(true);
                                    setIconEditing({ slot, state, file, url: URL.createObjectURL(file) });
                                  }} />
                                  {icon?.[state] ? <img src={icon[state]} alt="" /> : <span>{state === "normal" ? "普通" : "选中"}</span>}
                                </label>
                              ))}
                            </div>
                            {icon && (
                              <div className="decor-icon-flags">
                                <label><input type="checkbox" checked={icon.tint} onChange={(event) => {
                                  setWorking((current) => ({ ...current, bottomBar: { ...current.bottomBar, icons: { ...current.bottomBar.icons, [slot]: { ...icon, tint: event.target.checked } } } }));
                                  setDirty(true);
                                }} /> 跟随主题色</label>
                                <label><input type="range" min={0.6} max={1.4} step={0.02} value={icon.scale} onChange={(event) => {
                                  setWorking((current) => ({ ...current, bottomBar: { ...current.bottomBar, icons: { ...current.bottomBar.icons, [slot]: { ...icon, scale: Number(event.target.value) } } } }));
                                  setDirty(true);
                                }} /></label>
                                <button type="button" aria-label={`移除${SLOT_LABELS[slot]}图标`} onClick={() => {
                                  setWorking((current) => {
                                    const icons = { ...current.bottomBar.icons };
                                    delete icons[slot];
                                    return { ...current, bottomBar: { ...current.bottomBar, icons } };
                                  });
                                  setDirty(true);
                                }}><Trash2 size={13} /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  </details>
                </>
              ) : (
                <>
                  <section>
                    <h3>基础设置</h3>
                    <ColorRow label="卡背底色"  value={cardPalette.backBg} onChange={(value) => updateCard({ backBg: value })} defaultValue={cardDefaults.backBg} />
                    <ColorRow label="强调色"  value={cardPalette.accent} onChange={(value) => updateCard({ accent: value })} defaultValue={cardDefaults.accent} />
                    <label className="decor-select-row"><span>纹理</span>
                      <select value={cardPalette.texture} onChange={(event) => updateCard({ texture: event.target.value as typeof cardPalette.texture })}>
                        <option value="none">无纹理</option>
                        <option value="linen">细斜线</option>
                        <option value="dots">稀疏点阵</option>
                        <option value="grid">精细方格</option>
                        <option value="paper">纸张颗粒</option>
                        <option value="noise">磨砂噪点</option>
                        <option value="rings">同心圆</option>
                        <option value="diamonds">几何菱形</option>
                      </select>
                    </label>
                    <label className="decor-select-row"><span>中央图案</span>
                      <select value={cardPalette.pattern} onChange={(event) => updateCard({ pattern: event.target.value as typeof cardPalette.pattern })}>
                        <option value="none">无</option>
                        <option value="monogram">字母 H</option>
                        <option value="diamond">菱形</option>
                        <option value="frame">内框</option>
                      </select>
                    </label>
                  </section>
                  <details className="decor-advanced">
                    <summary>高级自定义</summary>
                    <section>
                      <h3>卡背细节</h3>
                      <div className="decor-backdrop-row">
                        <span>卡背图片</span>
                        <label className="decor-backdrop-upload">
                          <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadBackdrop(file, "backImage"); }} />
                          <ImageIcon size={14} /> 上传
                        </label>
                        {cardPalette.backImage && <button type="button" onClick={() => updateCard({ backImage: "" })}><X size={13} /> 移除</button>}
                      </div>
                      <ColorRow label="卡背描边"  value={cardPalette.backBorder} onChange={(value) => updateCard({ backBorder: value })} defaultValue={cardDefaults.backBorder} />
                      <ColorRow label="编号颜色"  value={cardPalette.numberColor} onChange={(value) => updateCard({ numberColor: value })} defaultValue={cardDefaults.numberColor} />
                      <ColorRow label="提示文字"  value={cardPalette.hintColor} onChange={(value) => updateCard({ hintColor: value })} defaultValue={cardDefaults.hintColor} />
                      <ColorRow label="按钮底色"  value={cardPalette.actionBg} onChange={(value) => updateCard({ actionBg: value })} defaultValue={cardDefaults.actionBg} />
                      <ColorRow label="按钮文字"  value={cardPalette.actionText} onChange={(value) => updateCard({ actionText: value })} defaultValue={cardDefaults.actionText} />
                    </section>
                    <section>
                      <h3>翻开后的内容面</h3>
                      <ColorRow label="内容区底色"  value={cardPalette.contentBg} onChange={(value) => updateCard({ contentBg: value })} defaultValue={cardDefaults.contentBg} />
                      <div className="decor-backdrop-row">
                        <span>内容区底图</span>
                        <label className="decor-backdrop-upload">
                          <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadBackdrop(file, "contentImage"); }} />
                          <ImageIcon size={14} /> 上传
                        </label>
                        {cardPalette.contentImage && <button type="button" onClick={() => updateCard({ contentImage: "" })}><X size={13} /> 移除</button>}
                      </div>
                      <ColorRow label="内容区描边"  value={cardPalette.contentBorder} onChange={(value) => updateCard({ contentBorder: value })} defaultValue={cardDefaults.contentBorder} />
                      <ColorRow label="标题"  value={cardPalette.titleColor} onChange={(value) => updateCard({ titleColor: value })} defaultValue={cardDefaults.titleColor} />
                      <ColorRow label="正文"  value={cardPalette.bodyColor} onChange={(value) => updateCard({ bodyColor: value })} defaultValue={cardDefaults.bodyColor} />
                      <ColorRow label="分类底色"  value={cardPalette.chipBg} onChange={(value) => updateCard({ chipBg: value })} defaultValue={cardDefaults.chipBg} />
                      <ColorRow label="分类描边"  value={cardPalette.chipBorder} onChange={(value) => updateCard({ chipBorder: value })} defaultValue={cardDefaults.chipBorder} />
                    </section>
                  </details>
                </>
              )}
              <div className="decor-studio-actions">
                <button
                  type="button"
                  className={`is-primary decor-action-button is-${savePhase === "idle" ? (dirty ? "default" : "done") : savePhase}`}
                  disabled={busy || savePhase === "loading" || (!dirty && savePhase !== "error")}
                  onClick={() => void saveStudio(true)}
                >
                  {savePhase === "loading" ? <><i className="decor-button-spinner" aria-hidden="true" /> 正在保存…</>
                    : savePhase === "success" ? <><Check size={15} /> 已保存</>
                    : savePhase === "error" ? <><RotateCcw size={15} /> 保存失败，点击重试</>
                    : dirty ? <><Check size={15} /> 应用装扮</>
                    : <><Check size={15} /> 已应用</>}
                </button>
                <button type="button" onClick={() => setSubmitOpen(true)}><Upload size={15} /> 投稿</button>
                {!dirty && isDecorAppEmbed() && (
                  <button type="button" onClick={() => {
                    try { (window as unknown as { HeikaNative?: { post?: (m: string) => void } }).HeikaNative?.post?.(JSON.stringify({ type: "close" })); } catch { /* 用户仍可点右上角返回 */ }
                  }}><Check size={15} /> 完成并返回 APP</button>
                )}
                <button type="button" onClick={() => {
                  setWorking({ bottomBar: DEFAULT_BOTTOM_BAR, card: DEFAULT_CARD });
                  setDirty(true);
                }}><RotateCcw size={15} /> 恢复默认</button>
              </div>
              {dirty && <p className="decor-studio-note">预览不会立即生效，点击「应用装扮」后才会写入账号并同步到 APP。</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="decor-segments" role="tablist" aria-label={tab === "discover" ? "装扮来源" : "我的装扮分类"}>
              {(tab === "discover" ? DISCOVER_SECTIONS : MINE_SECTIONS).map((item) => {
                const active = tab === "discover" ? discoverSection === item.id : mineSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={active ? "active" : ""}
                    onClick={() => {
                      setDetail(null);
                      if (tab === "discover") setDiscoverSection(item.id as DiscoverSection);
                      else setMineSection(item.id as MineSection);
                    }}
                  >{item.label}</button>
                );
              })}
            </div>
            {tab === "mine" && mineSection === "active" ? (
              <ActiveDecorPanel
                decor={{ bottomBar: decor.decor.bottomBar, card: decor.decor.card }}
                mode={mode}
                accountId={accountId}
                onEdit={() => setTab("studio")}
                onDiscover={() => { setTab("discover"); setDiscoverSection("official"); }}
                onLogin={onLogin}
              />
            ) : (<>
            <div className="decor-filters">
              <label className="decor-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题" /></label>
              <div className="decor-kind-chips">
                {([["all", "全部"], ["bottom", "底栏"], ["card", "卡片"]] as const).map(([value, label]) => (
                  <button key={value} type="button" className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{label}</button>
                ))}
              </div>
            </div>

            {tab === "mine" && mineSection === "submissions" ? (
              <div className="decor-submissions">
                {loading ? <div className="decor-empty">正在加载投稿…</div> : mine.length ? mine.map((theme) => (
                  <article key={theme.id} className="decor-submission">
                    <div className="decor-submission-head">
                      <strong>{theme.title}</strong>
                      <span className={`decor-status is-${theme.status}`}>{STATUS_LABEL[theme.status] || theme.status}</span>
                    </div>
                    <p>{theme.description}</p>
                    {theme.reviewNote && <blockquote>审核意见：{theme.reviewNote}</blockquote>}
                    <div className="decor-submission-actions">
                      <button type="button" onClick={() => setDetail(theme)}>预览</button>
                      {theme.status === "rejected" && <button type="button" onClick={() => { setWorking({ bottomBar: theme.config.bottomBar, card: theme.config.card }); setStudioKind(theme.kind === "card" ? "card" : "bottom"); setTab("studio"); }}>按意见修改</button>}
                      {theme.status === "pending" && <small>通过审核后其他用户才能使用</small>}
                      {theme.status === "approved" && <small>已上架 · 更新需要重新审核</small>}
                    </div>
                  </article>
                )) : <div className="decor-empty"><ShieldCheck size={22} /><strong>还没有投稿</strong><span>在创作工坊里调好一套装扮，就可以投稿给其他探索者。</span><button type="button" onClick={() => setTab("studio")}>去创作工坊</button></div>}
              </div>
            ) : (
              <div className="decor-grid">
                {loading && !galleryItems.length ? <div className="decor-empty">正在加载主题…</div> : error && !galleryItems.length ? <div className="decor-empty"><strong>加载失败</strong><span>{error}</span><button type="button" onClick={() => { if (listScope) void loadList(listScope); }}>重试</button></div> : galleryItems.length ? galleryItems.map((theme) => (
                  <button key={theme.id} type="button" className={`decor-theme-card${theme.id.startsWith("preset:") ? " is-preset" : ""}`} onClick={() => { setDetail(theme); setDetailSlot("home"); }}>
                    <div className={`decor-theme-preview is-${theme.kind}`}>
                      {theme.kind !== "bottom" && <CardPreview config={theme.config.card} mode={mode} />}
                      {theme.kind !== "card" && <BarPreview config={theme.config.bottomBar} mode={mode} />}
                      {theme.kind === "bundle" && <span className="decor-theme-badge"><Layers size={11} /> 整套</span>}
                      {theme.favorite && <span className="decor-theme-fav" aria-label="已收藏"><Heart size={12} fill="currentColor" /></span>}
                    </div>
                    <div className="decor-theme-meta">
                      <strong>{theme.title}</strong>
                      {theme.tags.length > 0 && <div className="decor-theme-tags">{theme.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>}
                      <small className="decor-theme-source">
                        {theme.origin === "official" && <ShieldCheck size={11} aria-label="官方主题" />}
                        {theme.origin === "official" ? "官方" : theme.authorName || "玩家"}
                        {theme.installCount > 0 ? ` · ${theme.installCount} 人在用` : ""}
                      </small>
                    </div>
                  </button>
                )) : <div className="decor-empty"><Sparkles size={22} /><strong>暂时没有匹配的主题</strong><span>换个关键词，或者去创作工坊自己做一套。</span></div>}
              </div>
            )}
            </>)}
          </>
        )}
      </div>

      {detail && (
        <div className="decor-detail" role="dialog" aria-modal="true" aria-label={`${detail.title}详情`}>
          <header>
            <button type="button" onClick={() => setDetail(null)} aria-label="返回"><ArrowLeft size={19} /></button>
            <strong>{detail.title}</strong>
            {detail.id.startsWith("preset:")
              ? <span className="decor-detail-official" aria-label="官方主题"><ShieldCheck size={17} /></span>
              : <button type="button" aria-label="收藏" className={detail.favorite ? "is-favorite" : ""} onClick={() => void favorite(detail)}><Heart size={18} /></button>}
          </header>
          <div className="decor-detail-body">
            <div className="decor-detail-stage">
              {detail.kind === "card" ? (
                <div className="decor-studio-cards">
                  <CardPreview config={detail.config.card} mode={mode} />
                  <CardPreview config={detail.config.card} mode={mode} state="content" />
                </div>
              ) : (
                <div className="decor-studio-bars">
                  <BarPreview config={detail.config.bottomBar} mode={mode} active={detailSlot} />
                  <div className="decor-detail-slot-picker">
                    {DECOR_ICON_SLOTS.map((slot) => (
                      <button key={slot} type="button" className={detailSlot === slot ? "active" : ""} onClick={() => setDetailSlot(slot)}>{SLOT_LABELS[slot]}</button>
                    ))}
                  </div>
                </div>
              )}
              {detail.kind === "bundle" && <button type="button" className="decor-detail-demo" onClick={() => setDemo({ config: detail, state: "back" })}><Eye size={15} /> 演示翻卡</button>}
            </div>

            <div className="decor-detail-copy">
              <p>{detail.description}</p>
              <div className="decor-detail-stats">
                <span><UserRound size={13} />{detail.authorName || "官方"}</span>
                <span><Download size={13} />{detail.installCount} 人在用</span>
                <span><Heart size={13} />{detail.favoriteCount} 收藏</span>
                <span className={`decor-status is-${detail.status}`}>{STATUS_LABEL[detail.status]}</span>
              </div>
              {detail.tags.length > 0 && <div className="decor-tags">{detail.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
              {detail.hasLiveVersion && detail.status === "pending" && <blockquote>新版本审核中，当前线上版本仍可继续使用。</blockquote>}
              {detail.reviewNote && <blockquote>审核意见：{detail.reviewNote}</blockquote>}
              <div className="decor-detail-actions">
                <button type="button" className="is-primary" disabled={busy || (detail.status !== "approved" && !detail.mine)} onClick={() => void (detail.id.startsWith("preset:") ? applyPreset(detail) : applyTheme(detail))}>
                  <Check size={15} /> {detail.status === "approved" ? "应用这套装扮" : "仅自己可用"}
                </button>
                {detail.kind === "bundle" && !detail.id.startsWith("preset:") && (
                  <>
                    <button type="button" onClick={() => void applyTheme(detail, "palette")}>仅用配色</button>
                    <button type="button" onClick={() => void applyTheme(detail, "icons")}>仅用图标</button>
                  </>
                )}
              </div>
              {detail.mine && detail.status !== "delisted" && (
                <button type="button" className="decor-detail-edit" onClick={() => {
                  setWorking({ bottomBar: detail.config.bottomBar, card: detail.config.card });
                  setDirty(true);
                  setTab("studio");
                  setDetail(null);
                }}>继续编辑这套主题</button>
              )}
            </div>
          </div>
        </div>
      )}

      {demo && (
        <div className="decor-demo" role="dialog" aria-modal="true" aria-label="翻卡演示" onClick={() => setDemo(null)}>
          <div className="decor-demo-inner" onClick={(event) => event.stopPropagation()}>
            <div className="decor-demo-head">
              <strong>翻卡演示</strong>
              <button type="button" onClick={() => setDemo(null)} aria-label="关闭"><X size={18} /></button>
            </div>
            <div className="decor-demo-stage">
              {demo.state === "back" && <button type="button" className="decor-demo-card" onClick={() => setDemo({ ...demo, state: "confirm" })}><CardPreview config={demo.config.config.card} mode={mode} /></button>}
              {demo.state === "confirm" && <button type="button" className="decor-demo-card" onClick={() => setDemo({ ...demo, state: "content" })}><CardPreview config={demo.config.config.card} mode={mode} /></button>}
              {demo.state === "content" && <div className="decor-demo-card"><CardPreview config={demo.config.config.card} mode={mode} state="content" /></div>}
            </div>
            <p>这是固定示例内容，不会消耗今日翻卡次数，也不会改变真实卡片的翻开状态。</p>
            <div className="decor-demo-actions">
              <button type="button" onClick={() => setDemo({ ...demo, state: "back" })}>重新演示</button>
              <button type="button" className="is-primary" onClick={() => setDemo(null)}>完成</button>
            </div>
          </div>
        </div>
      )}

      {closeConfirm && (
        <div className="decor-confirm" role="dialog" aria-modal="true" aria-label="有未应用的修改">
          <div className="decor-confirm-inner">
            <strong>还有未应用的修改</strong>
            <p>当前配色只存在于草稿里，关闭后不会写入账号。</p>
            <div>
              <button type="button" onClick={() => setCloseConfirm(false)}>继续编辑</button>
              <button type="button" className="is-primary" onClick={() => { setCloseConfirm(false); onClose(); }}>放弃修改</button>
            </div>
          </div>
        </div>
      )}

      {iconEditing && (
        <div className="decor-icon-editor" role="dialog" aria-modal="true" aria-label="调整图标">
          <div className="decor-icon-editor-inner">
            <header><strong>调整图标</strong><button type="button" onClick={() => setIconEditing(null)} aria-label="取消"><X size={18} /></button></header>
            <div className="decor-icon-editor-stage">
              <img src={iconEditing.url} alt="" style={{ transform: `scale(${iconScale})`, objectFit: iconFit }} />
            </div>
            <label className="decor-slider-row"><span>主体大小<em>{Math.round(iconScale * 100)}%</em></span><input type="range" min={0.6} max={1.4} step={0.02} value={iconScale} onChange={(event) => setIconScale(Number(event.target.value))} /></label>
            <div className="decor-icon-editor-flags">
              <label><input type="radio" checked={iconFit === "contain"} onChange={() => setIconFit("contain")} /> 完整显示</label>
              <label><input type="radio" checked={iconFit === "cover"} onChange={() => setIconFit("cover")} /> 裁剪填满</label>
              <label><input type="checkbox" checked={iconTrim} onChange={(event) => setIconTrim(event.target.checked)} /> 裁去透明留白</label>
            </div>
            <p>输出 192×192 的透明 PNG，透明背景会保留。</p>
            <button type="button" className="is-primary" disabled={iconBusy} onClick={() => void uploadIcon()}>{iconBusy ? "上传中…" : "使用这张图标"}</button>
          </div>
        </div>
      )}

      {submitOpen && (
        <div className="decor-submit" role="dialog" aria-modal="true" aria-label="投稿主题">
          <div className="decor-submit-inner">
            <header><strong>投稿到创意工坊</strong><button type="button" onClick={() => setSubmitOpen(false)} aria-label="关闭"><X size={18} /></button></header>
            <p>预览图会由当前主题自动生成，保证与真实效果一致。</p>
            <label><span>主题名称</span><input maxLength={24} value={submitForm.title} onChange={(event) => setSubmitForm((current) => ({ ...current, title: event.target.value }))} placeholder="例如：夜航日志" /></label>
            <label><span>简介</span><textarea maxLength={120} rows={3} value={submitForm.description} onChange={(event) => setSubmitForm((current) => ({ ...current, description: event.target.value }))} placeholder="说说这套装扮的气质与适用场景" /></label>
            <label><span>标签</span><input maxLength={40} value={submitForm.tags} onChange={(event) => setSubmitForm((current) => ({ ...current, tags: event.target.value }))} placeholder="深色 极简（空格分隔，最多 4 个）" /></label>
            <div className="decor-submit-actions">
              <button type="button" onClick={() => setSubmitOpen(false)}>取消</button>
              <button type="button" className="is-primary" disabled={busy} onClick={() => void submitTheme()}><Send size={15} />{busy ? "提交中…" : "提交审核"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
