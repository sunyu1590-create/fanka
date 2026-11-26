"use client";

/**
 * 三维信息标签：固态玻璃浮层 + 分层信息密度 + 引导线。
 *
 * 旧实现是固定 124×36 的黑色圆角块，远近一个样，靠近后文字糊、远了读不到。
 * 这里改为：
 * - 标签尺寸随镜头距离等比放大，屏幕像素高度基本恒定（引擎每帧算 scale）；
 * - 三个信息层级：远=名称，中=名称+核心指标，近/选中=名称+指标+类型；
 * - 独立的细引导线与锚点，标签不再无依据漂浮在别的模型上方；
 * - 状态色只体现在左侧细条与状态点，不做描边发光。
 */

import * as THREE from "three";
import type { NexusPalette } from "./palette";

export type LabelLevel = "far" | "mid" | "near";

export type LabelObject = {
  sprite: THREE.Sprite;
  leader: THREE.Line;
  anchor: THREE.Mesh;
  title: string;
  subtitle: string;
  footnote: string;
  level: LabelLevel;
  tone: number;
  setTitle: (title: string) => void;
  setSubtitle: (subtitle: string) => void;
  setFootnote: (text: string) => void;
  setLevel: (level: LabelLevel) => void;
  setTone: (tone: number) => void;
  setVisible: (visible: boolean) => void;
  /** 画布宽高比，随信息层级变化，引擎用它换算 sprite 世界尺寸。 */
  aspect: number;
  /** 标题字号占画布高度的比例，引擎按它把“标题屏幕像素”换算成 sprite 世界高度。 */
  titleRatio: number;
  dispose: () => void;
};

const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cssColor(hex: number, alpha = 1) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > max) value = value.slice(0, -1);
  return `${value}…`;
}

type DrawInput = {
  title: string;
  subtitle: string;
  footnote: string;
  level: LabelLevel;
  tone: number;
  palette: NexusPalette;
  selected?: boolean;
};

function drawLabel(input: DrawInput) {
  const { title, subtitle, footnote, level, tone, palette } = input;
  const dark = palette.mode === "dark";
  const canvas = document.createElement("canvas");
  const width = 640;
  // 画布高度紧贴内容：旧实现留了大片空白，导致“34px 高的标签”里实际文字只有 8px。
  const height = level === "far" ? 92 : level === "mid" ? 150 : 206;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, width, height, titlePx: 46 };

  const bg = dark ? "rgba(11,16,19,0.74)" : "rgba(250,251,249,0.90)";
  const border = dark ? "rgba(190,214,222,0.16)" : "rgba(32,48,54,0.14)";
  const ink = dark ? "#eef4f6" : "#18222a";
  const muted = dark ? "rgba(196,214,221,0.80)" : "rgba(52,68,74,0.78)";
  const faint = dark ? "rgba(170,190,198,0.56)" : "rgba(70,86,92,0.55)";

  ctx.clearRect(0, 0, width, height);
  // 玻璃底：上亮下暗，模拟受光面，不做外发光。
  const gradient = ctx.createLinearGradient(0, 8, 0, height - 8);
  gradient.addColorStop(0, dark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = bg;
  roundRect(ctx, 4, 4, width - 8, height - 8, 22);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 左侧状态条：状态色的唯一载体。
  ctx.fillStyle = cssColor(tone, 0.9);
  roundRect(ctx, 20, 20, 5, height - 40, 2.5);
  ctx.fill();

  const textLeft = 40;
  const maxText = width - textLeft - 20;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  // 远/中/近三级用同一字号，靠画布高度控制信息密度，视觉重量一致。
  const titlePx = 46;
  ctx.font = `600 ${titlePx}px ${FONT}`;
  const primaryY = level === "far" ? height / 2 : 46;
  ctx.fillText(ellipsis(ctx, title || "未命名节点", maxText), textLeft, primaryY);

  if (level !== "far") {
    ctx.fillStyle = muted;
    ctx.font = `400 29px ${FONT}`;
    ctx.fillText(ellipsis(ctx, subtitle || "", maxText), textLeft, 98);
  }
  if (level === "near") {
    // 近景补一条极细分隔线，信息分层更清楚。
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textLeft, 126);
    ctx.lineTo(width - 24, 126);
    ctx.stroke();
    ctx.fillStyle = faint;
    ctx.font = `400 25px ${FONT}`;
    ctx.fillText(ellipsis(ctx, footnote || "", maxText), textLeft, 164);
  }
  return { canvas, width, height, titlePx };
}

export function createLabel(
  palette: NexusPalette,
  opts: { title: string; subtitle?: string; footnote?: string; level?: LabelLevel; tone: number },
): LabelObject {
  const state: LabelObject = {
    sprite: null as unknown as THREE.Sprite,
    leader: null as unknown as THREE.Line,
    anchor: null as unknown as THREE.Mesh,
    title: opts.title,
    subtitle: opts.subtitle || "",
    footnote: opts.footnote || "",
    level: opts.level || "mid",
    tone: opts.tone,
    aspect: 640 / 150,
    titleRatio: 46 / 150,
    setTitle(value) {
      if (state.title === value) return;
      state.title = value;
      refresh();
    },
    setSubtitle(value) {
      if (state.subtitle === value) return;
      state.subtitle = value;
      refresh();
    },
    setFootnote(value) {
      if (state.footnote === value) return;
      state.footnote = value;
      refresh();
    },
    setLevel(value) {
      if (state.level === value) return;
      state.level = value;
      refresh();
    },
    setTone(value) {
      if (state.tone === value) return;
      state.tone = value;
      refresh();
    },
    setVisible(value) {
      state.sprite.visible = value;
      state.leader.visible = value;
      state.anchor.visible = value;
    },
    dispose() {
      state.sprite.material.map?.dispose();
      state.sprite.material.dispose();
      state.leader.geometry.dispose();
      (state.leader.material as THREE.Material).dispose();
      state.anchor.geometry.dispose();
      (state.anchor.material as THREE.Material).dispose();
    },
  };

  let aspect = 640 / 150;

  const build = () => {
    const { canvas, width, height, titlePx } = drawLabel({
      title: state.title, subtitle: state.subtitle, footnote: state.footnote,
      level: state.level, tone: state.tone, palette,
    });
    aspect = width / height;
    state.aspect = aspect;
    state.titleRatio = titlePx / height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  };

  const material = new THREE.SpriteMaterial({
    map: build(),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
    toneMapped: false,
  });
  state.sprite = new THREE.Sprite(material);
  state.sprite.scale.set(1.6, 1.6 / aspect, 1);
  state.sprite.renderOrder = 40;
  state.sprite.center.set(0.5, 0);

  const leaderGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
  state.leader = new THREE.Line(leaderGeometry, new THREE.LineBasicMaterial({
    color: state.tone, transparent: true, opacity: 0.32, depthWrite: false,
  }));
  state.leader.renderOrder = 39;

  state.anchor = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 8, 6),
    new THREE.MeshBasicMaterial({ color: state.tone, transparent: true, opacity: 0.85 }),
  );

  let refreshing = false;
  function refresh() {
    if (refreshing) return;
    refreshing = true;
    const next = build();
    material.map?.dispose();
    material.map = next;
    material.needsUpdate = true;
    state.sprite.scale.set(1.6, 1.6 / aspect, 1);
    (state.leader.material as THREE.LineBasicMaterial).color.setHex(state.tone);
    (state.anchor.material as THREE.MeshBasicMaterial).color.setHex(state.tone);
    refreshing = false;
  }

  return state;
}
