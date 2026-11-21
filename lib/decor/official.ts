import {
  DEFAULT_BOTTOM_BAR,
  DEFAULT_CARD,
  normalizeDecor,
  type BottomBarPalette,
  type CardPalette,
  type DecorConfig,
  type DecorIcon,
  type DecorIconSlot,
} from "./types";

export type OfficialPreset = {
  slug: string;
  title: string;
  description: string;
  kind: "bundle" | "bottom" | "card";
  tags: string[];
  config: DecorConfig;
};

const pack = (name: string, slots: DecorIconSlot[] = ["home", "discover", "messages", "mine"]) => {
  const icons: Partial<Record<DecorIconSlot, DecorIcon>> = {};
  for (const slot of slots) {
    icons[slot] = {
      normal: `/decor/${name}/${slot}.png`,
      active: `/decor/${name}/${slot}-active.png`,
      // 官方图标是单色透明蒙版：颜色跟随主题，深浅色都不会失去对比度。
      tint: true,
      scale: 1,
      fit: "contain",
      trim: true,
    };
  }
  return icons;
};

function bar(dark: Partial<BottomBarPalette>, light: Partial<BottomBarPalette>): DecorConfig["bottomBar"] {
  return {
    ...DEFAULT_BOTTOM_BAR,
    mode: "split",
    dark: { ...DEFAULT_BOTTOM_BAR.dark, ...dark },
    light: { ...DEFAULT_BOTTOM_BAR.light, ...light },
    icons: {},
  };
}

function card(dark: Partial<CardPalette>, light: Partial<CardPalette>): DecorConfig["card"] {
  return {
    ...DEFAULT_CARD,
    mode: "split",
    dark: { ...DEFAULT_CARD.dark, ...dark },
    light: { ...DEFAULT_CARD.light, ...light },
  };
}

function build(bottomBar: DecorConfig["bottomBar"], cardConfig: DecorConfig["card"]): DecorConfig {
  return normalizeDecor({ bottomBar, card: cardConfig });
}

export const OFFICIAL_PRESETS: OfficialPreset[] = [
  {
    slug: "obsidian-native",
    title: "黑曜原生",
    description: "黑卡原生质感：深色玻璃底栏与黑曜卡背，克制、耐看。",
    kind: "bundle",
    tags: ["深色", "极简", "原生"],
    config: build(bar({}, {}), card({}, {})),
  },
  {
    slug: "letter-from-hills",
    title: "山野来信",
    description: "苔绿与米白的山野气息，像一封从林间寄来的信。",
    kind: "bundle",
    tags: ["自然", "绿色", "治愈"],
    config: build(
      bar(
        { bg: "#12160F", bgOpacity: 0.9, border: "#B8C9A0", borderOpacity: 0.16, icon: "#8E9A80", activeIcon: "#D8C68A", label: "#8E9A80", activeLabel: "#EFE3B8", activePill: "#7C8F5A", activePillOpacity: 0.22 },
        { bg: "#F6F5EC", bgOpacity: 0.95, border: "#3E4A32", borderOpacity: 0.12, icon: "#6C7562", activeIcon: "#4C5F34", label: "#6C7562", activeLabel: "#3F5029", activePill: "#7C8F5A", activePillOpacity: 0.14 },
      ),
      card(
        { backBg: "#151A12", backBorder: "#3B4632", numberColor: "#D5DFC2", hintColor: "#939C86", actionBg: "#C6D3A9", actionText: "#1A2114", contentBg: "#171C14", contentBorder: "#333D2B", titleColor: "#F0F1E4", bodyColor: "#BCC3AF", chipBg: "#1F261A", chipBorder: "#3A4630", accent: "#B9C98F", texture: "noise", pattern: "frame" },
        { backBg: "#EDEBDD", backBorder: "#C4BFA6", numberColor: "#4A4B3A", hintColor: "#7C7B65", actionBg: "#3A442C", actionText: "#F6F5EA", contentBg: "#FBFBF4", contentBorder: "#E2E0CE", titleColor: "#23261B", bodyColor: "#5C5F4E", chipBg: "#F0EFE0", chipBorder: "#DDDBC6", accent: "#6C7C46", texture: "noise", pattern: "frame" },
      ),
    ),
  },
  {
    slug: "silver-archive",
    title: "银白档案",
    description: "冷银灰与档案纸张，适合记录与整理。",
    kind: "bundle",
    tags: ["浅色", "档案", "理性"],
    config: build(
      bar(
        { bg: "#14161A", bgOpacity: 0.9, border: "#C9D2DC", borderOpacity: 0.14, icon: "#8B939E", activeIcon: "#DCE6F0", label: "#8B939E", activeLabel: "#EEF4FA", activePill: "#8FA3B8", activePillOpacity: 0.18 },
        { bg: "#F7F8FA", bgOpacity: 0.96, border: "#2A3038", borderOpacity: 0.1, icon: "#6E7683", activeIcon: "#2E3A48", label: "#6E7683", activeLabel: "#26313E", activePill: "#5B7086", activePillOpacity: 0.12 },
      ),
      card(
        { backBg: "#171A1F", backBorder: "#3A424D", numberColor: "#CBD5E1", hintColor: "#8D97A4", actionBg: "#D6DFEA", actionText: "#161A20", contentBg: "#191D23", contentBorder: "#2F363F", titleColor: "#F1F4F8", bodyColor: "#B9C1CC", chipBg: "#20262D", chipBorder: "#39414C", accent: "#A9B8C9", texture: "grid", pattern: "frame" },
        { backBg: "#F1F3F6", backBorder: "#C3CAD4", numberColor: "#3E4650", hintColor: "#737D89", actionBg: "#2B333D", actionText: "#F7F9FC", contentBg: "#FFFFFF", contentBorder: "#E1E5EB", titleColor: "#1A1F26", bodyColor: "#58616D", chipBg: "#F2F4F7", chipBorder: "#DDE2E9", accent: "#4F6379", texture: "grid", pattern: "frame" },
      ),
    ),
  },
  {
    slug: "mist-pine",
    title: "雾松底栏",
    description: "雾面松绿底栏，安静地待在屏幕底部。",
    kind: "bottom",
    tags: ["底栏", "绿色", "雾面"],
    config: build(
      {
        ...bar(
          { bg: "#0F1714", bgOpacity: 0.88, border: "#9EC0B0", borderOpacity: 0.18, icon: "#87A396", activeIcon: "#CFE6DA", label: "#87A396", activeLabel: "#E6F3EC", activePill: "#6E9A85", activePillOpacity: 0.24 },
          { bg: "#EFF5F1", bgOpacity: 0.95, border: "#2E4A3E", borderOpacity: 0.12, icon: "#5F7568", activeIcon: "#2F5443", label: "#5F7568", activeLabel: "#27493A", activePill: "#6E9A85", activePillOpacity: 0.16 },
        ),
        icons: pack("mist"),
      },
      DEFAULT_CARD,
    ),
  },
  {
    slug: "pixel-desk",
    title: "像素工作台",
    description: "八位机像素图标与硬边卡片，复古但不吵闹。",
    kind: "bundle",
    tags: ["像素", "复古", "图标"],
    config: build(
      { ...bar(
        { bg: "#0B0E14", bgOpacity: 0.94, border: "#7FD4C1", borderOpacity: 0.2, icon: "#7FA0A8", activeIcon: "#7FD4C1", label: "#7FA0A8", activeLabel: "#B6F2E4", activePill: "#2A4A46", activePillOpacity: 0.6 },
        { bg: "#F4F1E8", bgOpacity: 0.97, border: "#1E2A2A", borderOpacity: 0.14, icon: "#5C6B6B", activeIcon: "#1F5C52", label: "#5C6B6B", activeLabel: "#194A42", activePill: "#9FD8C8", activePillOpacity: 0.35 },
      ), icons: pack("pixel") },
      card(
        { backBg: "#0D1218", backBorder: "#3E5A5A", numberColor: "#8FE3D0", hintColor: "#6E8A88", actionBg: "#8FE3D0", actionText: "#0B1418", contentBg: "#101820", contentBorder: "#2C4444", titleColor: "#EAF6F2", bodyColor: "#A9C2BE", chipBg: "#142428", chipBorder: "#2F4A46", accent: "#8FE3D0", texture: "grid", pattern: "diamond" },
        { backBg: "#EFEBDE", backBorder: "#A9B5AC", numberColor: "#2C3A36", hintColor: "#6B7A74", actionBg: "#2C4A42", actionText: "#F2F7F3", contentBg: "#FBF9F1", contentBorder: "#DDD8C8", titleColor: "#1E2A26", bodyColor: "#54615B", chipBg: "#F1EDE0", chipBorder: "#D8D2C0", accent: "#2F6F5F", texture: "grid", pattern: "diamond" },
      ),
    ),
  },
  {
    slug: "paper-notes",
    title: "手绘便签",
    description: "便签纸质感与手写线条，轻轻贴在主页上。",
    kind: "bundle",
    tags: ["手绘", "便签", "暖色"],
    config: build(
      { ...bar(
        { bg: "#1A1512", bgOpacity: 0.92, border: "#E0C9A6", borderOpacity: 0.18, icon: "#A89484", activeIcon: "#F0D9B5", label: "#A89484", activeLabel: "#FBEED8", activePill: "#C9A961", activePillOpacity: 0.2 },
        { bg: "#FBF4E6", bgOpacity: 0.97, border: "#4A3B2A", borderOpacity: 0.1, icon: "#7A6A56", activeIcon: "#6B4B1F", label: "#7A6A56", activeLabel: "#5C3F16", activePill: "#C08A3E", activePillOpacity: 0.18 },
      ), icons: pack("paper") },
      card(
        { backBg: "#211A14", backBorder: "#5C4A38", numberColor: "#EBD6B4", hintColor: "#A08D76", actionBg: "#E7CFA6", actionText: "#241B12", contentBg: "#221B15", contentBorder: "#403327", titleColor: "#F7EFE1", bodyColor: "#C9BBA7", chipBg: "#2A2119", chipBorder: "#453728", accent: "#D9B679", texture: "linen", pattern: "none" },
        { backBg: "#F7EEDC", backBorder: "#D8C6A6", numberColor: "#5B4732", hintColor: "#8B7862", actionBg: "#3B2D20", actionText: "#FBF4E7", contentBg: "#FDF8ED", contentBorder: "#E8DAC2", titleColor: "#2A2118", bodyColor: "#655744", chipBg: "#F6EEDF", chipBorder: "#E4D5BB", accent: "#9A6B2F", texture: "linen", pattern: "none" },
      ),
    ),
  },
];

export const OFFICIAL_BY_SLUG = new Map(OFFICIAL_PRESETS.map((preset) => [preset.slug, preset]));

/** 官方预设的资源地址都在本站 /decor/*，换 CDN 或路径时只需改这里。 */
export function presetConfig(slug: string | null | undefined): DecorConfig | null {
  if (!slug) return null;
  return OFFICIAL_BY_SLUG.get(slug)?.config ?? null;
}
