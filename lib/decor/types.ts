/**
 * 装扮配置：底栏与卡片共用一套可版本化的主题描述。
 *
 * 设计约束：
 * - 只描述「外观」，不携带任何脚本或 HTML；图片一律是本站存储的地址。
 * - 颜色与透明度分开表达，透明度只作用于背景层，不影响图标与文字。
 * - 深浅色可分别配置，也可以选择沿用同一套（mode: "follow"）。
 * - 未知字段在归一化时丢弃，避免历史版本污染当前渲染。
 */

export type DecorMode = "dark" | "light";
export type DecorKind = "bundle" | "bottom" | "card";
export type DecorOrigin = "official" | "community";
export type DecorStatus = "pending" | "approved" | "rejected" | "delisted";

export type BottomBarPalette = {
  /** 背景底色，配合 bgOpacity 使用 */
  bg: string;
  bgOpacity: number;
  border: string;
  borderOpacity: number;
  icon: string;
  activeIcon: string;
  label: string;
  activeLabel: string;
  /** 选中态胶囊底色 */
  activePill: string;
  activePillOpacity: number;
};

export type DecorIconSlot = "home" | "discover" | "messages" | "mine";

export type DecorIcon = {
  normal?: string;
  active?: string;
  /** 单色图标是否跟随主题色 */
  tint: boolean;
  /** 0.6 – 1.4 */
  scale: number;
  fit: "contain" | "cover";
  /** 裁去透明留白，避免不同图标视觉尺寸差异过大 */
  trim: boolean;
};

export type BottomBarConfig = {
  mode: "follow" | "split";
  dark: BottomBarPalette;
  light: BottomBarPalette;
  icons: Partial<Record<DecorIconSlot, DecorIcon>>;
  publish: { bg: string; icon: string; iconUrl?: string; tinted: boolean };
  /** 网页端底栏文字显示开关（需求十）：true=图标＋文字，false=仅图标。只作用网页端，APP 不受影响。 */
  showLabel: boolean;
};

export type CardPalette = {
  backBg: string;
  /** 卡背图片；为空时只用底色与纹理 */
  backImage: string;
  /** 纹理预设（需求十二）：none/细斜线/稀疏点阵/精细方格/纸张颗粒/磨砂噪点/同心圆/几何菱形 */
  texture: "none" | "linen" | "dots" | "grid" | "paper" | "noise" | "rings" | "diamonds";
  pattern: "none" | "monogram" | "diamond" | "frame";
  backBorder: string;
  numberColor: string;
  hintColor: string;
  actionBg: string;
  actionText: string;
  contentBg: string;
  contentBorder: string;
  contentImage: string;
  /** 内容面低强度纹理（需求 7.3）；与卡背纹理同枚举，强度更低，不遮盖作者封面与文字 */
  contentTexture: "none" | "linen" | "dots" | "grid" | "paper" | "noise" | "rings" | "diamonds";
  /** 内容区域遮罩（0 – 0.6）：压暗自定义底图/复杂背景，保证标题摘要可读；只作用装饰底图层 */
  contentScrim: number;
  titleColor: string;
  bodyColor: string;
  chipBg: string;
  chipBorder: string;
  accent: string;
};

export type CardConfig = {
  mode: "follow" | "split";
  dark: CardPalette;
  light: CardPalette;
};

export type DecorConfig = {
  version: 1;
  bottomBar: BottomBarConfig;
  card: CardConfig;
};

export type DecorTheme = {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  origin: DecorOrigin;
  kind: DecorKind;
  authorId: string | null;
  authorName: string | null;
  status: DecorStatus;
  version: number;
  tags: string[];
  config: DecorConfig;
  /** 审核通过且当前线上可用的配置；作者本人可以预览待审版本 */
  liveConfig: DecorConfig | null;
  reviewNote: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  favoriteCount: number;
  installCount: number;
  mine: boolean;
  /** 是否已有一个线上版本（更新审核中时旧版本仍可用） */
  hasLiveVersion: boolean;
};

export const DECOR_ICON_SLOTS: DecorIconSlot[] = ["home", "discover", "messages", "mine"];

export const SLOT_LABELS: Record<DecorIconSlot, string> = {
  home: "首页",
  discover: "发现",
  messages: "消息",
  mine: "我的",
};

const DARK_BAR: BottomBarPalette = {
  bg: "#0B0D0F",
  bgOpacity: 0.92,
  border: "#FFFFFF",
  borderOpacity: 0.1,
  icon: "#8E9099",
  activeIcon: "#E9D9AE",
  label: "#8E9099",
  activeLabel: "#F2E7C8",
  activePill: "#C9A961",
  activePillOpacity: 0.12,
};

const LIGHT_BAR: BottomBarPalette = {
  bg: "#FBFBF9",
  bgOpacity: 0.94,
  border: "#1A1A1A",
  borderOpacity: 0.08,
  icon: "#6F7178",
  activeIcon: "#8A6E28",
  label: "#6F7178",
  activeLabel: "#6B5416",
  activePill: "#93762F",
  activePillOpacity: 0.1,
};

const DARK_CARD: CardPalette = {
  backBg: "#101215",
  backImage: "",
  texture: "linen",
  pattern: "monogram",
  backBorder: "#2C3238",
  numberColor: "#C9D5DA",
  hintColor: "#8C969C",
  actionBg: "#C9D5DA",
  actionText: "#101619",
  contentBg: "#14161A",
  contentBorder: "#262A30",
  contentImage: "",
  contentTexture: "none",
  contentScrim: 0.28,
  titleColor: "#F2F0EA",
  bodyColor: "#B9BCC4",
  chipBg: "#1B1D22",
  chipBorder: "#2C3036",
  accent: "#C9A961",
};

const LIGHT_CARD: CardPalette = {
  backBg: "#EDE9E1",
  backImage: "",
  texture: "linen",
  pattern: "monogram",
  backBorder: "#C9C3B6",
  numberColor: "#4B463D",
  hintColor: "#7A7468",
  actionBg: "#2B2B28",
  actionText: "#F7F5EF",
  contentBg: "#FCFCFD",
  contentBorder: "#E4E4E2",
  contentImage: "",
  contentTexture: "none",
  contentScrim: 0.18,
  titleColor: "#1B1C1E",
  bodyColor: "#5C5F66",
  chipBg: "#F2F1EC",
  chipBorder: "#E0DED7",
  accent: "#93762F",
};

export const DEFAULT_BOTTOM_BAR: BottomBarConfig = {
  mode: "follow",
  dark: DARK_BAR,
  light: LIGHT_BAR,
  icons: {},
  publish: { bg: "#F5F4F0", icon: "#202125", tinted: false },
  showLabel: true,
};

export const DEFAULT_CARD: CardConfig = {
  mode: "follow",
  dark: DARK_CARD,
  light: LIGHT_CARD,
};

export const DEFAULT_DECOR: DecorConfig = {
  version: 1,
  bottomBar: DEFAULT_BOTTOM_BAR,
  card: DEFAULT_CARD,
};

export const EMPTY_DECOR: Record<string, never> = {};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ALLOWED_IMAGE = /^(?:https:\/\/|\/)(?:[^\s"'<>\\]+)$/i;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;

export function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX.test(trimmed) ? trimmed : fallback;
}

export function safeOpacity(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.min(1, Math.max(0, number)) * 100) / 100;
}

export function safeImage(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (DATA_IMAGE.test(trimmed)) return trimmed;
  if (!ALLOWED_IMAGE.test(trimmed)) return "";
  // 只接受本站存储与相对路径，拒绝任意外部资源。
  if (/^https:\/\//i.test(trimmed) && !/^https:\/\/[^/]*(?:moonclean\.shop|supabase\.co)\//i.test(trimmed)) return "";
  return trimmed.slice(0, 512);
}

function safeIcon(value: unknown): DecorIcon {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    normal: safeImage(source.normal) || undefined,
    active: safeImage(source.active) || undefined,
    tint: source.tint !== false,
    scale: Math.min(1.4, Math.max(0.6, Number(source.scale) || 1)),
    fit: source.fit === "cover" ? "cover" : "contain",
    trim: source.trim !== false,
  };
}

function normalizeBar(value: unknown, fallback: BottomBarPalette): BottomBarPalette {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    bg: safeColor(source.bg, fallback.bg),
    bgOpacity: safeOpacity(source.bgOpacity, fallback.bgOpacity),
    border: safeColor(source.border, fallback.border),
    borderOpacity: safeOpacity(source.borderOpacity, fallback.borderOpacity),
    icon: safeColor(source.icon, fallback.icon),
    activeIcon: safeColor(source.activeIcon, fallback.activeIcon),
    label: safeColor(source.label, fallback.label),
    activeLabel: safeColor(source.activeLabel, fallback.activeLabel),
    activePill: safeColor(source.activePill, fallback.activePill),
    activePillOpacity: safeOpacity(source.activePillOpacity, fallback.activePillOpacity),
  };
}

function normalizeCardPalette(value: unknown, fallback: CardPalette): CardPalette {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const TEXTURES = new Set(["none", "linen", "dots", "grid", "paper", "noise", "rings", "diamonds"]);
  const texture = typeof source.texture === "string" && TEXTURES.has(source.texture) ? (source.texture as CardPalette["texture"]) : fallback.texture;
  const contentTexture = typeof source.contentTexture === "string" && TEXTURES.has(source.contentTexture) ? (source.contentTexture as CardPalette["contentTexture"]) : fallback.contentTexture;
  const pattern = source.pattern === "diamond" || source.pattern === "frame" || source.pattern === "none" ? source.pattern : source.pattern === "monogram" ? "monogram" : fallback.pattern;
  return {
    backBg: safeColor(source.backBg, fallback.backBg),
    backImage: safeImage(source.backImage),
    texture,
    pattern,
    backBorder: safeColor(source.backBorder, fallback.backBorder),
    numberColor: safeColor(source.numberColor, fallback.numberColor),
    hintColor: safeColor(source.hintColor, fallback.hintColor),
    actionBg: safeColor(source.actionBg, fallback.actionBg),
    actionText: safeColor(source.actionText, fallback.actionText),
    contentBg: safeColor(source.contentBg, fallback.contentBg),
    contentBorder: safeColor(source.contentBorder, fallback.contentBorder),
    contentImage: safeImage(source.contentImage),
    contentTexture,
    // 旧配置没有该字段时用默认遮罩强度，保证可读性不回退。
    contentScrim: typeof source.contentScrim === "number" && Number.isFinite(source.contentScrim)
      ? Math.min(0.6, Math.max(0, source.contentScrim))
      : fallback.contentScrim,
    titleColor: safeColor(source.titleColor, fallback.titleColor),
    bodyColor: safeColor(source.bodyColor, fallback.bodyColor),
    chipBg: safeColor(source.chipBg, fallback.chipBg),
    chipBorder: safeColor(source.chipBorder, fallback.chipBorder),
    accent: safeColor(source.accent, fallback.accent),
  };
}

export function normalizeBottomBar(value: unknown): BottomBarConfig {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const icons: BottomBarConfig["icons"] = {};
  const rawIcons = (source.icons && typeof source.icons === "object" ? source.icons : {}) as Record<string, unknown>;
  for (const slot of DECOR_ICON_SLOTS) {
    if (!rawIcons[slot]) continue;
    const icon = safeIcon(rawIcons[slot]);
    if (icon.normal || icon.active) icons[slot] = icon;
  }
  const publish = (source.publish && typeof source.publish === "object" ? source.publish : {}) as Record<string, unknown>;
  return {
    mode: source.mode === "split" ? "split" : "follow",
    dark: normalizeBar(source.dark, DARK_BAR),
    light: normalizeBar(source.light, LIGHT_BAR),
    icons,
    publish: {
      bg: safeColor(publish.bg, DEFAULT_BOTTOM_BAR.publish.bg),
      icon: safeColor(publish.icon, DEFAULT_BOTTOM_BAR.publish.icon),
      iconUrl: safeImage(publish.iconUrl) || undefined,
      tinted: publish.tinted === true,
    },
    // 旧配置缺少该字段时保持原来的文字显示状态（显示文字）。
    showLabel: source.showLabel === false ? false : true,
  };
}

export function normalizeCard(value: unknown): CardConfig {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    mode: source.mode === "split" ? "split" : "follow",
    dark: normalizeCardValue(source.dark, DARK_CARD),
    light: normalizeCardValue(source.light, LIGHT_CARD),
  };
}

function normalizeCardValue(value: unknown, fallback: CardPalette): CardPalette {
  return normalizeCardPalette(value, fallback);
}

export function normalizeDecor(value: unknown): DecorConfig {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    version: 1,
    bottomBar: normalizeBottomBar(source.bottomBar),
    card: normalizeCard(source.card),
  };
}

export function mergeDecor(base: DecorConfig, patch: unknown): DecorConfig {
  const source = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  return normalizeDecor({
    bottomBar: { ...base.bottomBar, ...(source.bottomBar as object || {}) },
    card: { ...base.card, ...(source.card as object || {}) },
  });
}

export function paletteFor<T>(config: { mode: "follow" | "split"; dark: T; light: T }, mode: DecorMode): T {
  return config.mode === "split" ? config[mode] : config.dark;
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000})`;
}

export function isDarkMode(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.dataset.theme !== "light";
}
