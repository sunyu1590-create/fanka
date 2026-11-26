"use client";

/**
 * 场景对象：节点 = 精细模型 + 分层标签；链路 = 细管 + 小粒子。
 * 一个节点只创建一个 Group，实时更新只改材质属性与 uniform，不重建对象。
 */

import * as THREE from "three";
import type { NexusLink, NexusNode, NexusStatus } from "./types";
import { KIND_TONE, LINK_COLORS, type NexusPalette } from "./palette";
import { ModelKit } from "./materials";
import { applyStatus, buildCoreModel, buildNodeModel, setOutline, type BuiltModel, type NodeModelKind } from "./models";
import { createLabel, type LabelLevel, type LabelObject } from "./labels";
import { LinkFlow, particleBudget } from "./particles";

export function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
  root.clear();
}

function disposeMaterial(material: THREE.Material) {
  const record = material as unknown as Record<string, unknown>;
  for (const key of ["map", "alphaMap", "emissiveMap", "normalMap", "roughnessMap"]) {
    const texture = record[key] as THREE.Texture | undefined;
    if (texture?.dispose) texture.dispose();
  }
  material.dispose();
}

export function toneNumber(palette: NexusPalette, tone: string) {
  switch (tone) {
    case "gold": return palette.gold;
    case "cyan": return palette.cyan;
    case "blue": return palette.blue;
    case "violet": return palette.violet;
    case "green": return palette.green;
    case "amber": return palette.amber;
    case "red": return palette.red;
    case "neutral": return palette.neutral;
    default: return palette.neutral;
  }
}

export function statusTone(status: NexusStatus) {
  if (status === "down" || status === "offline") return "red";
  if (status === "degraded") return "amber";
  if (status === "unknown") return "neutral";
  return "cyan";
}

export type NodeObject = {
  id: string;
  kind: string;
  label: string;
  group: THREE.Group;
  model: BuiltModel;
  labelObject: LabelObject | null;
  baseY: number;
  status: NexusStatus;
  selected: boolean;
  /** 标签世界锚点高度（模型顶部）。 */
  anchorY: number;
  setStatus: (status: NexusStatus) => void;
  setSelected: (selected: boolean) => void;
  setLabelVisible: (visible: boolean) => void;
  setLabelLevel: (level: LabelLevel) => void;
  setLabelMetric: (text: string) => void;
  dispose: () => void;
};

export type CreateNodeOptions = {
  /** 使用中央核心模型（全域场景的 HEIKA 核心）。 */
  core?: boolean;
  /** 悬空放置时的基座高度。 */
  lift?: number;
  labels?: boolean;
  footnote?: string;
  metric?: string;
};

export function createNodeObject(
  node: Pick<NexusNode, "id" | "label" | "kind" | "status">,
  kit: ModelKit,
  palette: NexusPalette,
  options: CreateNodeOptions = {},
): NodeObject {
  const group = new THREE.Group();
  group.name = node.id;
  group.userData.nodeId = node.id;

  const kind = (node.kind === "worker" ? "ai" : node.kind) as NodeModelKind;
  const model = options.core ? buildCoreModel(kit, palette, node.status) : buildNodeModel(kind, kit, palette, node.status);
  group.add(model.group);
  for (const pickable of model.pickables) pickable.userData.nodeId = node.id;
  group.userData.pickables = model.pickables;

  const tone = toneNumber(palette, statusTone(node.status));
  const labelObject = options.labels === false ? null : createLabel(palette, {
    title: node.label,
    subtitle: options.metric || "",
    footnote: options.footnote || subtitleOf(node.kind),
    tone,
    level: "mid",
  });
  const anchorY = model.height + 0.06;
  if (labelObject) {
    labelObject.sprite.position.set(0, anchorY + 0.34, 0);
    const leader = labelObject.leader.geometry as THREE.BufferGeometry;
    leader.setFromPoints([new THREE.Vector3(0, anchorY, 0), new THREE.Vector3(0, anchorY + 0.34, 0)]);
    labelObject.anchor.position.set(0, anchorY, 0);
    group.add(labelObject.leader, labelObject.anchor, labelObject.sprite);
  }

  const state: NodeObject = {
    id: node.id,
    kind: node.kind,
    label: node.label,
    group,
    model,
    labelObject,
    baseY: options.lift ?? 0,
    status: node.status,
    selected: false,
    anchorY,
    setStatus(status) {
      if (state.status === status) return;
      state.status = status;
      applyStatus(model, palette, status);
      const nextTone = toneNumber(palette, statusTone(status));
      labelObject?.setTone(nextTone);
    },
    setSelected(selected) {
      if (state.selected === selected) return;
      state.selected = selected;
      setOutline(model, selected);
      labelObject?.setLevel(selected ? "near" : "mid");
      if (selected) labelObject?.setVisible(true);
    },
    setLabelVisible(visible) {
      labelObject?.setVisible(visible);
    },
    setLabelLevel(level) {
      labelObject?.setLevel(level);
    },
    setLabelMetric(text) {
      labelObject?.setSubtitle(text);
    },
    dispose() {
      labelObject?.dispose();
      disposeObject(group);
    },
  };
  return state;
}

function subtitleOf(kind: string) {
  switch (kind) {
    case "database": return "PostgreSQL · 主数据";
    case "server": return "Next.js Web / API";
    case "storage": return "对象存储 · 图片/视频";
    case "ai": return "AI 调度与推理";
    case "gateway": return "Caddy · 反代入口";
    case "client": return "客户端";
    case "auth": return "GoTrue 身份认证";
    case "realtime": return "Supabase Realtime";
    case "monitor": return "指标采集";
    case "external": return "外部模型服务";
    default: return "服务节点";
  }
}

export type LinkObject = {
  id: string;
  link: NexusLink;
  group: THREE.Group;
  curve: THREE.CubicBezierCurve3;
  flow: LinkFlow;
  pickMesh: THREE.Mesh;
  setActive: (active: boolean) => void;
  update: (rate: number | null, bytes: number | null, measured: boolean) => void;
  dispose: () => void;
};

export function createLinkObject(
  link: NexusLink,
  start: THREE.Vector3,
  end: THREE.Vector3,
  palette: NexusPalette,
  budget: number,
): LinkObject {
  const tone = LINK_COLORS[link.kind] || "neutral";
  const toneValue = toneNumber(palette, link.kind === "data" ? "cyan" : tone);
  const maxParticles = particleBudget(budget, 12, link.rate ?? 0);
  const flow = new LinkFlow(start, end, {
    maxParticles: Math.max(6, maxParticles),
    palette,
    tone: toneValue,
    twoWay: link.direction === "two-way",
  });
  flow.group.name = link.id;
  flow.group.userData.linkId = link.id;

  const pickMesh = new THREE.Mesh(
    new THREE.TubeGeometry(flow.curve, 28, 0.13, 4, false),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  pickMesh.userData.linkId = link.id;
  flow.group.add(pickMesh);

  let resetTone = false;
  const state: LinkObject = {
    id: link.id,
    link,
    group: flow.group,
    curve: flow.curve,
    flow,
    pickMesh,
    setActive(active) {
      flow.setActive(active);
    },
    update(rate, bytes, measured) {
      const effective = measured && rate != null ? Math.max(0, rate) : 0;
      flow.setRate(effective, measured);
      link.rate = rate;
      link.bytesPerSecond = bytes;
      link.measured = measured;
      // 真实错误 → 局部红；P95 超阈值 → 琥珀；其余回到业务类型色。
      const failing = link.errorRate != null && link.errorRate > 1;
      const slow = link.latencyMs != null && link.latencyMs > 800;
      if (failing) { flow.setTone(palette.red); resetTone = true; }
      else if (slow) { flow.setTone(palette.amber); resetTone = true; }
      else if (resetTone) { flow.setTone(toneValue); resetTone = false; }
    },
    dispose() {
      flow.dispose();
      pickMesh.geometry.dispose();
      (pickMesh.material as THREE.Material).dispose();
    },
  };
  state.update(link.rate, link.bytesPerSecond, link.measured);
  return state;
}

export function advanceLink(link: LinkObject, deltaSeconds: number) {
  link.flow.advance(deltaSeconds);
}

/** 场景内独立标签（服务器分层、资源建筑、时间轴刻度）。 */
export function createSpriteLabel(title: string, subtitle: string, palette: NexusPalette, scale = 1, tone?: number) {
  const label = createLabel(palette, {
    title, subtitle, tone: tone ?? palette.cyan, level: subtitle ? "mid" : "far",
  });
  const material = label.sprite.material;
  const aspect = material.map ? material.map.image.width / material.map.image.height : 3.4;
  label.sprite.scale.set(1.45 * scale, (1.45 * scale) / aspect, 1);
  label.sprite.userData.label = label;
  return label.sprite;
}

export { KIND_TONE };
