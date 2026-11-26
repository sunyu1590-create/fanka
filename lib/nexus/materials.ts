"use client";

/**
 * HEIKA Nexus 2.0 统一材质与几何资产库。
 *
 * 设计语言：精密工业设计 + 高级光学玻璃 + 数字工程可视化。
 * - 一个场景一个 ModelKit，材质/几何按 key 缓存，切换场景后统一释放；
 * - 状态色只用于指示灯、细边线与局部数据区，不给整块模型染色；
 * - 不使用 Bloom，靠材质反射、受光面与接触阴影建立质感。
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { NexusPalette } from "./palette";

const hexToRgb = (hex: number) => ({
  r: (hex >> 16) & 255,
  g: (hex >> 8) & 255,
  b: hex & 255,
});

function mixHex(a: number, b: number, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return ((Math.round(x.r + (y.r - x.r) * t) << 16)
    | (Math.round(x.g + (y.g - x.g) * t) << 8)
    | Math.round(x.b + (y.b - x.b) * t));
}

export class ModelKit {
  readonly palette: NexusPalette;
  readonly dark: boolean;
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials: THREE.Material[] = [];
  private ledCache = new Map<number, THREE.MeshStandardMaterial>();
  private rings = new Map<string, THREE.MeshBasicMaterial>();
  private shadow: THREE.MeshBasicMaterial | null = null;
  /** 共享的接触阴影贴图，所有模型复用同一张。 */
  readonly shadowTexture: THREE.Texture;
  private shadowTextureLocal: boolean;

  constructor(palette: NexusPalette, shadowTexture?: THREE.Texture) {
    this.palette = palette;
    this.dark = palette.mode === "dark";
    if (shadowTexture) {
      this.shadowTexture = shadowTexture;
      this.shadowTextureLocal = false;
    } else {
      this.shadowTexture = radialShadowTexture();
      this.shadowTextureLocal = true;
    }
  }

  // ---------- 几何（按尺寸缓存，避免重复创建） ----------

  rounded(w: number, h: number, d: number, r = 0.03, seg = 2) {
    const key = `r:${w}:${h}:${d}:${r}:${seg}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2.05));
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  box(w: number, h: number, d: number) {
    const key = `b:${w}:${h}:${d}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(w, h, d);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  cyl(rt: number, rb: number, h: number, seg = 32, open = false) {
    const key = `c:${rt}:${rb}:${h}:${seg}:${open}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  sphere(r: number, w = 32, h = 20, phi?: number, theta?: number) {
    const key = `s:${r}:${w}:${h}:${phi ?? 1}:${theta ?? 1}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, theta ?? Math.PI);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  torus(r: number, tube: number, seg = 8, radial = 64, arc = Math.PI * 2) {
    const key = `t:${r}:${tube}:${seg}:${radial}:${arc}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = new THREE.TorusGeometry(r, tube, seg, radial, arc);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  plane(w: number, h: number) {
    const key = `p:${w}:${h}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = new THREE.PlaneGeometry(w, h);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  /** 从二维轮廓挤出并倒角，用于盾牌、面板等有识别度的外形。 */
  extrude(shape: THREE.Shape, depth: number, bevel = 0.02) {
    const key = `e:${shape.uuid}:${depth}:${bevel}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16,
      });
      geometry.center();
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  // ---------- 材质 ----------

  private track<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  /** 深石墨金属：基础设施外壳。 */
  graphite() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x2a333a : 0x8e9a9e,
      metalness: this.dark ? 0.62 : 0.42,
      roughness: this.dark ? 0.44 : 0.52,
      envMapIntensity: this.dark ? 0.85 : 0.5,
    }));
  }

  /** 更深的机体色：机柜内腔、底座。 */
  graphiteDeep() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x141a1e : 0x76838a,
      metalness: 0.5,
      roughness: 0.58,
      envMapIntensity: this.dark ? 0.6 : 0.4,
    }));
  }

  /**
   * 地台材质：整个场景的“地面”，必须比模型暗，模型才不会像沉进地板。
   * 低金属度 + 高粗糙度 + 低环境反射，只保留方向光的方向感。
   */
  platformMaterial() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x0d1216 : 0xc6cfd1,
      metalness: 0.28,
      roughness: 0.82,
      envMapIntensity: this.dark ? 0.22 : 0.5,
    }));
  }

  /** 精密钛合金：芯片、连接件、机械结构。 */
  titanium() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x9aa6aa : 0xd9e0e1,
      metalness: 1,
      roughness: this.dark ? 0.27 : 0.34,
      envMapIntensity: this.dark ? 1.15 : 0.75,
    }));
  }

  /** 哑光钛：不需要强反射的结构件。 */
  titaniumMatte() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x6b797e : 0xd3dadb,
      metalness: 0.85,
      roughness: 0.52,
      envMapIntensity: 0.7,
    }));
  }

  /** 品牌黄铜：极少量点缀，用于核心与选中态。 */
  brass() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.palette.gold,
      metalness: 0.95,
      roughness: 0.3,
      envMapIntensity: 1,
    }));
  }

  /** 磨砂光学玻璃：内部结构观察窗、防御层。 */
  glass(opacity = 0.2) {
    return this.track(new THREE.MeshPhysicalMaterial({
      color: this.dark ? 0xa9c6cf : 0xdfe9ea,
      metalness: 0,
      roughness: 0.28,
      transparent: true,
      opacity,
      clearcoat: 1,
      clearcoatRoughness: 0.14,
      ior: 1.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.1,
    }));
  }

  /** 磨砂亚克力：机身面板、灯罩。 */
  frost(opacity = 0.34) {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x8fa5ad : 0xf1f5f4,
      metalness: 0.1,
      roughness: 0.62,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
  }

  /** 深色工程复合材质：PCB、绝缘底座。 */
  composite() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x101518 : 0x9aa4a6,
      metalness: 0.22,
      roughness: 0.82,
      envMapIntensity: 0.4,
    }));
  }

  /** 电路板：偏冷的墨绿，只在近处可见。 */
  pcb() {
    return this.track(new THREE.MeshStandardMaterial({
      color: this.dark ? 0x16241f : 0x6f8b80,
      metalness: 0.28,
      roughness: 0.68,
    }));
  }

  /** 屏幕/发光面：低亮度，不给整块模型用。 */
  screen(tone?: number) {
    const color = tone ?? (this.dark ? 0x2b6f7d : 0x2f7c8c);
    return this.track(new THREE.MeshStandardMaterial({
      color: 0x05080a,
      emissive: color,
      emissiveIntensity: this.dark ? 0.55 : 0.32,
      metalness: 0.1,
      roughness: 0.35,
      toneMapped: true,
    }));
  }

  /** 状态指示灯：同一颜色复用同一个材质实例。 */
  led(tone: number, intensity = 1.35) {
    const cached = this.ledCache.get(tone);
    if (cached) return cached;
    const material = new THREE.MeshStandardMaterial({
      color: 0x05070a,
      emissive: tone,
      emissiveIntensity: intensity,
      metalness: 0.2,
      roughness: 0.3,
      // 小面积高亮必须参与色调映射，否则会在 ACES 下直接烧成白点。
      toneMapped: true,
    });
    this.ledCache.set(tone, material);
    this.materials.push(material);
    return material;
  }

  /** 细边线：结构轮廓，透明度低，不参与泛光。 */
  edge(tone: number, opacity = 0.28) {
    return this.track(new THREE.LineBasicMaterial({ color: tone, transparent: true, opacity }));
  }

  /** 细环/细面：Mesh 用的低亮度基础材质（不是线材质）。 */
  ring(tone: number, opacity = 0.2) {
    const key = `${tone}:${opacity}`;
    const cached = this.rings.get(key);
    if (cached) return cached;
    const material = new THREE.MeshBasicMaterial({
      color: tone, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    });
    this.rings.set(key, material);
    this.materials.push(material);
    return material;
  }

  /** 所有模型共用的接触阴影材质。 */
  shadowMaterial() {
    if (!this.shadow) {
      this.shadow = new THREE.MeshBasicMaterial({
        map: this.shadowTexture, transparent: true, opacity: 0.9, depthWrite: false, color: 0x000000,
      });
      this.materials.push(this.shadow);
    }
    return this.shadow;
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear();
    this.materials.length = 0;
    this.ledCache.clear();
    this.rings.clear();
    this.shadow = null;
    if (this.shadowTextureLocal) this.shadowTexture.dispose();
  }
}

/** 柔和接触阴影：径向渐变贴图，比实时阴影便宜且不会出现硬边。 */
export function radialShadowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(0.55, "rgba(0,0,0,0.26)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 渐变天空：等距圆柱背景不需要贴图，用一张竖向渐变即可获得纵深。 */
export function skyTexture(palette: NexusPalette) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    if (palette.mode === "dark") {
      gradient.addColorStop(0, "#0d1418");
      gradient.addColorStop(0.55, "#0a0e11");
      gradient.addColorStop(1, "#06090b");
    } else {
      gradient.addColorStop(0, "#f3f6f5");
      gradient.addColorStop(0.55, "#e8edee");
      gradient.addColorStop(1, "#dfe5e6");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 8, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export { mixHex };
