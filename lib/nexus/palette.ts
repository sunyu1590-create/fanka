/** HEIKA Nexus 三维配色：深石墨 + 金属灰 + 低饱和青蓝 + 品牌金。禁止大面积霓虹。 */

export type NexusPalette = {
  mode: "dark" | "light";
  background: number;
  fog: number;
  grid: number;
  gridStrong: number;
  metal: number;
  metalDark: number;
  ink: string;
  muted: string;
  panel: string;
  gold: number;
  goldCss: string;
  cyan: number;
  cyanCss: string;
  blue: number;
  blueCss: string;
  violet: number;
  violetCss: string;
  green: number;
  greenCss: string;
  amber: number;
  amberCss: string;
  red: number;
  redCss: string;
  neutral: number;
  neutralCss: string;
  link: number;
  linkDim: number;
};

export function paletteFor(mode: "dark" | "light"): NexusPalette {
  if (mode === "light") {
    return {
      mode,
      background: 0xe9edee,
      fog: 0xe9edee,
      grid: 0xc3cbcd,
      gridStrong: 0xaab5b8,
      metal: 0xb9c2c4,
      metalDark: 0x8d999c,
      ink: "#1d2427",
      muted: "#5c686c",
      panel: "rgba(250,251,249,.86)",
      gold: 0x9a7a24,
      goldCss: "#8a6d2f",
      cyan: 0x2b8796,
      cyanCss: "#22707c",
      blue: 0x3b74b8,
      blueCss: "#2f629e",
      violet: 0x6d5fb0,
      violetCss: "#5b4e99",
      green: 0x2f8f72,
      greenCss: "#267a60",
      amber: 0xb27b1f,
      amberCss: "#9a6a18",
      red: 0xb84444,
      redCss: "#a33838",
      neutral: 0x7b878a,
      neutralCss: "#667175",
      link: 0x7d969c,
      linkDim: 0xb7c2c5,
    };
  }
  return {
    mode,
    background: 0x0a0e11,
    fog: 0x0a0e11,
    grid: 0x1a2328,
    gridStrong: 0x243238,
    metal: 0x6d7a80,
    metalDark: 0x39464c,
    ink: "#e9eff2",
    muted: "#93a3ab",
    panel: "rgba(13,18,21,.78)",
    gold: 0xc9a54a,
    goldCss: "#c9a54a",
    cyan: 0x54b9c8,
    cyanCss: "#65c6d4",
    blue: 0x5a92d6,
    blueCss: "#6ba1e2",
    violet: 0x9283d8,
    violetCss: "#a294e4",
    green: 0x54bf9c,
    greenCss: "#66cfa9",
    amber: 0xd3a24a,
    amberCss: "#e0b05a",
    red: 0xd6605f,
    redCss: "#e57372",
    neutral: 0x7d8a90,
    neutralCss: "#95a2a8",
    link: 0x3c6670,
    linkDim: 0x243c44,
  };
}

export const LINK_COLORS: Record<string, "blue" | "cyan" | "violet" | "gold" | "green" | "neutral"> = {
  http: "blue",
  api: "blue",
  data: "cyan",
  media: "gold",
  ai: "violet",
  auth: "green",
  realtime: "violet",
  probe: "neutral",
};

export const KIND_TONE: Record<string, "cyan" | "blue" | "violet" | "gold" | "green" | "neutral" | "amber"> = {
  client: "blue",
  gateway: "blue",
  server: "cyan",
  database: "cyan",
  storage: "gold",
  ai: "violet",
  worker: "violet",
  auth: "green",
  realtime: "violet",
  monitor: "neutral",
  external: "gold",
};
