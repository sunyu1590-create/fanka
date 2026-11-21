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
    // A 黑曜原生（需求十一 A）：Lucide 线性 1.9 描边，延续黑卡原生品牌。
    slug: "obsidian-native",
    title: "黑曜原生",
    description: "黑卡原生质感：黑曜底栏与淡金选中，克制、耐看。",
    kind: "bundle",
    tags: ["深色", "极简", "原生"],
    config: build(
      {
        ...bar(
          { bg: "#171A1E", bgOpacity: 0.94, border: "#5A6068", borderOpacity: 0.32, icon: "#A7ADB4", activeIcon: "#D8C28D", label: "#A7ADB4", activeLabel: "#E9D9AE", activePill: "#D8C28D", activePillOpacity: 0.12 },
          { bg: "#F4F4F1", bgOpacity: 0.95, border: "#5A6068", borderOpacity: 0.22, icon: "#6B7178", activeIcon: "#8A6E28", label: "#6B7178", activeLabel: "#6B5416", activePill: "#C9A961", activePillOpacity: 0.14 },
        ),
        icons: pack("obsidian"),
      },
      card(
        { backBg: "#1C2227", backBorder: "#5A6068", numberColor: "#C9D5DA", hintColor: "#A5ADB3", actionBg: "#D8C28D", actionText: "#242016", contentBg: "#171B20", contentBorder: "#2C3238", titleColor: "#F2F1EB", bodyColor: "#A5ADB3", chipBg: "#1F252B", chipBorder: "#2C3238", accent: "#D8C28D", texture: "linen", pattern: "monogram" },
        { backBg: "#EDEBE4", backBorder: "#A8A395", numberColor: "#4B463D", hintColor: "#7A7468", actionBg: "#242016", actionText: "#F2F1EB", contentBg: "#FBFAF7", contentBorder: "#E0DCD2", titleColor: "#242220", bodyColor: "#5C5F66", chipBg: "#F2F0EA", chipBorder: "#E0DCD2", accent: "#8A6E28", texture: "linen", pattern: "monogram" },
      ),
    ),
  },
  {
    // B 雾松漫游（需求十一 B）：Tabler 线性/填充配对，自然磨砂。
    slug: "mist-pine",
    title: "雾松漫游",
    description: "松绿磨砂底栏与雾面卡背，像走进清晨的针叶林。",
    kind: "bundle",
    tags: ["自然", "绿色", "磨砂"],
    config: build(
      {
        ...bar(
          { bg: "#18231F", bgOpacity: 0.92, border: "#6E8879", borderOpacity: 0.34, icon: "#A4B9AD", activeIcon: "#C4DEC9", label: "#A4B9AD", activeLabel: "#E6F3EC", activePill: "#C4DEC9", activePillOpacity: 0.12 },
          { bg: "#F0F5F1", bgOpacity: 0.95, border: "#6E8879", borderOpacity: 0.22, icon: "#5F7568", activeIcon: "#2F5443", label: "#5F7568", activeLabel: "#27493A", activePill: "#6E9A85", activePillOpacity: 0.14 },
        ),
        icons: pack("ramble"),
      },
      card(
        { backBg: "#23392D", backBorder: "#6E8879", numberColor: "#C4DEC9", hintColor: "#A8BAAC", actionBg: "#C4DEC9", actionText: "#203126", contentBg: "#192820", contentBorder: "#2E4A3E", titleColor: "#EDF3E9", bodyColor: "#A8BAAC", chipBg: "#1E3227", chipBorder: "#2E4A3E", accent: "#C4DEC9", texture: "noise", pattern: "frame" },
        { backBg: "#DCE7DF", backBorder: "#9DB5A8", numberColor: "#2E4A3E", hintColor: "#67796E", actionBg: "#203126", actionText: "#EDF3E9", contentBg: "#F4F8F4", contentBorder: "#D3E0D7", titleColor: "#203126", bodyColor: "#5C6E63", chipBg: "#EAF1EC", chipBorder: "#D3E0D7", accent: "#3D6B52", texture: "noise", pattern: "frame" },
      ),
    ),
  },
  {
    // C 银白档案（需求十一 C）：浅绿灰档案感，深色档单独设计而非反相。
    slug: "silver-archive",
    title: "银白档案",
    description: "档案纸与银灰书架，浅色清晰，深色温和。",
    kind: "bundle",
    tags: ["浅色", "档案", "理性"],
    config: build(
      bar(
        { bg: "#171B19", bgOpacity: 0.93, border: "#48574E", borderOpacity: 0.3, icon: "#93A39A", activeIcon: "#C8D8CE", label: "#93A39A", activeLabel: "#E4EDE7", activePill: "#355A45", activePillOpacity: 0.34 },
        { bg: "#F0F3EE", bgOpacity: 0.96, border: "#B5C0B7", borderOpacity: 0.5, icon: "#65746B", activeIcon: "#2D5140", label: "#65746B", activeLabel: "#2D5140", activePill: "#355A45", activePillOpacity: 0.12 },
      ),
      card(
        { backBg: "#1B211E", backBorder: "#48574E", numberColor: "#C8D8CE", hintColor: "#8FA097", actionBg: "#C8D8CE", actionText: "#1A221D", contentBg: "#171C19", contentBorder: "#2A332E", titleColor: "#E8EFEA", bodyColor: "#A7B5AC", chipBg: "#1F2723", chipBorder: "#2A332E", accent: "#8FB39F", texture: "grid", pattern: "frame" },
        { backBg: "#DCE4DB", backBorder: "#B5C0B7", numberColor: "#2D5140", hintColor: "#66766B", actionBg: "#355A45", actionText: "#FFFFFF", contentBg: "#F8FAF5", contentBorder: "#D8E0D7", titleColor: "#25352B", bodyColor: "#66766B", chipBg: "#EDF2EA", chipBorder: "#D8E0D7", accent: "#355A45", texture: "grid", pattern: "frame" },
      ),
    ),
  },
  {
    // D 月下电台（需求十一 D）：Phosphor Regular/Fill 双音，柔和不闪烁。
    slug: "moon-radio",
    title: "月下电台",
    description: "深夜电台的靛蓝与月光紫，柔和双音，安静收听。",
    kind: "bundle",
    tags: ["深色", "蓝紫", "柔和"],
    config: build(
      bar(
        { bg: "#202235", bgOpacity: 0.93, border: "#747995", borderOpacity: 0.32, icon: "#A9AEC8", activeIcon: "#D4CFF0", label: "#A9AEC8", activeLabel: "#EDEBFA", activePill: "#D4CFF0", activePillOpacity: 0.12 },
        { bg: "#F2F2F8", bgOpacity: 0.95, border: "#747995", borderOpacity: 0.22, icon: "#6B7090", activeIcon: "#4B4E86", label: "#6B7090", activeLabel: "#3A3D6B", activePill: "#747995", activePillOpacity: 0.14 },
      ),
      card(
        { backBg: "#292D46", backBorder: "#747995", numberColor: "#D4CFF0", hintColor: "#ADB1CA", actionBg: "#D4CFF0", actionText: "#28283B", contentBg: "#1C2031", contentBorder: "#3A3F5C", titleColor: "#F0EFF8", bodyColor: "#ADB1CA", chipBg: "#242840", chipBorder: "#3A3F5C", accent: "#D4CFF0", texture: "rings", pattern: "none" },
        { backBg: "#DCDAEE", backBorder: "#A9A8C9", numberColor: "#3A3D6B", hintColor: "#737795", actionBg: "#28283B", actionText: "#F0EFF8", contentBg: "#F7F6FC", contentBorder: "#E2E0F0", titleColor: "#28283B", bodyColor: "#666A8A", chipBg: "#EDEBF7", chipBorder: "#E2E0F0", accent: "#4B4E86", texture: "rings", pattern: "none" },
      ),
    ),
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
