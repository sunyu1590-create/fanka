/**
 * 合集封面渲染引擎。
 *
 * 设计要点：
 * 1. 纯程序化排版，不调用任何生成式模型，不消耗 Token。
 * 2. 输出 600×800（3:4）静态 PNG，服务端渲染一次即落库，列表页不再重复计算。
 * 3. 同一合集在生成参数不变时结果稳定（种子由合集 id + 参数哈希得出）。
 * 4. 中文排版自行测量字宽并折行，不依赖 SVG 的自动换行。
 */
import { execFileSync } from "node:child_process";
import sharp from "sharp";

export const COVER_WIDTH = 600;
export const COVER_HEIGHT = 800;

export type CoverPalette = { bg: string; ink: string; accent: string; muted: string };

export type CoverTemplate = {
  id: string;
  name: string;
  category: string;
  render_type: string;
  palette: Partial<CoverPalette> | null;
  params: Record<string, unknown> | null;
  editable: Record<string, boolean> | null;
  version?: number;
  enabled?: boolean;
  sortOrder?: number;
  isDefault?: boolean;
  previewPath?: string | null;
};

export type CoverSpec = {
  templateId: string;
  templateVersion: number;
  renderType: string;
  category: string;
  title: string;
  subtitle: string;
  palette: CoverPalette;
  params: Record<string, unknown>;
  seed: number;
  index: string;
};

export type CoverSourceSeries = {
  id: string;
  title: string;
  description?: string | null;
  kind?: string | null;
  channel?: string | null;
  categoryName?: string | null;
  chapters?: number;
  tags?: string[];
};

const KIND_LABEL: Record<string, string> = { serial: "连载", tutorial: "教程", resource: "资源" };

const pad2 = (value: number) => String(Math.abs(value) % 100).padStart(2, "0");

/** 稳定种子：同一输入永远得到同一序列，避免同一合集每次打开都换一张脸。 */
export function seedFrom(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const isWide = (code: number) =>
  (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xff60) || (code >= 0x3000 && code <= 0x303f);

/** 字宽估算：全角按 1em，拉丁按比例，够用且不依赖字体度量。 */
export function measure(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    if (isWide(code)) width += 1;
    else if (char === " ") width += 0.3;
    else if (/[iIl1.,:;'!|]/.test(char)) width += 0.28;
    else if (/[A-Z@%&WM]/.test(char)) width += 0.68;
    else width += 0.55;
  }
  return width * fontSize;
}

const NO_BREAK_BEFORE = new Set(["。", "，", "、", "；", "：", "？", "！", "）", "》", "」", "』", "”", "’", ",", ".", ";", ":", "?", "!", ")", "]", "}"]);

/**
 * 完整折行：按字宽断行，英文单词不被拦腰截断，标点不落到行首。
 * 返回全部行，不做行数限制，供字号搜索使用。
 */
export function wrapAll(text: string, maxWidth: number, fontSize: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chars = [...clean];
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < chars.length) {
    let end = cursor;
    let width = 0;
    while (end < chars.length) {
      const charWidth = measure(chars[end], fontSize);
      if (width + charWidth > maxWidth && end > cursor) break;
      width += charWidth;
      end += 1;
    }
    // 断点落在英文单词中间时回退到词边界，避免 "Pro" / "mpt" 这种切断。
    if (end < chars.length && /[A-Za-z0-9]/.test(chars[end]) && /[A-Za-z0-9]/.test(chars[end - 1])) {
      let back = end;
      while (back > cursor + 1 && /[A-Za-z0-9]/.test(chars[back - 1])) back -= 1;
      if (back > cursor + 1) end = back;
    }
    // 标点不在行首：把上一行末字一起带下来（至少保留两个字）。
    while (end > cursor + 2 && NO_BREAK_BEFORE.has(chars[end])) end -= 1;
    lines.push(chars.slice(cursor, end).join("").trim());
    cursor = end;
  }
  return lines.filter(Boolean);
}

/** 超出行数后省略，绝不溢出封面边界。 */
export function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const lines = wrapAll(text, maxWidth, fontSize);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s，。、；：·]$/, "")}…`;
  return kept;
}

/**
 * 标题字号：从阶梯值向下搜索，要求不出现孤字行、且整块能放进预留区域。
 * 宁可小一点，也不要出现「内容 / 包」这种单字尾行。
 */
function fitTitle(
  title: string,
  maxWidth: number,
  regionHeight: number,
  maxLines = 4,
): { size: number; lines: string[] } {
  const length = [...title].length;
  const ladder = length <= 4 ? 108 : length <= 6 ? 92 : length <= 9 ? 78 : length <= 13 ? 62 : length <= 18 ? 52 : length <= 26 ? 44 : 38;
  // 一行能放下就一行：中文折行很容易把「实战」「验收」这类两字词拆开，
  // 读起来像排版错误。宁可整体缩一号，也不要把标题切成两截。
  // 英文标题不适用：折行本身按词边界走，缩小反而让标题失去分量。
  const hasCjk = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(title);
  if (hasCjk) {
    const unitWidth = Math.max(measure(title, 1), 0.001);
    const singleSize = Math.floor(maxWidth / unitWidth);
    if (singleSize >= Math.round(ladder * 0.55)) {
      const size = Math.min(ladder, singleSize);
      if (size * 1.26 <= regionHeight) return { size, lines: [title] };
    }
  }
  // 一行放不下（或会缩得太小）：从最大字号开始折行，逐级收小直到行数与高度都成立。
  for (let size = ladder; size >= 26; size -= 2) {
    const lines = wrapAll(title, maxWidth, size);
    if (!lines.length) return { size, lines: [title] };
    if (lines.length > maxLines) continue;
    const orphan = lines.length > 1 && lines.some((line) => [...line].length < 3);
    if (orphan) continue;
    if (lines.length * size * 1.26 <= regionHeight) return { size, lines };
  }
  return { size: 26, lines: wrapAll(title, maxWidth, 26).slice(0, maxLines) };
}

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FONT_STACK = "'Heika Sans','Noto Sans CJK SC','Noto Sans SC','Source Han Sans SC',sans-serif";
const SERIF_STACK = "'Noto Serif CJK SC','Noto Serif SC','Songti SC',serif";

type TextBlock = { lines: string[]; size: number; lineHeight: number; x: number; y: number; fill: string; weight: number; align: "left" | "center"; letterSpacing?: number };

function textSvg(block: TextBlock, fontFamily = FONT_STACK) {
  const anchor = block.align === "center" ? "middle" : "start";
  return block.lines
    .map((line, index) => {
      const y = block.y + index * block.lineHeight;
      return `<text x="${block.x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${fontFamily}" font-size="${block.size}" font-weight="${block.weight}" fill="${block.fill}" text-anchor="${anchor}"${block.letterSpacing ? ` letter-spacing="${block.letterSpacing}"` : ""}>${esc(line)}</text>`;
    })
    .join("");
}

/** 顶部小字编号 / 分类标签，保持各模板一致的层级感。 */
function kickerSvg(text: string, x: number, y: number, color: string, align: "left" | "center" = "left", size = 19) {
  if (!text) return "";
  return `<text x="${x}" y="${y}" font-family="${FONT_STACK}" font-size="${size}" font-weight="600" fill="${color}" letter-spacing="3.2" text-anchor="${align === "center" ? "middle" : "start"}">${esc(text)}</text>`;
}

function brandSvg(color: string, y = COVER_HEIGHT - 44, x = 56, align: "left" | "center" = "left") {
  return `<text x="${x}" y="${y}" font-family="${FONT_STACK}" font-size="17" font-weight="700" fill="${color}" letter-spacing="5.4" text-anchor="${align === "center" ? "middle" : "start"}">HEIKA</text>`;
}

// ---------- 背景层：六个系列各自的静态图形语言 ----------

function swissBackdrop(palette: CoverPalette, params: Record<string, unknown>, seed: number) {
  const layout = String(params.layout || "stack");
  const accent = palette.accent;
  const parts: string[] = [];
  if (layout === "grid") {
    // 三栏网格：竖线贯穿整张，是这套版式的骨架，透明度足够低不影响阅读。
    for (let index = 1; index < 3; index += 1) {
      parts.push(`<rect x="${(COVER_WIDTH / 3) * index}" y="0" width="1.4" height="${COVER_HEIGHT}" fill="${palette.ink}" opacity="0.10"/>`);
    }
    parts.push(`<rect x="0" y="196" width="${COVER_WIDTH}" height="1.4" fill="${palette.ink}" opacity="0.16"/>`);
  } else if (layout === "index") {
    parts.push(`<rect x="56" y="176" width="${COVER_WIDTH - 112}" height="2" fill="${accent}"/>`);
    // 档案编号排在右侧窄列，不与标题抢同一块横向空间。
    for (let index = 0; index < 11; index += 1) {
      parts.push(`<text x="${COVER_WIDTH - 56}" y="${262 + index * 46}" font-family="${FONT_STACK}" font-size="13" fill="${palette.muted}" opacity="0.75" text-anchor="end">${pad2(index + 1)}</text>`);
      parts.push(`<rect x="${COVER_WIDTH - 96}" y="${257 + index * 46}" width="24" height="1" fill="${palette.muted}" opacity="0.3"/>`);
    }
  } else if (layout === "bar") {
    parts.push(`<rect x="0" y="${COVER_HEIGHT - 110}" width="${COVER_WIDTH}" height="110" fill="${palette.ink}" opacity="0.07"/>`);
    parts.push(`<rect x="56" y="196" width="132" height="9" fill="${accent}"/>`);
  } else if (layout === "airy") {
    parts.push(`<circle cx="${COVER_WIDTH - 104}" cy="120" r="${64 + (seed % 22)}" fill="none" stroke="${accent}" stroke-width="1.3" opacity="0.45"/>`);
    parts.push(`<rect x="56" y="196" width="46" height="2" fill="${palette.ink}" opacity="0.5"/>`);
  } else if (layout === "offset") {
    parts.push(`<rect x="${COVER_WIDTH * 0.46}" y="0" width="${COVER_WIDTH * 0.54}" height="150" fill="${accent}" opacity="0.13"/>`);
    parts.push(`<rect x="56" y="196" width="${COVER_WIDTH - 112}" height="2" fill="${palette.ink}" opacity="0.4"/>`);
  } else {
    parts.push(`<rect x="56" y="196" width="${COVER_WIDTH - 112}" height="2" fill="${palette.ink}" opacity="0.4"/>`);
    parts.push(`<rect x="56" y="199" width="92" height="9" fill="${accent}"/>`);
  }
  return parts.join("");
}

function glassBackdrop(palette: CoverPalette, params: Record<string, unknown>, seed: number) {
  const shape = String(params.shape || "prism");
  const rotate = (seed % 34) - 17;
  const defs = `
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.accent}" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="${palette.accent}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${palette.ink}" stop-opacity="0.06"/>
    </linearGradient>
    <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.ink}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${palette.accent}" stop-opacity="0.16"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.66" cy="0.26" r="0.58">
      <stop offset="0" stop-color="${palette.accent}" stop-opacity="0.26"/>
      <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.bg}" stop-opacity="0"/>
      <stop offset="1" stop-color="${palette.bg}" stop-opacity="0.92"/>
    </linearGradient>`;
  const body = (() => {
    if (shape === "sphere") {
      return `<circle cx="392" cy="240" r="132" fill="url(#g1)" opacity="0.46"/><circle cx="392" cy="240" r="132" fill="none" stroke="${palette.ink}" stroke-width="1.2" opacity="0.32"/><ellipse cx="350" cy="192" rx="46" ry="30" fill="${palette.ink}" opacity="0.2" transform="rotate(-24 350 192)"/>`;
    }
    if (shape === "slice") {
      return `<g transform="rotate(${rotate} 400 250)"><rect x="262" y="112" width="276" height="276" fill="url(#g2)" opacity="0.4"/><rect x="262" y="112" width="276" height="276" fill="none" stroke="${palette.accent}" stroke-width="1.3" opacity="0.5"/></g>`;
    }
    if (shape === "stairs") {
      return Array.from({ length: 4 }, (_, index) => `<rect x="${286 + index * 40}" y="${356 - index * 62}" width="72" height="${62 + index * 20}" fill="url(#g1)" opacity="${0.46 - index * 0.07}"/>`).join("");
    }
    return `<g transform="rotate(${rotate} 400 260)"><polygon points="400,104 528,352 272,352" fill="url(#g1)" opacity="0.5"/><polygon points="400,104 528,352 272,352" fill="none" stroke="${palette.ink}" stroke-width="1.2" opacity="0.36"/><polygon points="400,200 462,340 338,340" fill="${palette.accent}" opacity="0.24"/></g>`;
  })();
  // 底部渐隐：图形再亮也不影响下半部标题的可读性。
  return `<defs>${defs}</defs><rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="url(#glow)"/>${body}<rect x="0" y="${COVER_HEIGHT * 0.44}" width="${COVER_WIDTH}" height="${COVER_HEIGHT * 0.56}" fill="url(#fade)"/>`;
}

function magazineBackdrop(palette: CoverPalette, params: Record<string, unknown>) {
  const layout = String(params.layout || "full");
  if (layout === "frame") {
    return `<rect x="34" y="34" width="${COVER_WIDTH - 68}" height="${COVER_HEIGHT - 68}" fill="none" stroke="${palette.muted}" stroke-width="1.2" opacity="0.55"/>`;
  }
  if (layout === "split") {
    return `<rect x="0" y="0" width="${COVER_WIDTH}" height="${COVER_HEIGHT * 0.52}" fill="${palette.accent}" opacity="0.14"/>`;
  }
  return "";
}

function minimalBackdrop(palette: CoverPalette, params: Record<string, unknown>) {
  if (params.tag) {
    // 色块标签跟随 kicker 行，不落到标题区。
    return `<rect x="196" y="78" width="74" height="26" rx="4" fill="${palette.accent}" opacity="0.9"/>`;
  }
  return `<rect x="56" y="${COVER_HEIGHT - 96}" width="${COVER_WIDTH - 112}" height="1.4" fill="${palette.ink}" opacity="0.14"/>`;
}

function literaryBackdrop(palette: CoverPalette, params: Record<string, unknown>, seed: number) {
  const texture = String(params.texture || "paper");
  let grain = "";
  if (texture === "paper") {
    // 用确定性噪点模拟纸张纤维，避免每次生成都不一样。
    let dots = "";
    for (let index = 0; index < 240; index += 1) {
      const x = ((seed >> 3) + index * 97) % COVER_WIDTH;
      const y = ((seed >> 5) + index * 61) % COVER_HEIGHT;
      dots += `<circle cx="${x}" cy="${y}" r="0.9" fill="${palette.ink}" opacity="0.05"/>`;
    }
    grain = dots;
  } else {
    grain = `<ellipse cx="300" cy="180" rx="320" ry="180" fill="${palette.ink}" opacity="0.045"/>`;
  }
  return `${grain}<rect x="56" y="${COVER_HEIGHT - 96}" width="${COVER_WIDTH - 112}" height="1" fill="${palette.ink}" opacity="0.2"/>`;
}

function creativeBackdrop(palette: CoverPalette, params: Record<string, unknown>, seed: number) {
  const shape = String(params.shape || "arc");
  const rotation = seed % 26;
  if (shape === "grid") {
    return Array.from({ length: 5 }, (_, index) => `<rect x="${56 + index * 100}" y="96" width="1.2" height="230" fill="${palette.ink}" opacity="0.10"/>`).join("")
      + `<circle cx="470" cy="190" r="52" fill="${palette.accent}" opacity="0.2"/>`;
  }
  if (shape === "fragments") {
    return Array.from({ length: 5 }, (_, index) => {
      const x = 260 + ((seed >> (index + 1)) % 250);
      const y = 96 + ((seed >> (index + 2)) % 190);
      return `<rect x="${x}" y="${y}" width="${30 + index * 11}" height="${30 + index * 8}" fill="${palette.accent}" opacity="${0.13 + index * 0.05}" transform="rotate(${rotation + index * 12} ${x} ${y})"/>`;
    }).join("");
  }
  return `<g transform="rotate(${rotation} 300 250)"><path d="M96 400 Q300 90 520 236" fill="none" stroke="${palette.accent}" stroke-width="22" opacity="0.26"/><path d="M96 434 Q300 138 520 282" fill="none" stroke="${palette.ink}" stroke-width="1.8" opacity="0.3"/></g>`;
}

function backdropFor(spec: CoverSpec) {
  switch (spec.renderType) {
    case "swiss": return swissBackdrop(spec.palette, spec.params, spec.seed);
    case "glass": return glassBackdrop(spec.palette, spec.params, spec.seed);
    case "magazine": return magazineBackdrop(spec.palette, spec.params);
    case "minimal": return minimalBackdrop(spec.palette, spec.params);
    case "literary": return literaryBackdrop(spec.palette, spec.params, spec.seed);
    case "creative": return creativeBackdrop(spec.palette, spec.params, spec.seed);
    default: return "";
  }
}

// ---------- 文字排版：按模板族分四种版式 ----------

function layoutFor(spec: CoverSpec) {
  const { renderType, params, palette, title, subtitle } = spec;
  const gutter = 56;
  // 瑞士编辑系列的 index 版式会在右侧排一条档案编号窄列（01…12），
  // 正文必须让出这条列宽，否则长标题会压到编号上；其余版式不预留。
  const rightColumn = renderType === "swiss" && String(params.layout || "") === "index" ? 64 : 0;
  const maxWidth = COVER_WIDTH - gutter * 2 - rightColumn;
  const serif = renderType === "literary";

  // 杂志满版图：文字压在图片下部，靠遮罩保证可读性。
  if (renderType === "magazine" && String(params.layout) !== "frame") {
    const region = 300;
    const { size, lines } = fitTitle(title, maxWidth, region, 3);
    const subLines = wrapText(subtitle, maxWidth, 22, 2);
    // 副标题贴着底部排：行数越多越要向上让位，否则第二行会压到品牌行。
    const bottom = COVER_HEIGHT - 96 - (subLines.length - 1) * 32;
    return {
      blocks: [
        { lines, size, lineHeight: size * 1.22, x: gutter, y: bottom - (lines.length - 1) * size * 1.22 - 46, fill: palette.ink, weight: 800, align: "left" as const },
        { lines: subLines, size: 22, lineHeight: 32, x: gutter, y: bottom, fill: palette.muted, weight: 500, align: "left" as const },
      ],
      kicker: { text: spec.index, x: gutter, y: 76, color: palette.ink },
      brandColor: palette.ink,
      overlay: true,
    };
  }

  if (renderType === "literary" && params.vertical) {
    const { size } = fitTitle(title, 300, 460, 2);
    const chars = [...title].slice(0, 14);
    const columnX = COVER_WIDTH - gutter - 40;
    const vertical = chars.map((char, index) => `<text x="${columnX}" y="${150 + index * (size * 1.06)}" font-family="${SERIF_STACK}" font-size="${size}" font-weight="600" fill="${palette.ink}" text-anchor="middle">${esc(char)}</text>`).join("");
    return {
      blocks: [{ lines: wrapText(subtitle, 190, 21, 6), size: 21, lineHeight: 34, x: gutter + 8, y: 168, fill: palette.muted, weight: 500, align: "left" as const }],
      kicker: { text: spec.index, x: gutter + 8, y: 96, color: palette.accent },
      brandColor: palette.accent,
      raw: vertical,
      serif: true,
    };
  }

  // 图形类模板（玻璃 / 创作实践）把标题压到下半部，上半部留给抽象图形。
  const topBlock = renderType === "glass" ? 418 : renderType === "creative" ? 380 : 258;
  const regionHeight = COVER_HEIGHT - topBlock - 128;
  const { size, lines } = fitTitle(title, maxWidth, regionHeight, 4);
  const subLines = wrapText(subtitle, maxWidth, 21, 2);
  const startY = topBlock + size;
  const centered = renderType === "minimal" && String(params.align) === "center";
  const x = centered ? COVER_WIDTH / 2 : gutter;
  const align = centered ? ("center" as const) : ("left" as const);

  return {
    blocks: [
      { lines, size, lineHeight: size * 1.26, x, y: startY, fill: palette.ink, weight: renderType === "minimal" ? 800 : 700, align },
      { lines: subLines, size: 21, lineHeight: 32, x, y: Math.min(startY + lines.length * size * 1.26 + 30, COVER_HEIGHT - 118 - (subLines.length - 1) * 32), fill: palette.muted, weight: 500, align },
    ],
    kicker: { text: spec.index, x, y: 96, color: palette.accent, align },
    brandColor: palette.muted,
    serif,
  };
}

function textLayer(spec: CoverSpec) {
  const layout = layoutFor(spec);
  const font = layout.serif ? SERIF_STACK : FONT_STACK;
  const overlay = layout.overlay
    ? `<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#000000" stop-opacity="0"/>
         <stop offset="0.42" stop-color="#000000" stop-opacity="0.28"/>
         <stop offset="0.72" stop-color="#000000" stop-opacity="0.72"/>
         <stop offset="1" stop-color="#000000" stop-opacity="0.88"/>
       </linearGradient></defs><rect x="0" y="${COVER_HEIGHT * 0.36}" width="${COVER_WIDTH}" height="${COVER_HEIGHT * 0.64}" fill="url(#shade)"/>`
    : "";
  const kicker = kickerSvg(layout.kicker.text, layout.kicker.x, layout.kicker.y, layout.kicker.color, (layout.kicker as { align?: "left" | "center" }).align || "left");
  const blocks = layout.blocks.map((block) => textSvg(block, font)).join("");
  const raw = "raw" in layout && layout.raw ? layout.raw : "";
  return `${overlay}${kicker}${raw}${blocks}${brandSvg(layout.brandColor)}`;
}

// ---------- 信息提取：从真实合集字段推导，不编造事实 ----------

const KEYWORD_TEMPLATE: Array<{ test: RegExp; template: string; hint: string }> = [
  { test: /agent|智能体|mcp|skill|工作流|autogen|langchain/i, template: "glass-01", hint: "前沿技术" },
  { test: /prompt|提示词|提示工程/i, template: "glass-03", hint: "提示工程" },
  { test: /工具|效率|插件|合集|资源包/i, template: "swiss-03", hint: "资源合集" },
  { test: /教程|入门|实战|指南|手册|从零/i, template: "swiss-01", hint: "实战教程" },
  { test: /摄影|影像|电影|漫剧|视觉|镜头/i, template: "magazine-01", hint: "视觉创作" },
  { test: /文学|小说|散文|诗|随笔|故事/i, template: "literary-01", hint: "文学连载" },
  { test: /设计|排版|字体|美术|艺术/i, template: "creative-01", hint: "设计实践" },
  { test: /代码|coding|编程|开发|工程|python|javascript/i, template: "swiss-02", hint: "工程笔记" },
  { test: /科学|研究|探索|论文|科普/i, template: "swiss-05", hint: "知识档案" },
  { test: /deepseek|gpt|claude|gemini|模型|大模型|llm/i, template: "glass-02", hint: "模型专题" },
];

/** 依据合集真实字段推荐模板：标题 > 描述 > 频道。 */
export function suggestTemplateId(series: CoverSourceSeries): string {
  const haystack = `${series.title} ${series.description || ""} ${(series.tags || []).join(" ")} ${series.categoryName || ""}`;
  for (const rule of KEYWORD_TEMPLATE) if (rule.test.test(haystack)) return rule.template;
  if (series.channel === "ai") return "glass-01";
  if (series.kind === "resource") return "swiss-03";
  if (series.kind === "tutorial") return "swiss-01";
  return "minimal-01";
}

/** 副标题只使用合集里真实存在的信息，拼接顺序：分类 / 类型 / 篇数。 */
export function deriveSubtitle(series: CoverSourceSeries): string {
  const description = (series.description || "").trim();
  const firstSentence = description.split(/[。！？\n]/).map((item) => item.trim()).filter(Boolean)[0] || "";
  if (firstSentence && firstSentence.length >= 6) {
    return firstSentence.length > 30 ? `${firstSentence.slice(0, 30)}…` : firstSentence;
  }
  const parts: string[] = [];
  if (series.categoryName) parts.push(series.categoryName);
  // 没有简介时也要读得通：用「资源合集 / 教程合集」这类名词短语，
  // 而不是孤零零一个「资源」把封面下半部留空。
  const kind = KIND_LABEL[series.kind || ""] || "";
  parts.push(kind ? `${kind}合集` : "精选合集");
  if (series.chapters && series.chapters > 0) parts.push(`${series.chapters} 篇`);
  return parts.join(" · ");
}

/**
 * 超长文案截断：英文优先在词边界收敛，避免出现 "Productio" 这种半截词；
 * 中文按字数直接截断（汉字没有词边界问题），统一补省略号表示被截。
 */
function clampText(text: string, max: number): string {
  if ([...text].length <= max) return text;
  const chars = [...text].slice(0, max);
  const cut = chars.join("");
  const lastSpace = cut.lastIndexOf(" ");
  const keep = lastSpace >= Math.floor(max * 0.6) ? cut.slice(0, lastSpace) : cut;
  return `${keep.replace(/[\s,，、.。:：;；·\-—]+$/, "")}…`;
}

/** 封面右上角编号行的系列名：用完整单词，不再按字符数硬截断。 */
const CATEGORY_LABEL: Record<string, string> = {
  swiss: "SWISS",
  glass: "GLASS",
  magazine: "MAGAZINE",
  minimal: "MINIMAL",
  literary: "LITERARY",
  creative: "STUDIO",
};

export function buildSpec(
  series: CoverSourceSeries,
  template: CoverTemplate,
  overrides: { title?: string; subtitle?: string; palette?: string | null; pattern?: string | null; variant?: number } = {},
): CoverSpec {
  const base: CoverPalette = {
    bg: template.palette?.bg || "#F4F1EA",
    ink: template.palette?.ink || "#141414",
    accent: template.palette?.accent || "#1F4EF5",
    muted: template.palette?.muted || "#8A8578",
  };
  const variant = overrides.variant ?? 0;
  const seed = seedFrom(`${series.id}:${template.id}:${variant}`);
  // 变体只换装饰形态，不改配色语义，避免同一模板看起来像另一套设计。
  const patternPool = ["a", "b", "c", "d"];
  const pattern = overrides.pattern || patternPool[seed % patternPool.length];
  const params = { ...(template.params || {}) };
  if (pattern === "b" && "layout" in params) params.layout = ["grid", "index", "offset", "stack"][seed % 4];
  if (pattern === "c" && "shape" in params) params.shape = ["prism", "sphere", "slice", "stairs"][seed % 3];
  if (pattern === "d" && "texture" in params) params.texture = ["paper", "wash"][seed % 2];
  return {
    templateId: template.id,
    templateVersion: Number(template.version || 1),
    renderType: template.render_type,
    category: template.category,
    title: clampText((overrides.title || series.title || "未命名合集").trim(), 40),
    subtitle: clampText((overrides.subtitle ?? deriveSubtitle(series)).trim(), 60),
    palette: overrides.palette ? paletteFrom(base, overrides.palette) : base,
    params,
    seed,
    index: `${pad2((seed >>> 8) % 90 + 10)} / ${CATEGORY_LABEL[template.category || ""] || "HEIKA"}`,
  };
}

const PALETTE_PRESETS: Record<string, CoverPalette> = {
  paper: { bg: "#F4F1EA", ink: "#141414", accent: "#1F4EF5", muted: "#8A8578" },
  ink: { bg: "#0E0E10", ink: "#F5F3EE", accent: "#E8FF59", muted: "#7A776F" },
  graphite: { bg: "#15171A", ink: "#EDEFF2", accent: "#8EA7FF", muted: "#707784" },
  ocean: { bg: "#0C1014", ink: "#EAF6FF", accent: "#4FD6C8", muted: "#69808C" },
  dusk: { bg: "#101319", ink: "#EDF1FA", accent: "#B79BFF", muted: "#6E7488" },
  clay: { bg: "#F3E9E2", ink: "#231A15", accent: "#C2543B", muted: "#9A857A" },
  forest: { bg: "#101A15", ink: "#EAF7EE", accent: "#57E08C", muted: "#7C9A87" },
  mono: { bg: "#FFFFFF", ink: "#0F0F0F", accent: "#0F0F0F", muted: "#9C9C9C" },
};

export function paletteOptions(base: Partial<CoverPalette>) {
  return [{ key: "default", label: "模板默认", palette: base as CoverPalette }, ...Object.entries(PALETTE_PRESETS).map(([key, palette]) => ({ key, label: key, palette }))];
}

function paletteFrom(base: CoverPalette, key: string): CoverPalette {
  return PALETTE_PRESETS[key] || base;
}

// ---------- 输出 ----------

export function coverSvg(spec: CoverSpec) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}">
  <rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="${spec.palette.bg}"/>
  ${backdropFor(spec)}
  ${textLayer(spec)}
</svg>`;
}

export type RenderOptions = { image?: Buffer | null };

/** 渲染整张封面：底图 → 作品/上传图片 → 文字层。图片一律 cover 裁切，绝不拉伸。 */
/**
 * 中文字体自检：结果缓存一次，避免每张封面都起进程。
 *
 * 官方 node:slim 镜像不带 CJK 字体，缺字体时 librsvg 会把每个汉字画成方块，
 * 而且出图仍然「成功」。这种封面一旦落库就再也退不回去，所以宁可明确失败，
 * 让后台任务标记为「生成失败、可重试」，也不要静默产出一张全是豆腐块的图。
 */
let cjkFontReady: boolean | null = null;
export function hasCjkFont(): boolean {
  if (cjkFontReady !== null) return cjkFontReady;
  try {
    const family = execFileSync("fc-match", ["-f", "%{family}", "sans-serif:lang=zh-cn"], { timeout: 5000 })
      .toString()
      .trim();
    cjkFontReady = /noto|han|hei|song|pingfang|wenquanyi|droid|source han|思源|黑体|宋体/i.test(family);
    if (!cjkFontReady) console.warn("[series-cover] 未找到中文字体，fc-match 返回：", family);
  } catch {
    cjkFontReady = false;
    console.warn("[series-cover] 无法执行 fc-match，界面将无法生成中文封面");
  }
  return cjkFontReady;
}

export async function renderCover(spec: CoverSpec, options: RenderOptions = {}): Promise<Buffer> {
  if (!hasCjkFont()) {
    throw new Error("封面渲染缺少中文字体，请检查运行镜像是否安装了 Noto Sans CJK");
  }
  const base = await sharp(Buffer.from(coverSvg(spec))).png().toBuffer();
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (options.image && options.image.length) {
    try {
      const layout = String(spec.params.layout || "full");
      const box = layout === "split"
        ? { left: 0, top: 0, width: COVER_WIDTH, height: Math.round(COVER_HEIGHT * 0.52) }
        : layout === "frame"
          ? { left: 34, top: 34, width: COVER_WIDTH - 68, height: COVER_HEIGHT - 68 }
          : { left: 0, top: 0, width: COVER_WIDTH, height: COVER_HEIGHT };
      const fitted = await sharp(options.image)
        .resize(box.width, box.height, { fit: "cover", position: "attention" })
        .png()
        .toBuffer();
      layers.push({ input: fitted, left: box.left, top: box.top });
    } catch {
      // 图片不可解码时直接退回纯排版封面，不留空白也不报错。
    }
  }
  if (!layers.length) return base;
  const textOnly = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}">${textLayer(spec)}</svg>`),
  ).png().toBuffer();
  layers.push({ input: textOnly, left: 0, top: 0 });
  return sharp(base).composite(layers).png({ compressionLevel: 9, palette: false }).toBuffer();
}

/** 列表缩略图：与封面同源，仅缩放，不重新排版。 */
export async function coverThumbnails(source: Buffer) {
  const [thumbnail, retina] = await Promise.all([
    sharp(source).resize(300, 400, { fit: "cover" }).webp({ quality: 82 }).toBuffer(),
    sharp(source).resize(600, 800, { fit: "cover" }).webp({ quality: 86 }).toBuffer(),
  ]);
  return { thumbnail, retina };
}
