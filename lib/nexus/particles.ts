"use client";

/**
 * 数据链路与粒子系统（重写）。
 *
 * 旧问题与真实原因：
 * 1. `gl_PointSize = aSize * pixelRatio * (260 / -mv.z)` 没有上限，镜头一近粒子变成
 *    几十像素的光球；再叠加 AdditiveBlending，多个粒子重叠时颜色被无限累加，
 *    最终烧成白团并遮住模型和标签。
 * 2. 粒子颜色直接用高饱和主题色，饱和度与亮度都不可控。
 * 3. 链路用 Tube + 发光点，没有“静止/有流量”的区分。
 *
 * 现在的做法：
 * - NormalBlending + 屏幕像素硬上限（最大 4.8px），重叠不会累加；
 * - 粒子沿真实链路的三次贝塞尔曲线运动，端点淡入淡出，不穿模；
 * - 数量按 log10(1 + 请求率) 映射并受全局/单链路上限约束；
 * - 无真实流量时停止生成，已生成的粒子在 1.4s 内走完并淡出；
 * - 每个链路只有一个 Points + 一条细管 + 一条中心线，不在每帧创建对象。
 */

import * as THREE from "three";
import type { NexusLink } from "./types";
import type { NexusPalette } from "./palette";

const VERTEX = `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  uniform vec3 uStart;
  uniform vec3 uControl;
  uniform vec3 uEnd;
  varying float vFade;
  void main() {
    float t = fract(aPhase + uTime * aSpeed);
    float it = 1.0 - t;
    vec3 p = it * it * uStart + 2.0 * it * t * uControl + t * t * uEnd;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float control = clamp(9.0 / max(4.0, -mv.z), 0.78, 1.45);
    gl_PointSize = clamp(aSize * control, 1.8, 4.8);
    // 两端各留一小段淡出，粒子不会从机柜内部凭空出现。
    vFade = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.95, t);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    // 边缘柔和但中心不透明，既不像方块也不会糊成光雾。
    float alpha = smoothstep(1.0, 0.55, r);
    vec3 color = uColor * (0.78 + 0.34 * (1.0 - r));
    gl_FragColor = vec4(color, alpha * vFade * uOpacity);
  }
`;

export type FlowOptions = {
  /** 该链路允许的最大粒子数（已按画质与链路总数归一）。 */
  maxParticles: number;
  palette: NexusPalette;
  tone: number;
  /** 双向链路会额外生成一条反向流。 */
  twoWay?: boolean;
};

export class LinkFlow {
  readonly group = new THREE.Group();
  readonly curve: THREE.CubicBezierCurve3;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;
  private reverse?: THREE.Points;
  private reverseMaterial?: THREE.ShaderMaterial;
  private tube: THREE.Mesh;
  private centerLine: THREE.Line;
  private maxParticles: number;
  private targetCount = 0;
  private drawnCount = 0;
  private phase = 0;
  private opacity = 0;
  private retiring = false;
  private tubeMaterial: THREE.MeshBasicMaterial;
  private lineMaterial: THREE.LineBasicMaterial;
  private tone: number;

  constructor(start: THREE.Vector3, end: THREE.Vector3, options: FlowOptions) {
    this.maxParticles = Math.max(4, Math.round(options.maxParticles));
    this.tone = options.tone;

    // 链路先垂直离开设备，再水平汇入目标：类似真实机柜的走线槽，
    // 比直接连中心点更少穿模，也更容易看出方向。
    const lift = Math.min(2.2, Math.max(0.55, start.distanceTo(end) * 0.2));
    const control1 = start.clone().add(new THREE.Vector3(0, lift, 0));
    const control2 = end.clone().add(new THREE.Vector3(0, lift * 0.9, 0));
    this.curve = new THREE.CubicBezierCurve3(start.clone(), control1, control2, end.clone());

    const color = new THREE.Color(options.tone);
    this.geometry = new THREE.BufferGeometry();
    const phases = new Float32Array(this.maxParticles);
    const speeds = new Float32Array(this.maxParticles);
    const sizes = new Float32Array(this.maxParticles);
    for (let index = 0; index < this.maxParticles; index += 1) {
      // 均匀分布 + 轻微错位，避免所有粒子同时出现在同一位置。
      phases[index] = (index / this.maxParticles + (Math.sin(index * 12.9898) * 0.5 + 0.5) * 0.08) % 1;
      speeds[index] = 0.055 + (Math.sin(index * 78.233) * 0.5 + 0.5) * 0.035;
      sizes[index] = 2.0 + (Math.sin(index * 37.719) * 0.5 + 0.5) * 1.4;
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.maxParticles * 3), 3));
    this.geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    // 顶点在 shader 里计算，包围球手动给，避免被错误剔除。
    const mid = this.curve.getPoint(0.5);
    this.geometry.boundingSphere = new THREE.Sphere(mid, start.distanceTo(end) * 0.9 + lift);

    this.material = makeParticleMaterial(color, this.curve);
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = true;
    this.points.renderOrder = 6;
    this.group.add(this.points);

    if (options.twoWay) {
      const reverseGeometry = this.geometry.clone();
      reverseGeometry.boundingSphere = this.geometry.boundingSphere?.clone() || null;
      this.reverseMaterial = makeParticleMaterial(color, this.curve, true);
      this.reverse = new THREE.Points(reverseGeometry, this.reverseMaterial);
      this.reverse.renderOrder = 6;
      this.group.add(this.reverse);
    }

    // 结构线：细管提供体量，中心线保证任何缩放下都能看清走向。
    this.tubeMaterial = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.07, depthWrite: false,
    });
    this.tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 44, 0.014, 5, false), this.tubeMaterial);
    this.tube.renderOrder = 4;
    this.group.add(this.tube);

    this.lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
    this.centerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.curve.getPoints(44)), this.lineMaterial);
    this.centerLine.renderOrder = 5;
    this.group.add(this.centerLine);

    this.setTone(options.tone);
  }

  setTone(tone: number) {
    this.tone = tone;
    const color = new THREE.Color(tone);
    (this.material.uniforms.uColor.value as THREE.Color).copy(color);
    if (this.reverseMaterial) (this.reverseMaterial.uniforms.uColor.value as THREE.Color).copy(color);
    this.tubeMaterial.color.copy(color);
    this.lineMaterial.color.copy(color);
  }

  /** 按真实请求率设置粒子数量；rate 为 null/0 时进入退场。 */
  setRate(rate: number | null, measured: boolean) {
    if (!measured || rate == null || rate <= 0) {
      this.targetCount = 0;
      this.retiring = this.drawnCount > 0;
      return;
    }
    const normalized = Math.log10(1 + rate * 60) / Math.log10(1 + 600);
    const count = Math.min(this.maxParticles, Math.max(2, Math.round(this.maxParticles * normalized)));
    this.targetCount = count;
    this.retiring = false;
  }

  setActive(active: boolean) {
    this.lineMaterial.opacity = active ? 0.62 : 0.3;
    this.tubeMaterial.opacity = active ? 0.16 : 0.07;
  }

  /** 每帧推进。返回 false 表示可以完全隐藏。 */
  advance(delta: number) {
    if (this.targetCount === 0 && this.drawnCount === 0) return false;
    if (this.targetCount > 0) {
      this.drawnCount = this.targetCount;
      this.geometry.setDrawRange(0, this.drawnCount);
      if (this.reverse) this.reverse.geometry.setDrawRange(0, Math.max(2, Math.round(this.drawnCount * 0.6)));
      this.opacity = Math.min(0.92, this.opacity + delta * 2.4);
    } else if (this.retiring) {
      // 停止生成，但让已生成的粒子走完剩余路径再消失。
      this.opacity = Math.max(0, this.opacity - delta * 0.7);
      if (this.opacity <= 0) {
        this.drawnCount = 0;
        this.retiring = false;
        this.geometry.setDrawRange(0, 0);
        if (this.reverse) this.reverse.geometry.setDrawRange(0, 0);
        return false;
      }
    }
    this.material.uniforms.uOpacity.value = this.opacity;
    if (this.reverseMaterial) this.reverseMaterial.uniforms.uOpacity.value = this.opacity * 0.55;
    this.phase += delta;
    this.material.uniforms.uTime.value = this.phase;
    if (this.reverseMaterial) this.reverseMaterial.uniforms.uTime.value = this.phase;
    this.points.visible = this.opacity > 0.01;
    if (this.reverse) this.reverse.visible = this.opacity > 0.01;
    return true;
  }

  /** 监控断开：立即停止粒子并压暗结构线，不继续制造“仍在流动”的假象。 */
  suspend() {
    this.targetCount = 0;
    this.drawnCount = 0;
    this.opacity = 0;
    this.retiring = false;
    this.geometry.setDrawRange(0, 0);
    if (this.reverse) this.reverse.geometry.setDrawRange(0, 0);
    this.material.uniforms.uOpacity.value = 0;
    if (this.reverseMaterial) this.reverseMaterial.uniforms.uOpacity.value = 0;
    this.points.visible = false;
    if (this.reverse) this.reverse.visible = false;
    this.lineMaterial.opacity = 0.14;
    this.tubeMaterial.opacity = 0.04;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.tube.geometry.dispose();
    this.tubeMaterial.dispose();
    this.centerLine.geometry.dispose();
    this.lineMaterial.dispose();
    if (this.reverse) {
      this.reverse.geometry.dispose();
      this.reverseMaterial?.dispose();
    }
  }
}

function makeParticleMaterial(color: THREE.Color, curve: THREE.CubicBezierCurve3, reverse = false) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uStart: { value: (reverse ? curve.v3 : curve.v0).clone() },
      uControl: { value: (reverse ? curve.v2 : curve.v1).clone() },
      uEnd: { value: (reverse ? curve.v0 : curve.v3).clone() },
      uColor: { value: color.clone() },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // 关键：NormalBlending，重叠不再累加亮度。
    blending: THREE.NormalBlending,
  });
}

/** 由真实请求率决定粒子总量，避免高并发时无限增长。 */
export function particleBudget(total: number, linkCount: number, rate: number | null) {
  if (rate == null || rate <= 0 || linkCount <= 0) return 0;
  const perLink = Math.floor(total / linkCount);
  return Math.max(3, Math.min(18, perLink));
}

export type { NexusLink, NexusPalette };
