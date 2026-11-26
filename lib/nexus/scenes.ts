"use client";

/**
 * 八大三维场景的真实几何构建。
 *
 * 场景只消费 NexusSnapshot / 场景接口返回的真实数据；
 * 没有数据的维度不生成“看起来在运行”的动画。
 */

import * as THREE from "three";
import type {
  NexusAiScene, NexusContentScene, NexusHistoryPoint, NexusMarker, NexusSceneKey,
  NexusSecurityScene, NexusSnapshot, NexusStorageScene,
} from "./types";
import { KIND_TONE, type NexusPalette } from "./palette";
import {
  advanceLink, createLinkObject, createNodeObject, createSpriteLabel,
  disposeObject, statusTone, type LinkObject, type NodeObject,
} from "./objects";

export type SceneCamera = { position: [number, number, number]; target: [number, number, number]; ortho?: boolean };

export type SceneExtras = {
  storage?: NexusStorageScene | null;
  ai?: NexusAiScene | null;
  content?: NexusContentScene | null;
  security?: NexusSecurityScene | null;
  globe?: import("./types").NexusGlobeScene | null;
};

export type BuiltScene = {
  key: NexusSceneKey;
  root: THREE.Group;
  nodes: NodeObject[];
  links: LinkObject[];
  pickables: THREE.Object3D[];
  defaultCamera: SceneCamera;
  update: (snapshot: NexusSnapshot) => void;
  setSelected: (id: string | null) => void;
  focusPoint: (id: string) => THREE.Vector3 | null;
  setHistorical?: (point: NexusHistoryPoint | null, markers: NexusMarker[]) => void;
  dispose: () => void;
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function toneValue(palette: NexusPalette, tone: string) {
  switch (tone) {
    case "gold": return palette.gold;
    case "cyan": return palette.cyan;
    case "blue": return palette.blue;
    case "violet": return palette.violet;
    case "green": return palette.green;
    case "amber": return palette.amber;
    case "red": return palette.red;
    default: return palette.neutral;
  }
}

function addPlatform(root: THREE.Group, palette: NexusPalette, radius = 7) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.92, radius, 96),
    new THREE.MeshBasicMaterial({ color: palette.gridStrong, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -2.1;
  root.add(ring);
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.54, radius * 0.545, 96),
    new THREE.MeshBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = -2.09;
  root.add(inner);
  const grid = new THREE.GridHelper(radius * 1.5, 24, palette.grid, palette.grid);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  grid.position.y = -2.1;
  root.add(grid);
}

function dust(root: THREE.Group, palette: NexusPalette, count = 520) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 6 + Math.random() * 14;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.4) * 12;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: palette.gridStrong, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  root.add(points);
}

const OVERVIEW_POSITIONS: Record<string, [number, number, number]> = {
  "client-web": [-3.6, 3.1, 1.6],
  "client-app": [3.6, 3.1, 1.6],
  edge: [0, 2.25, 0],
  app: [0, 1.1, 0],
  rest: [-2.5, -0.1, 1.7],
  auth: [-1.5, -0.1, -2.0],
  storage: [1.5, -0.1, 2.0],
  realtime: [2.7, -0.1, -1.6],
  db: [0, -1.35, 0],
  "ai-worker": [3.8, 0.75, -0.4],
  "ai-provider": [5.8, 1.6, -1.6],
  metrics: [-4.4, -1.4, -1.2],
};

function buildOverview(snapshot: NexusSnapshot, palette: NexusPalette, particleCap: number): BuiltScene {
  const root = new THREE.Group();
  addPlatform(root, palette, 7);
  dust(root, palette);
  const nodes: NodeObject[] = [];
  const nodeMap = new Map<string, NodeObject>();
  for (const node of snapshot.nodes) {
    const object = createNodeObject(node, palette);
    const position = OVERVIEW_POSITIONS[node.id] || [0, 0, 0];
    object.group.position.set(...position);
    object.baseY = position[1];
    root.add(object.group);
    nodes.push(object);
    nodeMap.set(node.id, object);
  }
  const links: LinkObject[] = [];
  for (const link of snapshot.links) {
    const from = nodeMap.get(link.from);
    const to = nodeMap.get(link.to);
    if (!from || !to) continue;
    const object = createLinkObject(link, from.group.position.clone(), to.group.position.clone(), palette, particleCap);
    root.add(object.group);
    links.push(object);
  }
  return {
    key: "overview",
    root,
    nodes,
    links,
    pickables: nodes.flatMap((node) => node.pickables),
    defaultCamera: { position: [10.5, 8.2, 12.5], target: [0, 0.2, 0] },
    update(next) {
      const byId = new Map(next.nodes.map((node) => [node.id, node]));
      for (const object of nodes) {
        const node = byId.get(object.id);
        if (node) object.setStatus(node.status);
      }
      const linkById = new Map(next.links.map((link) => [link.id, link]));
      for (const object of links) {
        const link = linkById.get(object.id);
        if (link) object.update(link.rate, link.bytesPerSecond, link.measured);
      }
    },
    setSelected(id) {
      for (const object of nodes) object.setSelected(object.id === id);
      for (const object of links) object.setActive(Boolean(id && (object.link.from === id || object.link.to === id)));
    },
    focusPoint(id) {
      return nodeMap.get(id)?.group.position.clone() || null;
    },
    dispose() { disposeObject(root); },
  };
}

// ---------- 场景三：服务器数字孪生 ----------

type ServerLayer = {
  id: string;
  label: string;
  group: THREE.Group;
  baseY: number;
  slab: THREE.Mesh;
  extras: THREE.Object3D[];
  materials: THREE.Material[];
};

function buildServer(snapshot: NexusSnapshot, palette: NexusPalette): BuiltScene {
  const root = new THREE.Group();
  addPlatform(root, palette, 6);
  dust(root, palette, 260);
  const layers: ServerLayer[] = [];
  const labels: THREE.Sprite[] = [];
  const specs = [
    { id: "layer:cpu", label: "CPU 计算层", y: 3.0, tone: "cyan" },
    { id: "layer:mem", label: "内存层", y: 1.8, tone: "violet" },
    { id: "layer:disk", label: "磁盘层", y: 0.6, tone: "gold" },
    { id: "layer:net", label: "网络层", y: -0.6, tone: "blue" },
    { id: "layer:process", label: "进程层", y: -1.8, tone: "green" },
  ];
  for (const spec of specs) {
    const group = new THREE.Group();
    group.position.y = spec.y;
    const color = toneValue(palette, spec.tone);
    const slabMaterial = new THREE.MeshStandardMaterial({
      color: palette.metalDark, metalness: 0.62, roughness: 0.38,
      emissive: color, emissiveIntensity: 0.12, transparent: true, opacity: 0.96,
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.26, 2.8), slabMaterial);
    slab.userData.nodeId = spec.id;
    group.add(slab);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
    slab.add(edges);
    const extras: THREE.Object3D[] = [];
    const materials: THREE.Material[] = [slabMaterial, edges.material as THREE.Material];

    if (spec.id === "layer:cpu") {
      for (let index = 0; index < 12; index += 1) {
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshStandardMaterial({
          color: palette.metal, metalness: 0.5, roughness: 0.3, emissive: color, emissiveIntensity: 0.2,
        }));
        core.position.set(-1.6 + (index % 6) * 0.64, 0.26, -0.6 + Math.floor(index / 6) * 0.9);
        group.add(core); extras.push(core);
        materials.push(core.material as THREE.Material);
      }
    } else if (spec.id === "layer:mem") {
      for (let index = 0; index < 16; index += 1) {
        const cell = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.7), new THREE.MeshStandardMaterial({
          color: palette.metal, metalness: 0.4, roughness: 0.45, emissive: color, emissiveIntensity: 0.06,
        }));
        cell.position.set(-1.95 + index * 0.26, 0.28, 0);
        group.add(cell); extras.push(cell);
        materials.push(cell.material as THREE.Material);
      }
    } else if (spec.id === "layer:disk") {
      for (let index = 0; index < 4; index += 1) {
        const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 32), new THREE.MeshStandardMaterial({
          color: palette.metalDark, metalness: 0.7, roughness: 0.3, emissive: color, emissiveIntensity: 0.12,
        }));
        disk.position.set(-1.2 + index * 0.8, 0.24, 0);
        group.add(disk); extras.push(disk);
        materials.push(disk.material as THREE.Material);
      }
    } else if (spec.id === "layer:net") {
      for (let index = 0; index < 8; index += 1) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.3), new THREE.MeshStandardMaterial({
          color: palette.metal, metalness: 0.6, roughness: 0.3, emissive: color, emissiveIntensity: 0.18,
        }));
        port.position.set(-1.5 + index * 0.42, 0.2, 0.8);
        group.add(port); extras.push(port);
        materials.push(port.material as THREE.Material);
      }
    }
    const sprite = createSpriteLabel(spec.label, "", palette, 1.15);
    sprite.position.set(3.3, spec.y + 0.3, 0.6);
    root.add(sprite); labels.push(sprite);
    root.add(group);
    layers.push({ id: spec.id, label: spec.label, group, baseY: spec.y, slab, extras, materials });
  }

  let processSignature = "";
  const processGroup = new THREE.Group();
  processGroup.position.y = -1.65;
  root.add(processGroup);

  const updateProcesses = (next: NexusSnapshot) => {
    const signature = next.processes.map((process) => `${process.service_key}:${process.cpu_percent}:${process.mem_bytes}`).join("|");
    if (signature === processSignature) return;
    processSignature = signature;
    disposeObject(processGroup);
    const top = [...next.processes].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0)).slice(0, 8);
    top.forEach((process, index) => {
      const height = 0.16 + Math.min(1.2, Math.log10(1 + (process.cpu_percent || 0)) * 0.5);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, height, 0.24), new THREE.MeshStandardMaterial({
        color: palette.metal, metalness: 0.4, roughness: 0.4,
        emissive: toneValue(palette, "green"), emissiveIntensity: 0.15,
      }));
      bar.position.set(-1.6 + index * 0.45, height / 2, 0);
      processGroup.add(bar);
    });
  };
  updateProcesses(snapshot);

  const setLayerVisual = (layer: ServerLayer, value: number | null, tone: "cyan" | "amber" | "red") => {
    const color = toneValue(palette, value == null ? "neutral" : tone);
    const slabMaterial = layer.slab.material as THREE.MeshStandardMaterial;
    slabMaterial.emissive.setHex(color);
    slabMaterial.emissiveIntensity = value == null ? 0.02 : 0.12 + Math.min(0.28, (value / 100) * 0.3);
    for (const extra of layer.extras) {
      const material = (extra as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (material) {
        material.emissive.setHex(color);
        material.emissiveIntensity = value == null ? 0.02 : 0.16;
      }
    }
  };

  const apply = (next: NexusSnapshot) => {
    const cpu = next.server.cpuPercent;
    const mem = next.server.memPercent;
    const disk = next.server.diskPercent;
    const net = next.server.netRxRate == null && next.server.netTxRate == null ? null : Math.min(100, ((next.server.netRxRate || 0) + (next.server.netTxRate || 0)) / 1048576 * 6);
    setLayerVisual(layers[0], cpu, cpu != null && cpu >= 90 ? "red" : cpu != null && cpu >= 75 ? "amber" : "cyan");
    setLayerVisual(layers[1], mem, mem != null && mem >= 90 ? "red" : mem != null && mem >= 80 ? "amber" : "cyan");
    setLayerVisual(layers[2], disk, disk != null && disk >= 92 ? "red" : disk != null && disk >= 82 ? "amber" : "cyan");
    setLayerVisual(layers[3], net, "cyan");
    setLayerVisual(layers[4], next.processes.length ? Math.min(100, next.processes.reduce((sum, row) => sum + (row.cpu_percent || 0), 0)) : null, "cyan");
    updateProcesses(next);
  };
  apply(snapshot);

  let selected: string | null = null;
  return {
    key: "server",
    root,
    nodes: [],
    links: [],
    pickables: layers.map((layer) => layer.slab),
    defaultCamera: { position: [9.5, 7.5, 11.5], target: [0, 0.4, 0] },
    update: apply,
    setSelected(id) {
      selected = id;
      for (const layer of layers) {
        const active = layer.id === id;
        layer.group.position.y = layer.baseY + (active ? 0.35 : 0);
        const opacity = id && !active ? 0.42 : 1;
        for (const material of layer.materials) {
          material.transparent = opacity < 1;
          material.opacity = opacity;
        }
      }
    },
    focusPoint(id) {
      const layer = layers.find((item) => item.id === id);
      return layer ? V(0, layer.group.position.y, 0) : null;
    },
    dispose() { disposeObject(root); },
  };
}

// ---------- 场景四：资源数据城市 ----------

function buildStorage(data: NexusStorageScene | null, palette: NexusPalette): BuiltScene {
  const root = new THREE.Group();
  addPlatform(root, palette, 9);
  dust(root, palette, 220);
  const pickables: THREE.Object3D[] = [];
  const points = new Map<string, THREE.Vector3>();
  const buildings = data?.buildings || [];
  const columns = 5;
  const spacing = 1.5;
  const maxBytes = Math.max(1, ...buildings.map((row) => row.bytes));
  buildings.slice(0, 30).forEach((building, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const height = 0.3 + (Math.log10(1 + building.bytes) / Math.log10(1 + maxBytes)) * 3.4;
    const tone = building.kind === "video" ? "gold" : building.kind === "image" ? "cyan" : building.kind === "bucket" ? "blue" : building.kind === "other" ? "neutral" : "violet";
    const material = new THREE.MeshStandardMaterial({
      color: palette.metalDark, metalness: 0.55, roughness: 0.35,
      emissive: toneValue(palette, tone), emissiveIntensity: 0.16,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, height, 0.8), material);
    mesh.position.set((column - (columns - 1) / 2) * spacing, -2 + height / 2, (row - 1.5) * spacing);
    mesh.userData.nodeId = `storage:${building.key}`;
    root.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({
      color: toneValue(palette, tone), transparent: true, opacity: 0.45,
    }));
    mesh.add(edges);
    pickables.push(mesh);
    points.set(`storage:${building.key}`, mesh.position.clone());
    if (index < 6) {
      const sprite = createSpriteLabel(building.label, `${formatBytes(building.bytes)} · ${building.objects}`, palette, 0.72);
      sprite.position.set(mesh.position.x, mesh.position.y + height / 2 + 0.35, mesh.position.z);
      root.add(sprite);
    }
  });
  return {
    key: "storage",
    root,
    nodes: [],
    links: [],
    pickables,
    defaultCamera: { position: [10, 7.4, 11.5], target: [0, -0.2, 0] },
    update() { /* 建筑由真实存储快照构建，不随秒级指标变化。 */ },
    setSelected(id) {
      for (const pickable of pickables) {
        const mesh = pickable as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = id && pickable.userData.nodeId !== id ? 0.04 : 0.16;
      }
    },
    focusPoint(id) { return points.get(id) || null; },
    dispose() { disposeObject(root); },
  };
}

// ---------- 场景五：AI 智能中枢 ----------

function buildAi(snapshot: NexusSnapshot, data: NexusAiScene | null, palette: NexusPalette, particleCap: number): BuiltScene {
  const root = new THREE.Group();
  addPlatform(root, palette, 6);
  dust(root, palette, 240);
  const purposes = data?.purposes?.length ? data.purposes : snapshot.ai.byPurpose;
  const coreNode: NodeObject = createNodeObject(
    { id: "ai-core", label: "AI 调度核心", kind: "ai", status: "healthy" }, palette,
  );
  coreNode.group.position.set(0, 0.2, 0);
  coreNode.baseY = 0.2;
  root.add(coreNode.group);
  const nodeObjects = [coreNode];
  const links: LinkObject[] = [];
  const positions = new Map<string, THREE.Vector3>([["ai-core", coreNode.group.position.clone()]]);
  const maxCalls = Math.max(1, ...purposes.map((row) => row.calls));
  purposes.slice(0, 8).forEach((purpose, index) => {
    const angle = (index / Math.max(1, Math.min(8, purposes.length))) * Math.PI * 2;
    const radius = 2.7;
    const group = new THREE.Group();
    const size = 0.2 + (purpose.calls / maxCalls) * 0.24;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshStandardMaterial({
      color: palette.metal, metalness: 0.45, roughness: 0.35, emissive: palette.violet, emissiveIntensity: 0.22,
    }));
    mesh.userData.nodeId = `purpose:${purpose.purpose}`;
    group.add(mesh);
    group.position.set(Math.cos(angle) * radius, 0.2 + ((index % 3) - 1) * 0.5, Math.sin(angle) * radius);
    const sprite = createSpriteLabel(purpose.purpose, `${purpose.calls} 次/时`, palette, 0.62);
    sprite.position.set(group.position.x, group.position.y + 0.55, group.position.z);
    root.add(group);
    root.add(sprite);
    positions.set(`purpose:${purpose.purpose}`, group.position.clone());
    const link = createLinkObject(
      {
        id: `ai-${purpose.purpose}`, from: "ai-core", to: `purpose:${purpose.purpose}`, kind: "ai",
        label: purpose.purpose, rate: purpose.calls / 3600, bytesPerSecond: null, latencyMs: purpose.avgMs,
        errorRate: purpose.calls ? purpose.errors / purpose.calls : null, direction: "one-way", measured: purpose.calls > 0,
      },
      coreNode.group.position.clone(), group.position.clone(), palette, Math.max(8, particleCap * 0.5),
    );
    root.add(link.group);
    links.push(link);
  });
  // 审核流水线：四个真实阶段，不用“通过/驳回”动画替代真实决策。
  const stages = [
    { id: "stage:submit", label: "提交修改", x: -3.4, z: -3.2, tone: "blue" },
    { id: "stage:review", label: "AI 检测", x: -1.1, z: -3.6, tone: "violet" },
    { id: "stage:approved", label: "自动通过", x: 1.2, z: -3.2, tone: "green" },
    { id: "stage:rejected", label: "自动驳回", x: 3.4, z: -3.2, tone: "amber" },
  ];
  stages.forEach((stage) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshStandardMaterial({
      color: palette.metalDark, metalness: 0.6, roughness: 0.35,
      emissive: toneValue(palette, stage.tone), emissiveIntensity: 0.3,
    }));
    mesh.position.set(stage.x, -1.5, stage.z);
    mesh.userData.nodeId = stage.id;
    root.add(mesh);
    const sprite = createSpriteLabel(stage.label, "", palette, 0.62);
    sprite.position.set(stage.x, -0.95, stage.z);
    root.add(sprite);
  });
  return {
    key: "ai",
    root,
    nodes: nodeObjects,
    links,
    pickables: [coreNode.group, ...root.children.filter((child) => child.userData.nodeId)],
    defaultCamera: { position: [9, 6.4, 10.6], target: [0, -0.2, 0] },
    update(next) {
      coreNode.setStatus(next.ai.available ? "healthy" : "unknown");
      const byId = new Map(next.ai.byPurpose.map((row) => [row.purpose, row]));
      for (const link of links) {
        const purpose = link.link.to.replace("purpose:", "");
        const row = byId.get(purpose);
        link.update(row ? row.calls / 3600 : 0, null, Boolean(row));
      }
    },
    setSelected(id) {
      coreNode.setSelected(id === "ai-core");
      for (const link of links) link.setActive(Boolean(id && (link.link.from === id || link.link.to === id)));
    },
    focusPoint(id) {
      if (id === "ai-core") return coreNode.group.position.clone();
      return positions.get(id) || (id.startsWith("stage:") ? V(0, -1.5, -3.2) : null);
    },
    dispose() { disposeObject(root); },
  };
}

// ---------- 场景六：内容知识宇宙 ----------

function buildContent(data: NexusContentScene | null, palette: NexusPalette): BuiltScene {
  const root = new THREE.Group();
  dust(root, palette, 500);
  const group = new THREE.Group();
  root.add(group);
  const pickables: THREE.Object3D[] = [];
  const positions = new Map<string, THREE.Vector3>();
  if (!data) {
    return {
      key: "content", root, nodes: [], links: [], pickables,
      defaultCamera: { position: [0, 4, 12], target: [0, 0, 0] },
      update() {}, setSelected() {}, focusPoint() { return null; }, dispose() { disposeObject(root); },
    };
  }
  const maxViews = Math.max(1, ...data.posts.map((post) => post.views));
  data.posts.forEach((post, index) => {
    const y = 1 - (index / Math.max(1, data.posts.length - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = index * 2.399963;
    const size = 0.1 + Math.sqrt(post.views / maxViews) * 0.22;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshStandardMaterial({
      color: palette.metal, metalness: 0.4, roughness: 0.4,
      emissive: post.channel === "ai" ? palette.violet : palette.cyan, emissiveIntensity: 0.35,
    }));
    mesh.position.set(Math.cos(theta) * radius * 3.2, y * 3.2, Math.sin(theta) * radius * 3.2);
    mesh.userData.nodeId = post.id;
    group.add(mesh);
    pickables.push(mesh);
    positions.set(post.id, mesh.position.clone());
    if (index < 12) {
      const sprite = createSpriteLabel(post.title.slice(0, 16), `${formatNumber(post.views)} 阅读`, palette, 0.56);
      sprite.position.copy(mesh.position).add(V(0, 0.35, 0));
      root.add(sprite);
    }
  });
  data.series.forEach((series, index) => {
    const angle = (index / Math.max(1, data.series.length)) * Math.PI * 2;
    const position = V(Math.cos(angle) * 4.6, 2.9, Math.sin(angle) * 4.6);
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 10, 36), new THREE.MeshStandardMaterial({
      color: palette.metal, metalness: 0.6, roughness: 0.3, emissive: palette.gold, emissiveIntensity: 0.3,
    }));
    mesh.position.copy(position);
    mesh.rotation.x = Math.PI / 2;
    mesh.userData.nodeId = series.id;
    group.add(mesh);
    pickables.push(mesh);
    positions.set(series.id, position);
    const sprite = createSpriteLabel(series.title.slice(0, 14), `${series.posts} 篇`, palette, 0.56);
    sprite.position.copy(position).add(V(0, 0.5, 0));
    root.add(sprite);
  });
  data.tags.forEach((tag, index) => {
    const angle = (index / Math.max(1, data.tags.length)) * Math.PI * 2 + 0.3;
    const position = V(Math.cos(angle) * 5.2, -2.9, Math.sin(angle) * 5.2);
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({
      color: palette.metalDark, metalness: 0.5, roughness: 0.35, emissive: palette.blue, emissiveIntensity: 0.28,
    }));
    mesh.position.copy(position);
    mesh.userData.nodeId = `tag:${tag.id}`;
    group.add(mesh);
    pickables.push(mesh);
    positions.set(`tag:${tag.id}`, position);
    const sprite = createSpriteLabel(tag.name, `${tag.posts} 篇`, palette, 0.5);
    sprite.position.copy(position).add(V(0, 0.38, 0));
    root.add(sprite);
  });
  const edgePositions: number[] = [];
  for (const edge of data.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    edgePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: palette.link, transparent: true, opacity: 0.24,
  }));
  root.add(lines);
  return {
    key: "content", root, nodes: [], links: [], pickables,
    defaultCamera: { position: [9.6, 6.6, 11.8], target: [0, 0, 0] },
    update() {},
    setSelected(id) {
      for (const pickable of pickables) {
        const material = (pickable as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (material?.emissiveIntensity != null) material.emissiveIntensity = id && pickable.userData.nodeId !== id ? 0.08 : 0.35;
      }
    },
    focusPoint(id) { return positions.get(id) || null; },
    dispose() { disposeObject(root); },
  };
}

// ---------- 场景七：安全防御空间 ----------

function buildSecurity(data: NexusSecurityScene | null, palette: NexusPalette): BuiltScene {
  const root = new THREE.Group();
  addPlatform(root, palette, 7);
  dust(root, palette, 220);
  const pickables: THREE.Object3D[] = [];
  const layerPoints = new Map<string, THREE.Vector3>();
  const layers = [
    { id: "layer:edge", label: "边缘拦截", radius: 3.9, tone: "blue" },
    { id: "layer:rules", label: "访问规则", radius: 3.0, tone: "amber" },
    { id: "layer:auth", label: "身份校验", radius: 2.1, tone: "green" },
  ];
  layers.forEach((layer) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(layer.radius, 0.03, 8, 96), new THREE.MeshBasicMaterial({
      color: toneValue(palette, layer.tone), transparent: true, opacity: 0.6,
    }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    ring.userData.nodeId = layer.id;
    root.add(ring);
    pickables.push(ring);
    layerPoints.set(layer.id, V(0, 0.2, layer.radius));
    const sprite = createSpriteLabel(layer.label, "", palette, 0.62);
    sprite.position.set(0, 0.75, layer.radius);
    root.add(sprite);
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.5, 8), new THREE.MeshStandardMaterial({
    color: palette.metalDark, metalness: 0.65, roughness: 0.3, emissive: palette.cyan, emissiveIntensity: 0.2,
  }));
  core.position.y = 0.2;
  core.userData.nodeId = "security-core";
  root.add(core);
  pickables.push(core);
  layerPoints.set("security-core", V(0, 0.2, 0));
  (data?.rules || []).slice(0, 24).forEach((rule, index) => {
    const angle = (index / Math.max(1, Math.min(24, data!.rules.length))) * Math.PI * 2;
    const radius = rule.type.endsWith("block") ? 3.9 : 3.0;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12), new THREE.MeshStandardMaterial({
      color: palette.metal, metalness: 0.4, roughness: 0.4,
      emissive: rule.type.endsWith("block") ? palette.red : palette.amber, emissiveIntensity: 0.5,
    }));
    mesh.position.set(Math.cos(angle) * radius, 0.45, Math.sin(angle) * radius);
    mesh.userData.nodeId = `rule:${rule.id}`;
    root.add(mesh);
    pickables.push(mesh);
    layerPoints.set(`rule:${rule.id}`, mesh.position.clone());
  });
  return {
    key: "security", root, nodes: [], links: [], pickables,
    defaultCamera: { position: [8.6, 7.2, 10.2], target: [0, 0.2, 0] },
    update() {},
    setSelected(id) {
      for (const pickable of pickables) {
        const material = (pickable as THREE.Mesh).material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
        if (material) material.opacity = id && pickable.userData.nodeId !== id && (pickable as THREE.Mesh).geometry.type === "TorusGeometry" ? 0.22 : (material.transparent ? 0.6 : 1);
      }
    },
    focusPoint(id) { return layerPoints.get(id) || null; },
    dispose() { disposeObject(root); },
  };
}

// ---------- 场景二：全球网络态势 ----------

function buildGlobe(data: NexusSnapshot | null, scene: import("./types").NexusGlobeScene | null, palette: NexusPalette): BuiltScene {
  const root = new THREE.Group();
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(3, 48, 32),
    new THREE.MeshStandardMaterial({ color: palette.metalDark, metalness: 0.3, roughness: 0.75, transparent: true, opacity: 0.55 }),
  );
  root.add(globe);
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(3.01, 36, 24),
    new THREE.MeshBasicMaterial({ color: palette.gridStrong, wireframe: true, transparent: true, opacity: 0.32 }),
  );
  root.add(wire);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(3.18, 48, 32),
    new THREE.MeshBasicMaterial({ color: palette.cyan, transparent: true, opacity: 0.05, side: THREE.BackSide }),
  );
  root.add(atmosphere);
  const server = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), new THREE.MeshStandardMaterial({
    color: palette.metal, metalness: 0.6, roughness: 0.3, emissive: palette.cyan, emissiveIntensity: 0.5,
  }));
  server.position.set(0, 3.55, 0);
  root.add(server);
  const serverLabel = createSpriteLabel("HEIKA 服务节点", "moonclean.shop", palette, 0.68);
  serverLabel.position.set(0, 4.15, 0);
  root.add(serverLabel);
  const clients = scene?.clients || [];
  const maxRequests = Math.max(1, ...clients.map((client) => client.requests));
  clients.slice(0, 36).forEach((client, index) => {
    const phi = Math.acos(1 - (2 * (index + 0.5)) / Math.max(1, Math.min(36, clients.length)));
    const theta = Math.PI * (1 + Math.sqrt(5)) * index;
    const point = V(Math.cos(theta) * Math.sin(phi) * 3.05, Math.cos(phi) * 3.05, Math.sin(theta) * Math.sin(phi) * 3.05);
    const size = 0.035 + (client.requests / maxRequests) * 0.075;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({
      color: client.country ? palette.cyan : palette.neutral, transparent: true, opacity: 0.9,
    }));
    dot.position.copy(point);
    root.add(dot);
    // 未定位连接不画地理弧线，只画节点到服务节点的细线并标注“未定位”。
    if (index < 12) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([point.clone(), server.position.clone()]),
        new THREE.LineBasicMaterial({ color: palette.link, transparent: true, opacity: 0.16 }),
      );
      root.add(line);
    }
  });
  return {
    key: "globe", root, nodes: [], links: [], pickables: [],
    defaultCamera: { position: [6.8, 4.2, 9.2], target: [0, 0, 0] },
    update() {},
    setSelected() {},
    focusPoint() { return V(0, 0, 0); },
    dispose() { disposeObject(root); },
  };
}

// ---------- 场景八：时空回溯 ----------

function buildTimeline(palette: NexusPalette): BuiltScene {
  const root = new THREE.Group();
  addPlatform(root, palette, 7);
  dust(root, palette, 200);
  const rings: Array<{ key: keyof NexusHistoryPoint; mesh: THREE.Mesh; value: number | null; max: number }> = [];
  const specs: Array<{ key: keyof NexusHistoryPoint; radius: number; tone: string; max: number }> = [
    { key: "cpuPercent", radius: 1.1, tone: "cyan", max: 100 },
    { key: "memPercent", radius: 1.6, tone: "violet", max: 100 },
    { key: "diskPercent", radius: 2.1, tone: "gold", max: 100 },
    { key: "apiP95Ms", radius: 2.6, tone: "blue", max: 800 },
    { key: "aiQueue", radius: 3.1, tone: "amber", max: 20 },
  ];
  specs.forEach((spec) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, 0.035, 8, 96), new THREE.MeshBasicMaterial({
      color: toneValue(palette, spec.tone), transparent: true, opacity: 0.28,
    }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.1;
    root.add(mesh);
    rings.push({ key: spec.key, mesh, value: null, max: spec.max });
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({
    color: palette.metal, metalness: 0.55, roughness: 0.35, emissive: palette.gold, emissiveIntensity: 0.25,
  }));
  root.add(core);
  const markerGroup = new THREE.Group();
  root.add(markerGroup);
  return {
    key: "timeline", root, nodes: [], links: [], pickables: [],
    defaultCamera: { position: [8.6, 7.8, 10.8], target: [0, 0, 0] },
    update() {},
    setSelected() {},
    focusPoint() { return V(0, 0.2, 0); },
    setHistorical(point, markers) {
      if (!point) {
        for (const ring of rings) {
          ring.value = null;
          (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.12;
          ring.mesh.scale.setScalar(1);
        }
        return;
      }
      for (const ring of rings) {
        const raw = point[ring.key];
        const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        ring.value = value;
        const material = ring.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = value == null ? 0.1 : 0.35 + Math.min(0.5, value / ring.max * 0.5);
        ring.mesh.scale.setScalar(value == null ? 1 : 0.86 + Math.min(0.35, value / ring.max * 0.35));
      }
      disposeObject(markerGroup);
      markers.slice(-40).forEach((marker) => {
        const at = Date.parse(marker.at);
        const span = Math.max(1, Date.parse(point.bucketAt) - (Date.parse(point.bucketAt) - 3600_000));
        const angle = ((at % span) / span) * Math.PI * 2;
        const color = marker.level === "error" ? palette.red : marker.level === "warn" ? palette.amber : palette.blue;
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
        pillar.position.set(Math.cos(angle) * 3.6, 0.5, Math.sin(angle) * 3.6);
        markerGroup.add(pillar);
      });
    },
    dispose() { disposeObject(root); },
  };
}

// ---------- 工厂 ----------

export function buildScene(
  key: NexusSceneKey,
  snapshot: NexusSnapshot,
  palette: NexusPalette,
  options: SceneExtras & { particleCap: number },
): BuiltScene {
  switch (key) {
    case "server": return buildServer(snapshot, palette);
    case "storage": return buildStorage(options.storage || null, palette);
    case "ai": return buildAi(snapshot, options.ai || null, palette, options.particleCap);
    case "content": return buildContent(options.content || null, palette);
    case "security": return buildSecurity(options.security || null, palette);
    case "globe": return buildGlobe(snapshot, options.globe || null, palette);
    case "timeline": return buildTimeline(palette);
    case "overview":
    default: return buildOverview(snapshot, palette, options.particleCap);
  }
}

export function sceneTitle(key: NexusSceneKey) {
  switch (key) {
    case "globe": return "全球网络态势";
    case "server": return "服务器数字孪生";
    case "storage": return "资源数据城市";
    case "ai": return "AI 智能中枢";
    case "content": return "内容知识宇宙";
    case "security": return "安全防御空间";
    case "timeline": return "时空回溯中心";
    default: return "全域运行态势";
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

export { OVERVIEW_POSITIONS };
