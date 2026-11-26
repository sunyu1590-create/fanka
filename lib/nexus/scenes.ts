"use client";

/**
 * 八大三维场景（2.0 重制）。
 *
 * 每个场景都遵守同一套空间规范：机加工地台 → 设施基座 → 精细模型 → 结构链路 → 信息标签。
 * 只消费真实数据：没有接入的维度显示为空，不用随机数补位。
 */

import * as THREE from "three";
import type {
  NexusAiScene, NexusContentScene, NexusGlobeScene, NexusHistoryPoint, NexusMarker,
  NexusSceneKey, NexusSecurityScene, NexusSnapshot, NexusStorageScene,
} from "./types";
import { LINK_COLORS, type NexusPalette } from "./palette";
import { ModelKit } from "./materials";
import { buildNodeModel } from "./models";
import {
  createLinkObject, createNodeObject, createSpriteLabel, disposeObject,
  statusTone, toneNumber, type LinkObject, type NodeObject,
} from "./objects";
import type { LabelObject } from "./labels";
import { buildLandTexture, COUNTRY_CENTROIDS } from "./globe-texture";

export type SceneCamera = { position: [number, number, number]; target: [number, number, number] };

export type SceneBounds = { center: [number, number, number]; radius: number };

export type SceneExtras = {
  storage?: NexusStorageScene | null;
  ai?: NexusAiScene | null;
  content?: NexusContentScene | null;
  security?: NexusSecurityScene | null;
  globe?: NexusGlobeScene | null;
};

export type BuiltScene = {
  key: NexusSceneKey;
  root: THREE.Group;
  kit: ModelKit;
  nodes: NodeObject[];
  links: LinkObject[];
  pickables: THREE.Object3D[];
  defaultCamera: SceneCamera;
  bounds: SceneBounds;
  /** 真实几何包围盒，用于相机 fit-to-view；bounds.radius 只用于标签分级与聚焦距离。 */
  box?: THREE.Box3;
  update: (snapshot: NexusSnapshot) => void;
  setSelected: (id: string | null) => void;
  setExplode?: (value: boolean) => void;
  focusPoint: (id: string) => THREE.Vector3 | null;
  setHistorical?: (point: NexusHistoryPoint | null, markers: NexusMarker[]) => void;
  dispose: () => void;
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function toneValue(palette: NexusPalette, tone: string) {
  return toneNumber(palette, tone);
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

/** 机加工地台：同心刻线 + 径向规划线 + 边缘指示灯。 */
function addPlatform(root: THREE.Group, kit: ModelKit, palette: NexusPalette, radius = 6.4) {
  // 地台只做“地面”，不做视觉主角：比模型更暗、反射更低，且不画放射状分割线
  // （旧实现的 24 条径向线会被读成饼图，抢走模型的视觉权重）。
  const disc = new THREE.Mesh(kit.cyl(radius, radius + 0.06, 0.2, 96), kit.graphiteDeep());
  disc.position.y = -0.1;
  disc.receiveShadow = true;
  root.add(disc);

  const top = new THREE.Mesh(kit.cyl(radius - 0.05, radius - 0.05, 0.014, 96), kit.platformMaterial());
  top.position.y = 0.0;
  top.receiveShadow = true;
  root.add(top);

  // 同心刻线：只保留两条，透明度极低，用于给深度一个参照。
  for (const [ratio, opacity] of [[0.52, 0.16], [0.99, 0.22]] as const) {
    const ring = new THREE.Mesh(kit.torus(radius * ratio, ratio === 0.99 ? 0.01 : 0.005, 5, 128), kit.ring(palette.gridStrong, opacity));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.012;
    root.add(ring);
  }

  // 外缘灯带：稀疏、极小的刻度光，只在边缘提供一点精密感。
  const edgeLights: Array<{ p: [number, number, number] }> = [];
  for (let index = 0; index < 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2;
    edgeLights.push({ p: [Math.cos(angle) * (radius - 0.01), 0.026, Math.sin(angle) * (radius - 0.01)] });
  }
  root.add(createInstances(kit, kit.box(0.032, 0.01, 0.01), kit.led(palette.gold, 0.32), edgeLights, true));
}

function createInstances(kit: ModelKit, geometry: THREE.BufferGeometry, material: THREE.Material, transforms: Array<{ p: [number, number, number]; r?: [number, number, number] }>, radial = false) {
  const items = new THREE.InstancedMesh(geometry, material, transforms.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  transforms.forEach((transform, index) => {
    position.set(...transform.p);
    const rotation = transform.r || (radial ? [0, -Math.atan2(transform.p[2], transform.p[0]), 0] : [0, 0, 0]);
    euler.set(rotation[0], rotation[1], rotation[2]);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    items.setMatrixAt(index, matrix);
  });
  items.instanceMatrix.needsUpdate = true;
  return items;
}

/** 独立平台 / 分区地台。 */
function addPad(root: THREE.Group, kit: ModelKit, palette: NexusPalette, x: number, z: number, width: number, depth: number, height = 0.12, tone?: number) {
  const pad = new THREE.Mesh(kit.rounded(width, height, depth, 0.04), kit.graphiteDeep());
  pad.position.set(x, height / 2, z);
  pad.receiveShadow = true;
  root.add(pad);

  // 分区识别只靠“极低透明度的薄雾 + 一圈细边线”，
  // 旧实现用半透明色板整块铺满，会被读成廉价的彩色地贴并压过模型。
  const tint = new THREE.Mesh(kit.plane(width - 0.08, depth - 0.08), kit.ring(tone ?? palette.gridStrong, 0.055));
  tint.rotation.x = -Math.PI / 2;
  tint.position.set(x, height + 0.003, z);
  root.add(tint);

  const hw = (width - 0.07) / 2;
  const hd = (depth - 0.07) / 2;
  const outline = new THREE.BufferGeometry().setFromPoints([
    V(x - hw, height + 0.005, z - hd), V(x + hw, height + 0.005, z - hd),
    V(x + hw, height + 0.005, z - hd), V(x + hw, height + 0.005, z + hd),
    V(x + hw, height + 0.005, z + hd), V(x - hw, height + 0.005, z + hd),
    V(x - hw, height + 0.005, z + hd), V(x - hw, height + 0.005, z - hd),
  ]);
  root.add(new THREE.LineSegments(outline, kit.edge(tone ?? palette.gridStrong, 0.5)));
  return height;
}

// =============================================================================================
// 场景一：全域运行态势
// =============================================================================================

const OVERVIEW_NODES: Record<string, { position: [number, number, number]; pad?: [number, number, number, number] }> = {
  "client-web": { position: [-3.9, 0.42, 2.5], pad: [-3.9, 2.5, 1.5, 1.3] },
  "client-app": { position: [3.9, 0.42, 2.5], pad: [3.9, 2.5, 1.5, 1.3] },
  edge: { position: [0, 0, 3.15], pad: [0, 3.15, 2.0, 1.2] },
  app: { position: [0, 0.32, 0] },
  rest: { position: [-2.85, 0, -0.15], pad: [-2.85, -0.15, 1.7, 1.5] },
  auth: { position: [-3.35, 0, -2.55], pad: [-3.35, -2.55, 1.5, 1.4] },
  storage: { position: [2.85, 0, -0.1], pad: [2.85, -0.1, 1.7, 1.5] },
  realtime: { position: [3.45, 0, -2.5], pad: [3.45, -2.5, 1.5, 1.3] },
  db: { position: [0, 0, -2.35], pad: [0, -2.35, 2.1, 2.0] },
  "ai-worker": { position: [1.55, 0, -4.6], pad: [1.55, -4.6, 1.5, 1.3] },
  "ai-provider": { position: [4.6, 0, -4.3], pad: [4.6, -4.3, 1.4, 1.2] },
  metrics: { position: [-1.6, 0, -4.7], pad: [-1.6, -4.7, 1.5, 1.3] },
};

function buildOverview(snapshot: NexusSnapshot, palette: NexusPalette, particleCap: number): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  addPlatform(root, kit, palette, 6.6);

  // 中央核心：抬高的八边形基座，形成明确视觉中心。
  addPad(root, kit, palette, 0, 0, 3.6, 3.6, 0.32, palette.gold);
  const daisRing = new THREE.Mesh(kit.torus(1.5, 0.012, 6, 96), kit.ring(palette.gold, 0.5));
  daisRing.rotation.x = Math.PI / 2;
  daisRing.position.y = 0.34;
  root.add(daisRing);

  const nodes: NodeObject[] = [];
  const nodeMap = new Map<string, NodeObject>();
  for (const node of snapshot.nodes) {
    const layout = OVERVIEW_NODES[node.id];
    if (!layout) continue;
    if (layout.pad) addPad(root, kit, palette, layout.pad[0], layout.pad[1], layout.pad[2], layout.pad[3], 0.1);
    const object = createNodeObject(node, kit, palette, {
      core: node.id === "app",
      labels: true,
      metric: metricFor(node),
      footnote: node.subtitle,
    });
    object.group.position.set(...layout.position);
    object.baseY = layout.position[1];
    // 客户端在升高的接入台上，体现“从外部进入”。
    if (node.id === "client-web" || node.id === "client-app") {
      const riser = new THREE.Mesh(kit.cyl(0.62, 0.66, 0.32, 24), kit.graphiteDeep());
      riser.position.set(layout.position[0], 0.16, layout.position[2]);
      riser.receiveShadow = true;
      root.add(riser);
      const riserRing = new THREE.Mesh(kit.torus(0.63, 0.006, 5, 48), kit.ring(palette.gridStrong, 0.45));
      riserRing.rotation.x = Math.PI / 2;
      riserRing.position.set(layout.position[0], 0.325, layout.position[2]);
      root.add(riserRing);
      object.group.position.y = 0.32;
      object.baseY = 0.32;
    }
    root.add(object.group);
    nodes.push(object);
    nodeMap.set(node.id, object);
  }

  const links: LinkObject[] = [];
  for (const link of snapshot.links) {
    const from = nodeMap.get(link.from);
    const to = nodeMap.get(link.to);
    if (!from || !to) continue;
    const offset = (object: NodeObject) => object.group.position.clone().add(V(0, object.anchorY * 0.42, 0));
    const object = createLinkObject(link, offset(from), offset(to), palette, particleCap);
    root.add(object.group);
    links.push(object);
  }

  return {
    key: "overview",
    root,
    kit,
    nodes,
    links,
    pickables: nodes.flatMap((node) => node.model.pickables),
    defaultCamera: { position: [9.2, 11.4, 10.6], target: [0, 0.75, 0] },
    bounds: { center: [0, 0.4, -0.4], radius: 6.4 },
    update(next) {
      const byId = new Map(next.nodes.map((node) => [node.id, node]));
      for (const object of nodes) {
        const node = byId.get(object.id);
        if (!node) continue;
        object.setStatus(node.status);
        object.setLabelMetric(metricFor(node));
      }
      const linkById = new Map(next.links.map((link) => [link.id, link]));
      for (const object of links) {
        const link = linkById.get(object.id);
        if (link) object.update(link.rate, link.bytesPerSecond, link.measured);
      }
      if (!next.sources.agent) {
        for (const object of links) object.flow.suspend();
      }
    },
    setSelected(id) {
      for (const object of nodes) object.setSelected(object.id === id);
      for (const object of links) object.setActive(Boolean(id && (object.link.from === id || object.link.to === id)));
    },
    focusPoint(id) {
      const node = nodeMap.get(id);
      return node ? node.group.position.clone().add(V(0, 0.5, 0)) : null;
    },
    dispose() {
      disposeObject(root);
      kit.dispose();
    },
  };
}

function metricFor(node: NexusSnapshot["nodes"][number]) {
  const metric = node.metrics.find((item) => item.value != null);
  if (!metric) return "未接入实时指标";
  return `${metric.label} ${formatMetric(metric.value, metric.unit)}`;
}

function formatMetric(value: number | null, unit: string) {
  if (value == null) return "—";
  if (unit === "B" || unit === "B/s") return formatBytes(value) + (unit === "B/s" ? "/s" : "");
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K${unit}`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

// =============================================================================================
// 场景二：全球网络态势
// =============================================================================================

function buildGlobe(scene: NexusGlobeScene | null, palette: NexusPalette): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  const radius = 3;
  const texture = buildLandTexture(palette.mode);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 64),
    new THREE.MeshStandardMaterial({
      map: texture,
      metalness: palette.mode === "dark" ? 0.18 : 0.12,
      roughness: palette.mode === "dark" ? 0.82 : 0.72,
      envMapIntensity: 0.55,
    }),
  );
  root.add(globe);

  // 经纬网：细、低透明度，提供工程感而不是装饰。
  const graticule: number[] = [];
  const pushPoint = (lon: number, lat: number) => {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    graticule.push(
      -radius * 1.001 * Math.sin(phi) * Math.cos(theta),
      radius * 1.001 * Math.cos(phi),
      radius * 1.001 * Math.sin(phi) * Math.sin(theta),
    );
  };
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 4) {
      pushPoint(lon, lat); pushPoint(lon + 4, lat);
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -90; lat < 90; lat += 4) {
      pushPoint(lon, lat); pushPoint(lon, lat + 4);
    }
  }
  const graticuleGeometry = new THREE.BufferGeometry();
  graticuleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(graticule, 3));
  root.add(new THREE.LineSegments(graticuleGeometry, kit.edge(palette.gridStrong, 0.22)));

  // 大气：仅边缘的 Fresnel 轮廓光。
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.055, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(palette.cyan) },
        uPower: { value: 3.8 },
        uIntensity: { value: palette.mode === "dark" ? 0.3 : 0.2 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uPower;
        uniform float uIntensity;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - abs(dot(vNormal, vView)), uPower);
          gl_FragColor = vec4(uColor, rim * uIntensity);
        }
      `,
    }),
  );
  root.add(atmosphere);

  // 服务节点：地理坐标未接入时不做地理位置声明，只作为轴上的“待定位”模块。
  const serverMarker = new THREE.Group();
  // 地面站：贴地环 + 短桅杆 + 信标，不做夸张的高天线（旧实现高出球面 1/4 直径）。
  const groundRing = new THREE.Mesh(kit.torus(0.22, 0.008, 5, 48), kit.ring(palette.gold, 0.6));
  groundRing.rotation.x = Math.PI / 2;
  groundRing.position.y = 0.01;
  serverMarker.add(groundRing);
  const mast = new THREE.Mesh(kit.cyl(0.01, 0.012, 0.34, 8), kit.titaniumMatte());
  mast.position.y = 0.17;
  serverMarker.add(mast);
  const beacon = new THREE.Mesh(kit.cyl(0.05, 0.075, 0.07, 6), kit.graphite());
  beacon.position.y = 0.37;
  serverMarker.add(beacon);
  const led = new THREE.Mesh(kit.box(0.05, 0.012, 0.05), kit.led(palette.gold, 1.2));
  led.position.y = 0.42;
  serverMarker.add(led);
  // 有真实经纬度才落到球面；没有就只显示“未接入经纬度”，不把节点摆到北极点上冒充位置。
  const nodeLat = scene?.serverNode?.lat;
  const nodeLon = scene?.serverNode?.lon;
  const hasGeo = typeof nodeLat === "number" && typeof nodeLon === "number";
  if (hasGeo) {
    const phi = (90 - nodeLat!) * Math.PI / 180;
    const theta = (nodeLon! + 180) * Math.PI / 180;
    serverMarker.position.set(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
    // 让桅杆沿球面法线方向立起来。
    serverMarker.lookAt(0, 0, 0);
    serverMarker.rotateX(Math.PI / 2);
  }
  serverMarker.visible = hasGeo;
  root.add(serverMarker);

  const serverLabel = createSpriteLabel(
    "服务节点",
    hasGeo ? (scene?.serverNode?.label || "HEIKA 生产环境") : "经纬度未接入",
    palette, 0.62, palette.gold,
  );
  if (hasGeo) serverLabel.position.copy(serverMarker.position).multiplyScalar(1.16);
  else serverLabel.position.set(0, radius + 0.62, 0);
  root.add(serverLabel);

  // 真实国家数据才落点；没有经纬度的连接数单独提示，不伪造城市。
  const points: Array<{ position: THREE.Vector3; requests: number }> = [];
  const maxRequests = Math.max(1, ...(scene?.countries || []).map((row) => row.requests));
  for (const country of scene?.countries || []) {
    const centroid = COUNTRY_CENTROIDS[country.country];
    if (!centroid) continue;
    const [lon, lat] = centroid;
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    const position = V(
      -radius * 1.012 * Math.sin(phi) * Math.cos(theta),
      radius * 1.012 * Math.cos(phi),
      radius * 1.012 * Math.sin(phi) * Math.sin(theta),
    );
    points.push({ position, requests: country.requests });
    const dot = new THREE.Mesh(
      kit.cyl(0.03 + (country.requests / maxRequests) * 0.04, 0.03, 0.012, 12),
      kit.led(palette.cyan, 1.1),
    );
    dot.position.copy(position);
    dot.lookAt(0, 0, 0);
    root.add(dot);
    // 细立柱表示访问量，不做跨洲光束。
    const stem = new THREE.Mesh(kit.cyl(0.004, 0.004, 0.1 + (country.requests / maxRequests) * 0.4, 6), kit.ring(palette.cyan, 0.4));
    stem.position.copy(position.clone().multiplyScalar(1.03));
    stem.lookAt(0, 0, 0);
    stem.rotateX(Math.PI / 2);
    root.add(stem);
  }

  return {
    key: "globe",
    root,
    kit,
    nodes: [],
    links: [],
    pickables: [],
    defaultCamera: { position: [5.6, 3.4, 8.2], target: [0, 0.2, 0] },
    bounds: { center: [0, 0.4, 0], radius: 4.1 },
    update() { /* 地球只随场景数据刷新，不随秒级指标抖动。 */ },
    setSelected() {},
    focusPoint() { return V(0, 0, 0); },
    dispose() {
      texture.dispose();
      disposeObject(root);
      kit.dispose();
    },
  };
}

// =============================================================================================
// 场景三：服务器数字孪生
// =============================================================================================

type TwinLayer = {
  id: string;
  label: string;
  group: THREE.Group;
  baseY: number;
  spread: number;
  materials: THREE.Material[];
  leds: THREE.MeshStandardMaterial[];
  plate: THREE.Mesh;
};

function buildServer(snapshot: NexusSnapshot, palette: NexusPalette): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  addPlatform(root, kit, palette, 5.6);

  const layers: TwinLayer[] = [];
  const layerLabels: THREE.Sprite[] = [];
  const shell = new THREE.Group();
  root.add(shell);

  // ---------- 机箱外壳 ----------
  const shellMaterial = kit.graphite();
  const bottom = new THREE.Mesh(kit.rounded(3.0, 0.08, 2.0, 0.02), shellMaterial);
  bottom.position.y = 0.18;
  bottom.receiveShadow = true;
  shell.add(bottom);

  const topCover = new THREE.Group();
  const topPlate = new THREE.Mesh(kit.rounded(3.0, 0.06, 2.0, 0.02), kit.graphite());
  topPlate.position.y = 2.62;
  topCover.add(topPlate);
  const topVents: Array<{ p: [number, number, number] }> = [];
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      topVents.push({ p: [-1.1 + column * 0.55, 2.655, -0.6 + row * 0.15] });
    }
  }
  topCover.add(createInstances(kit, kit.rounded(0.34, 0.008, 0.06, 0.003), kit.composite(), topVents));
  shell.add(topCover);

  const panels: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const panel = new THREE.Group();
    const body = new THREE.Mesh(kit.rounded(0.05, 2.4, 2.0, 0.014), kit.graphite());
    body.position.set(side * 1.5, 1.4, 0);
    panel.add(body);
    const glass = new THREE.Mesh(kit.rounded(0.012, 1.9, 1.5, 0.004), kit.glass(0.16));
    glass.position.set(side * 1.53, 1.42, 0);
    panel.add(glass);
    for (const z of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(kit.rounded(0.03, 2.3, 0.05, 0.01), kit.titaniumMatte());
      rail.position.set(side * 1.48, 1.4, z);
      panel.add(rail);
    }
    shell.add(panel);
    panels.push(panel);
  }

  const front = new THREE.Group();
  const bezel = new THREE.Mesh(kit.rounded(2.86, 2.42, 0.08, 0.02), kit.graphiteDeep());
  bezel.position.set(0, 1.4, 1.02);
  front.add(bezel);
  const driveBezels: Array<{ p: [number, number, number] }> = [];
  for (let index = 0; index < 8; index += 1) {
    driveBezels.push({ p: [-1.2 + (index % 4) * 0.8, 1.9 - Math.floor(index / 4) * 0.36, 1.065] });
  }
  front.add(createInstances(kit, kit.rounded(0.7, 0.28, 0.02, 0.006), kit.composite(), driveBezels));
  const frontLeds: Array<{ p: [number, number, number] }> = [];
  for (let index = 0; index < 8; index += 1) {
    frontLeds.push({ p: [-0.9 + (index % 4) * 0.8, 1.9 - Math.floor(index / 4) * 0.36, 1.08] });
  }
  const frontLedMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: palette.cyan, emissiveIntensity: 1.3, metalness: 0.2, roughness: 0.3,
  });
  front.add(createInstances(kit, kit.box(0.02, 0.02, 0.008), frontLedMaterial, frontLeds));
  shell.add(front);

  // ---------- 五层内部结构 ----------
  const specs = [
    { id: "layer:cpu", label: "CPU 计算层", y: 2.18, spread: 0.9, tone: "cyan" },
    { id: "layer:mem", label: "内存层", y: 1.78, spread: 0.55, tone: "violet" },
    { id: "layer:disk", label: "磁盘层", y: 1.36, spread: 0.2, tone: "gold" },
    { id: "layer:net", label: "网络层", y: 0.94, spread: -0.15, tone: "blue" },
    { id: "layer:process", label: "进程层", y: 0.44, spread: -0.5, tone: "green" },
  ];

  for (const spec of specs) {
    const group = new THREE.Group();
    group.position.y = spec.y;
    const tone = toneValue(palette, spec.tone);
    const materials: THREE.Material[] = [];
    const leds: THREE.MeshStandardMaterial[] = [];

    const plateMaterial = kit.composite();
    const plate = new THREE.Mesh(kit.rounded(2.7, 0.06, 1.7, 0.012), plateMaterial);
    plate.userData.nodeId = spec.id;
    plate.receiveShadow = true;
    group.add(plate);
    const rimMaterial = kit.ring(tone, 0.42);
    const rim = new THREE.Mesh(kit.rounded(2.72, 0.008, 1.72, 0.02), rimMaterial);
    rim.position.y = 0.035;
    group.add(rim);
    materials.push(plateMaterial, rimMaterial);

    if (spec.id === "layer:cpu") {
      const pcb = new THREE.Mesh(kit.rounded(2.5, 0.02, 1.5, 0.006), kit.pcb());
      pcb.position.y = 0.045;
      group.add(pcb);
      const packageMesh = new THREE.Mesh(kit.rounded(0.56, 0.07, 0.56, 0.012), kit.titanium());
      packageMesh.position.set(-0.5, 0.09, 0);
      group.add(packageMesh);
      group.add(new THREE.Mesh(kit.rounded(0.3, 0.012, 0.3, 0.004), kit.ring(palette.cyan, 0.55)).translateY(0.128).translateX(-0.5));
      // 散热器：基座 + 14 片鳍片（实例化）。
      const sink = new THREE.Mesh(kit.rounded(0.86, 0.05, 0.86, 0.012), kit.titaniumMatte());
      sink.position.set(-0.5, 0.16, 0);
      group.add(sink);
      const fins: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 14; index += 1) {
        fins.push({ p: [-0.5 - 0.37 + index * 0.055, 0.26, 0] });
      }
      group.add(createInstances(kit, kit.box(0.012, 0.18, 0.74), kit.titaniumMatte(), fins));
      const chips: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 8; index += 1) {
        chips.push({ p: [0.35 + (index % 4) * 0.16, 0.075, -0.32 + Math.floor(index / 4) * 0.64] });
      }
      group.add(createInstances(kit, kit.box(0.1, 0.03, 0.1), kit.titanium(), chips));
      const cpuLeds: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 6; index += 1) {
        cpuLeds.push({ p: [-0.9 + index * 0.34, 0.05, 0.7] });
      }
      const ledMaterial = new THREE.MeshStandardMaterial({
        color: 0x05070a, emissive: tone, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.3,
      });
      group.add(createInstances(kit, kit.box(0.06, 0.012, 0.012), ledMaterial, cpuLeds));
      leds.push(ledMaterial);
    } else if (spec.id === "layer:mem") {
      const slots: Array<{ p: [number, number, number] }> = [];
      const dimms: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 8; index += 1) {
        const x = -1.15 + index * 0.33;
        slots.push({ p: [x, 0.05, 0] });
        dimms.push({ p: [x, 0.28, 0] });
      }
      group.add(createInstances(kit, kit.box(0.24, 0.04, 1.1), kit.graphiteDeep(), slots));
      group.add(createInstances(kit, kit.rounded(0.05, 0.42, 1.0, 0.008), kit.titanium(), dimms));
      const clips: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 8; index += 1) {
        clips.push({ p: [-1.15 + index * 0.33, 0.49, 0.48] });
        clips.push({ p: [-1.15 + index * 0.33, 0.49, -0.48] });
      }
      group.add(createInstances(kit, kit.box(0.06, 0.06, 0.05), kit.brass(), clips));
      const ledMaterial = new THREE.MeshStandardMaterial({
        color: 0x05070a, emissive: tone, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.3,
      });
      const memLeds: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 8; index += 1) memLeds.push({ p: [-1.15 + index * 0.33, 0.5, 0] });
      group.add(createInstances(kit, kit.box(0.02, 0.01, 0.02), ledMaterial, memLeds));
      leds.push(ledMaterial);
    } else if (spec.id === "layer:disk") {
      const caddies: Array<{ p: [number, number, number] }> = [];
      const handles: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 4; index += 1) {
        caddies.push({ p: [-1.0 + index * 0.66, 0.16, 0] });
        handles.push({ p: [-1.0 + index * 0.66, 0.16, 0.56] });
      }
      group.add(createInstances(kit, kit.rounded(0.58, 0.18, 1.0, 0.008), kit.composite(), caddies));
      group.add(createInstances(kit, kit.rounded(0.3, 0.03, 0.02, 0.006), kit.titanium(), handles));
      const ledMaterial = new THREE.MeshStandardMaterial({
        color: 0x05070a, emissive: tone, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.3,
      });
      const diskLeds: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 4; index += 1) diskLeds.push({ p: [-1.0 + index * 0.66 + 0.2, 0.2, 0.52] });
      group.add(createInstances(kit, kit.box(0.02, 0.012, 0.006), ledMaterial, diskLeds));
      leds.push(ledMaterial);
    } else if (spec.id === "layer:net") {
      const card = new THREE.Mesh(kit.rounded(1.9, 0.02, 0.9, 0.006), kit.pcb());
      card.position.y = 0.05;
      group.add(card);
      group.add(new THREE.Mesh(kit.rounded(0.3, 0.05, 0.3, 0.008), kit.titanium()).translateX(-0.55).translateY(0.1));
      const ports: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 8; index += 1) ports.push({ p: [0.1 + (index % 4) * 0.18, 0.1, -0.22 + Math.floor(index / 4) * 0.3] });
      group.add(createInstances(kit, kit.box(0.12, 0.08, 0.12), kit.titaniumMatte(), ports));
      const cages: Array<{ p: [number, number, number] }> = [];
      for (let index = 0; index < 4; index += 1) cages.push({ p: [0.95, 0.1, -0.3 + index * 0.2] });
      group.add(createInstances(kit, kit.box(0.2, 0.06, 0.12), kit.graphiteDeep(), cages));
    } else {
      // 进程层：明确的逻辑视图（半透明任务方块），不是物理硬件。
      const cellCount = Math.min(8, Math.max(1, snapshot.processes.length));
      for (let index = 0; index < cellCount; index += 1) {
        const cell = new THREE.Mesh(kit.rounded(0.34, 0.34, 0.34, 0.02), kit.glass(0.26));
        cell.position.set(-1.05 + (index % 4) * 0.7, 0.22, index < 4 ? 0.36 : -0.36);
        group.add(cell);
        const wire = new THREE.LineSegments(new THREE.EdgesGeometry(cell.geometry), kit.edge(tone, 0.42));
        cell.add(wire);
      }
      const label = createSpriteLabel("逻辑运行视图", "非物理硬件", palette, 0.6, tone);
      label.position.set(0, 1.0, 0);
      group.add(label);
    }

    shell.add(group);

    // 分层标签：闭合状态隐藏（内部层被外壳完全遮住，标签浮在外面就是“无依据漂浮”）；
    // 分解状态显示，并用引导线连到机箱侧板接口位置。
    const layerLabel = createSpriteLabel(spec.label, "", palette, 0.58, tone);
    layerLabel.position.set(1.98, spec.y + 0.2, 1.0);
    root.add(layerLabel);
    const labelObject = layerLabel.userData.label as LabelObject | undefined;
    if (labelObject) {
      root.add(labelObject.leader);
      root.add(labelObject.anchor);
      labelObject.anchor.position.set(1.52, spec.y + 0.04, 0.98);
      labelObject.leader.geometry.setFromPoints([
        labelObject.anchor.position.clone(),
        layerLabel.position.clone().add(V(0, -0.02, 0)),
      ]);
      labelObject.setVisible(false);
      layerLabel.visible = false;
    }
    layerLabels.push(layerLabel);
    layers.push({ id: spec.id, label: spec.label, group, baseY: spec.y, spread: spec.spread, materials, leds, plate });
  }

  // 机箱立面标牌。
  const badge = createSpriteLabel("HEIKA 计算节点", "逻辑数字孪生 · 非物理机型", palette, 0.7, palette.gold);
  badge.position.set(0, 2.95, 0.4);
  root.add(badge);

  let exploded = false;
  const applyExplode = (value: boolean) => {
    exploded = value;
    // 分解时五层沿垂直方向等距展开，保持同一水平面内的相对关系，
    // 不再用正负不同的偏移（旧实现最底层会掉到地台以下，且横向错位导致穿模）。
    layers.forEach((layer, index) => {
      layer.group.position.y = exploded ? 0.42 + index * 0.74 : layer.baseY;
      layer.group.position.x = 0;
      layer.group.position.z = 0;
    });
    // 闭合时标签完全隐藏，避免内部标签漂浮在机箱外面。
    layerLabels.forEach((label, index) => {
      const object = label.userData.label as LabelObject | undefined;
      if (object) object.setVisible(exploded);
      label.visible = exploded;
      label.position.x = 1.9 + index * 0.16;
    });
    badge.visible = !exploded;
    topCover.position.y = exploded ? 1.6 : 0;
    panels.forEach((panel, index) => {
      panel.position.x = exploded ? (index === 0 ? -1.15 : 1.15) : 0;
    });
    front.position.z = exploded ? 1.45 : 0;
  };
  applyExplode(false);

  const setLayerVisual = (layer: TwinLayer, value: number | null, tone: string) => {
    const color = value == null ? palette.neutral : value >= 90 ? palette.red : value >= 75 ? palette.amber : toneValue(palette, tone);
    for (const material of layer.leds) material.emissive.setHex(color);
  };

  const apply = (next: NexusSnapshot) => {
    const { cpuPercent, memPercent, diskPercent, netRxRate, netTxRate } = next.server;
    const net = netRxRate == null && netTxRate == null ? null : Math.min(100, ((netRxRate || 0) + (netTxRate || 0)) / 1048576 * 6);
    setLayerVisual(layers[0], cpuPercent, "cyan");
    setLayerVisual(layers[1], memPercent, "violet");
    setLayerVisual(layers[2], diskPercent, "gold");
    setLayerVisual(layers[3], net, "cyan");
    setLayerVisual(layers[4], next.processes.length ? Math.min(100, next.processes.reduce((sum, row) => sum + (row.cpu_percent || 0), 0)) : null, "cyan");
    frontLedMaterial.emissive.setHex(next.server.cpuPercent != null && next.server.cpuPercent >= 90 ? palette.red : palette.cyan);
  };
  apply(snapshot);

  return {
    key: "server",
    root,
    kit,
    nodes: [],
    links: [],
    pickables: layers.map((layer) => layer.plate),
    defaultCamera: { position: [5.6, 6.6, 6.4], target: [0, 1.3, 0] },
    bounds: { center: [0, 1.35, 0], radius: 3.1 },
    update: apply,
    setSelected(id) {
      for (const layer of layers) {
        const active = layer.id === id;
        layer.group.position.y = layer.baseY + (exploded ? layer.spread * 1.9 : 0) + (active ? 0.12 : 0);
        const dim = id && !active;
        for (const material of layer.materials) {
          material.transparent = Boolean(dim);
          material.opacity = dim ? 0.32 : 1;
        }
      }
    },
    setExplode: applyExplode,
    focusPoint(id) {
      const layer = layers.find((item) => item.id === id);
      return layer ? V(0, layer.group.position.y + 0.1, 0) : V(0, 1.3, 0);
    },
    dispose() {
      disposeObject(root);
      kit.dispose();
    },
  };
}

// =============================================================================================
// 场景四：资源数据城市
// =============================================================================================

function buildStorage(data: NexusStorageScene | null, palette: NexusPalette): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  addPlatform(root, kit, palette, 6.5);

  const pickables: THREE.Object3D[] = [];
  const points = new Map<string, THREE.Vector3>();
  const buildings = data?.buildings || [];
  const maxBytes = Math.max(1, ...buildings.map((row) => row.bytes));
  const kindOrder = ["image", "video", "object", "other"];
  const kindLabel: Record<string, string> = { image: "图片", video: "视频", object: "存储桶对象", bucket: "存储桶对象", other: "其他资源" };
  const kindTone: Record<string, string> = { image: "cyan", video: "gold", object: "blue", bucket: "blue", other: "neutral" };
  const districtSlots: Array<[number, number]> = [[-3.05, -2.35], [3.05, -2.35], [-3.05, 2.35], [3.05, 2.35]];

  // 分区来自真实数据里出现的 kind：不再用固定四种去匹配，
  // 否则 kind 命名一变就整片空着（旧实现出现过只有两块分区的情况）。
  const districtKinds = [...new Set(buildings.map((row) => row.kind))]
    .sort((a, b) => {
      const ai = kindOrder.indexOf(a);
      const bi = kindOrder.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    })
    .slice(0, 4);

  // 跨建筑共用一套窗光与檐口，控制绘制次数。
  const windowTransforms: Array<{ p: [number, number, number]; r?: [number, number, number] }> = [];

  districtKinds.forEach((kind, districtIndex) => {
    const rows = buildings.filter((row) => row.kind === kind);
    if (!rows.length) return;
    const [cx, cz] = districtSlots[districtIndex] || districtSlots[3];
    const tone = kindTone[kind] || "neutral";
    addPad(root, kit, palette, cx, cz, 3.9, 3.0, 0.12, toneValue(palette, tone));

    const districtLabel = createSpriteLabel(
      kindLabel[kind] || kind,
      `${rows.length} 类 · ${formatBytes(rows.reduce((sum, row) => sum + row.bytes, 0))}`,
      palette, 0.62, toneValue(palette, tone),
    );
    districtLabel.position.set(cx - 1.55, 0.28, cz + 1.35);
    root.add(districtLabel);

    rows.slice(0, 6).forEach((building, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = cx + (column - 1) * 1.12;
      const z = cz + (row - 0.5) * 1.12;
      const ratio = Math.log10(1 + building.bytes) / Math.log10(1 + maxBytes);
      const height = 0.5 + ratio * 3.1;
      const footprint = 0.82;
      const material = new THREE.MeshStandardMaterial({
        color: palette.mode === "dark" ? 0x2a3237 : 0xd7dedf,
        metalness: 0.4, roughness: 0.55,
      });
      // 2–3 段收分，避免一根方柱。
      const segments = height > 2.2 ? 3 : height > 1.2 ? 2 : 1;
      let bottom = 0.12;
      for (let segment = 0; segment < segments; segment += 1) {
        const segmentHeight = height / segments - 0.02;
        const shrink = 1 - segment * 0.12;
        const block = new THREE.Mesh(kit.rounded(footprint * shrink, segmentHeight, footprint * shrink, 0.012), material);
        block.position.set(x, bottom + segmentHeight / 2, z);
        block.castShadow = true;
        block.receiveShadow = true;
        block.userData.nodeId = `storage:${building.key}`;
        root.add(block);
        pickables.push(block);
        // 檐口
        const cornice = new THREE.Mesh(kit.rounded(footprint * shrink + 0.04, 0.02, footprint * shrink + 0.04, 0.008), kit.ring(toneValue(palette, tone), 0.45));
        cornice.position.set(x, bottom + segmentHeight, z);
        root.add(cornice);
        bottom += segmentHeight;
      }
      // 窗光：每两层一组，四面少量点缀。
      const floors = Math.max(2, Math.min(6, Math.floor(height / 0.4)));
      for (let floor = 0; floor < floors; floor += 1) {
        for (const [dx, dz, ry] of [[0, footprint / 2 + 0.001, 0], [0, -footprint / 2 - 0.001, Math.PI], [footprint / 2 + 0.001, 0, Math.PI / 2], [-footprint / 2 - 0.001, 0, -Math.PI / 2]] as const) {
          if ((floor + Math.round(dz * 10)) % 3 === 0) continue;
          // 窗光必须贴在立面上：旧实现乘了 0.9，实际埋在实体内部，一扇都看不见。
          windowTransforms.push({
            p: [x + dx * 1.01, 0.24 + floor * (height / floors), z + dz * 1.01],
            r: [0, ry, 0],
          });
        }
      }
      // 屋顶设备与天线。
      const antenna = new THREE.Mesh(kit.cyl(0.006, 0.006, 0.3, 6), kit.titaniumMatte());
      antenna.position.set(x, bottom + 0.15, z);
      root.add(antenna);
      const beacon = new THREE.Mesh(kit.sphere(0.018, 8, 6), kit.led(toneValue(palette, tone), 0.9));
      beacon.position.set(x, bottom + 0.31, z);
      root.add(beacon);
      points.set(`storage:${building.key}`, V(x, bottom / 2 + 0.4, z));

      // 只在每个分区最高的一栋上标数值，避免同名标签重复堆叠。
      if (index === 0) {
        const label = createSpriteLabel(building.label, `${formatBytes(building.bytes)} · ${building.objects}`, palette, 0.52, toneValue(palette, tone));
        label.position.set(x, bottom + 0.42, z);
        root.add(label);
      }
    });
  });

  root.add(createInstances(kit, kit.box(0.16, 0.09, 0.008), kit.led(palette.amber, 0.55), windowTransforms));

  const scaleNote = createSpriteLabel("高度 = log₁₀(占用字节)", "同层级统一口径", palette, 0.6, palette.neutral);
  scaleNote.position.set(0, 0.4, 4.4);
  root.add(scaleNote);

  return {
    key: "storage",
    root,
    kit,
    nodes: [],
    links: [],
    pickables,
    defaultCamera: { position: [8.6, 11.0, 10.2], target: [0, 0.8, 0] },
    bounds: { center: [0, 0.6, 0], radius: 7.2 },
    update() { /* 建筑由真实存储快照构建，不随秒级指标变化。 */ },
    setSelected(id) {
      for (const pickable of pickables) {
        const mesh = pickable as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (!material || !("metalness" in material)) continue;
        const matched = id && pickable.userData.nodeId === id;
        material.emissive.setHex(matched ? palette.gold : 0x000000);
        material.emissiveIntensity = matched ? 0.35 : 0;
      }
    },
    focusPoint(id) { return points.get(id) || null; },
    dispose() {
      disposeObject(root);
      kit.dispose();
    },
  };
}

// =============================================================================================
// 场景五：AI 智能中枢
// =============================================================================================

function buildAi(snapshot: NexusSnapshot, data: NexusAiScene | null, palette: NexusPalette, particleCap: number): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  addPlatform(root, kit, palette, 6.0);

  const purposes = data?.purposes?.length ? data.purposes : snapshot.ai.byPurpose;
  const coreNode = createNodeObject(
    { id: "ai-core", label: "AI 调度核心", kind: "ai", status: data?.available === false ? "unknown" : "healthy" },
    kit, palette, { footnote: "任务编排与审核决策", metric: data?.queue?.running != null ? `执行中 ${data.queue.running}` : "队列未接入" },
  );
  coreNode.group.position.set(0, 0.28, 0);
  coreNode.baseY = 0.28;
  root.add(coreNode.group);
  addPad(root, kit, palette, 0, 0, 3.0, 3.0, 0.28, palette.violet);

  const nodeObjects = [coreNode];
  const links: LinkObject[] = [];
  const positions = new Map<string, THREE.Vector3>([["ai-core", V(0, 0.8, 0)]]);
  const maxCalls = Math.max(1, ...purposes.map((row) => row.calls));

  // 能力节点：小型计算刀片，尺寸按真实调用量映射。
  purposes.slice(0, 8).forEach((purpose, index) => {
    const angle = (index / Math.max(1, Math.min(8, purposes.length))) * Math.PI * 2 + Math.PI / 8;
    const radius = 3.25;
    const size = 0.32 + (purpose.calls / maxCalls) * 0.14;
    const group = new THREE.Group();
    const blade = new THREE.Mesh(kit.rounded(size, size * 1.5, size * 0.5, 0.012), kit.graphite());
    blade.userData.nodeId = `purpose:${purpose.purpose}`;
    blade.castShadow = true;
    group.add(blade);
    const glass = new THREE.Mesh(kit.rounded(size * 0.76, size * 1.1, 0.02, 0.006), kit.glass(0.34));
    glass.position.z = size * 0.26;
    group.add(glass);
    const led = new THREE.Mesh(kit.box(size * 0.5, 0.012, 0.012), kit.led(palette.violet, 1.1));
    led.position.set(0, size * 0.62, size * 0.26);
    group.add(led);
    group.position.set(Math.cos(angle) * radius, 0.34, Math.sin(angle) * radius);
    group.rotation.y = -angle;
    root.add(group);
    positions.set(`purpose:${purpose.purpose}`, group.position.clone());

    const label = createSpriteLabel(purpose.purpose, `${purpose.calls} 次/时 · ${purpose.tokens} token`, palette, 0.56, palette.violet);
    label.position.set(group.position.x, 0.86, group.position.z);
    root.add(label);

    const link = createLinkObject({
      id: `ai-${purpose.purpose}`, from: "ai-core", to: `purpose:${purpose.purpose}`, kind: "ai",
      label: purpose.purpose, rate: purpose.calls / 3600, bytesPerSecond: null, latencyMs: purpose.avgMs,
      errorRate: purpose.calls ? purpose.errors / purpose.calls * 100 : null, direction: "one-way", measured: purpose.calls > 0,
    }, V(0.3, 0.95, 0), group.position.clone().add(V(0, 0.3, 0)), palette, particleCap);
    root.add(link.group);
    links.push(link);
  });

  // 模型调用设施：只展示真实配置中出现的模型。
  const models = (data?.models || []).slice(0, 3);
  models.forEach((model, index) => {
    const x = -1.9 + index * 1.9;
    const node = createNodeObject(
      { id: `model:${model.model}`, label: model.model, kind: "external", status: "healthy" },
      kit, palette, { footnote: "外部模型服务", metric: `${model.calls} 次 · ${model.tokens} token` },
    );
    node.group.position.set(x, 0.12, -3.65);
    node.baseY = 0.12;
    root.add(node.group);
    nodeObjects.push(node);
    positions.set(`model:${model.model}`, node.group.position.clone());
    const link = createLinkObject({
      id: `ai-model-${index}`, from: "ai-core", to: `model:${model.model}`, kind: "ai",
      label: model.model, rate: model.calls / 3600, bytesPerSecond: null, latencyMs: model.avgMs,
      errorRate: null, direction: "two-way", measured: model.calls > 0,
    }, V(0, 1.1, -0.5), node.group.position.clone().add(V(0, 0.4, 0)), palette, particleCap);
    root.add(link.group);
    links.push(link);
  });

  // 自动审核流水线：四个真实阶段，不显示人工审核。
  const stages = [
    { id: "stage:submit", label: "提交修改", x: -3.0, tone: "blue" },
    { id: "stage:review", label: "AI 检测", x: -1.0, tone: "violet" },
    { id: "stage:approved", label: "自动通过", x: 1.0, tone: "green" },
    { id: "stage:rejected", label: "自动驳回", x: 3.0, tone: "amber" },
  ];
  stages.forEach((stage) => {
    const z = 3.4;
    const base = new THREE.Mesh(kit.cyl(0.28, 0.32, 0.16, 24), kit.graphiteDeep());
    base.position.set(stage.x, 0.08, z);
    root.add(base);
    const column = new THREE.Mesh(kit.cyl(0.2, 0.2, 0.62, 24, true), kit.glass(0.24));
    column.position.set(stage.x, 0.48, z);
    column.userData.nodeId = stage.id;
    root.add(column);
    const top = new THREE.Mesh(kit.cyl(0.22, 0.22, 0.02, 24), kit.ring(toneValue(palette, stage.tone), 0.9));
    top.position.set(stage.x, 0.8, z);
    root.add(top);
    const led = new THREE.Mesh(kit.cyl(0.06, 0.06, 0.02, 16), kit.led(toneValue(palette, stage.tone), 1.2));
    led.position.set(stage.x, 0.82, z);
    root.add(led);
    const label = createSpriteLabel(stage.label, "", palette, 0.52, toneValue(palette, stage.tone));
    label.position.set(stage.x, 1.05, z);
    root.add(label);
    positions.set(stage.id, V(stage.x, 0.6, z));
    // 阶段之间的传送槽。
    if (stage.x < 3) {
      const gutter = new THREE.Mesh(kit.box(1.5, 0.02, 0.18), kit.composite());
      gutter.position.set(stage.x + 1.0, 0.02, z);
      root.add(gutter);
    }
  });

  return {
    key: "ai",
    root,
    kit,
    nodes: nodeObjects,
    links,
    pickables: [...nodeObjects.flatMap((node) => node.model.pickables), ...root.children.filter((child) => child.userData.nodeId)],
    defaultCamera: { position: [7.4, 9.0, 9.0], target: [0, 0.7, 0] },
    bounds: { center: [0, 0.7, 0], radius: 5.4 },
    update(next) {
      coreNode.setStatus(next.ai.available ? "healthy" : "unknown");
      const byId = new Map(next.ai.byPurpose.map((row) => [row.purpose, row]));
      for (const link of links) {
        if (!link.link.to.startsWith("purpose:")) continue;
        const purpose = link.link.to.replace("purpose:", "");
        const row = byId.get(purpose);
        link.update(row ? row.calls / 3600 : 0, null, Boolean(row));
      }
      coreNode.setLabelMetric(next.ai.queue == null ? "队列未接入" : `队列 ${next.ai.queue}`);
    },
    setSelected(id) {
      for (const node of nodeObjects) node.setSelected(node.id === id);
      for (const link of links) link.setActive(Boolean(id && (link.link.from === id || link.link.to === id)));
    },
    focusPoint(id) { return positions.get(id) || null; },
    dispose() {
      disposeObject(root);
      kit.dispose();
    },
  };
}

// =============================================================================================
// 场景六：内容知识宇宙
// =============================================================================================

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function buildContent(data: NexusContentScene | null, palette: NexusPalette): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const positions = new Map<string, THREE.Vector3>();
  const orbit = new THREE.Group();
  root.add(orbit);

  if (!data) {
    return {
      key: "content", root, kit, nodes: [], links: [], pickables,
      defaultCamera: { position: [7.6, 9.6, 9.8], target: [0, 0.6, 0.8] },
      bounds: { center: [0, 0.6, 0], radius: 6 },
      update() {}, setSelected() {}, focusPoint() { return null; },
      dispose() { disposeObject(root); kit.dispose(); },
    };
  }

  // 四类内容落在同一水平面上，形成有地面的“星群”而不是悬浮的散点。
  addPlatform(root, kit, palette, 6.3);
  const clusters = [
    { key: "community", label: "社区作品", center: V(-2.9, 0.34, 0.5), tone: "cyan" as const },
    { key: "ai", label: "AI 资源", center: V(2.6, 0.34, 0.7), tone: "violet" as const },
    { key: "series", label: "合集", center: V(0.3, 0.34, -2.9), tone: "gold" as const },
    { key: "tags", label: "标签", center: V(-0.2, 0.34, 3.0), tone: "blue" as const },
  ];
  for (const cluster of clusters) {
    addPad(root, kit, palette, cluster.center.x, cluster.center.z, 3.5, 2.9, 0.08, toneValue(palette, cluster.tone));
  }

  // 聚类核心：低亮度环，不做发光球。
  for (const cluster of clusters) {
    const tone = toneValue(palette, cluster.tone);
    const ring = new THREE.Mesh(kit.torus(1.15, 0.005, 5, 96), kit.ring(tone, 0.22));
    ring.position.copy(cluster.center).setY(0.1);
    ring.rotation.x = Math.PI / 2;
    orbit.add(ring);
    const label = createSpriteLabel(cluster.label, "", palette, 0.62, tone);
    label.position.copy(cluster.center).add(V(0, 0.9, -1.5));
    root.add(label);
  }

  const maxViews = Math.max(1, ...data.posts.map((post) => post.views));
  // 聚类归属只依据作品的真实频道字段：频道名含 AI 的归入 AI 资源，其余归入社区作品。
  const isAiPost = (post: NexusContentScene["posts"][number]) => /ai|人工智能/i.test(post.channel || "");
  const postPoint = (post: NexusContentScene["posts"][number], index: number) => {
    const cluster = isAiPost(post) ? clusters[1] : clusters[0];
    const seed = hashString(post.id);
    const angle = index * 2.399963 + seed * 0.9;
    const spread = 0.35 + seed * 1.05;
    return V(
      cluster.center.x + Math.cos(angle) * spread,
      cluster.center.y + 0.12 + (seed - 0.5) * 0.55,
      cluster.center.z + Math.sin(angle) * spread,
    );
  };

  const topPostIds = new Set(
    [...data.posts].sort((a, b) => b.views - a.views).slice(0, 6).map((post) => post.id),
  );
  data.posts.forEach((post, index) => {
    const position = postPoint(post, index);
    const size = 0.09 + Math.sqrt(post.views / maxViews) * 0.13;
    const tone = toneValue(palette, post.channel === "ai" ? "violet" : "cyan");
    // 微小星体：核心实体 + 细环，而不是一根光柱。
    const body = new THREE.Mesh(kit.sphere(size, 18, 12), new THREE.MeshStandardMaterial({
      color: palette.mode === "dark" ? 0x3b474d : 0xdfe6e6,
      metalness: 0.55, roughness: 0.34, emissive: tone, emissiveIntensity: 0.18,
    }));
    body.position.copy(position);
    body.userData.nodeId = post.id;
    orbit.add(body);
    pickables.push(body);
    const halo = new THREE.Mesh(kit.torus(size * 1.7, 0.003, 4, 40), kit.ring(tone, 0.32));
    halo.position.copy(position);
    halo.rotation.set(0.9 + index * 0.2, index * 0.5, 0.3);
    orbit.add(halo);
    positions.set(post.id, position);
    if (topPostIds.has(post.id)) {
      const label = createSpriteLabel(post.title.slice(0, 18), `${formatNumber(post.views)} 阅读`, palette, 0.5, tone);
      label.position.copy(position).add(V(0, 0.34, 0));
      root.add(label);
    }
  });

  data.series.forEach((series, index) => {
    const angle = (index / Math.max(1, data.series.length)) * Math.PI * 2;
    const cluster = clusters[2].center;
    const position = V(cluster.x + Math.cos(angle) * 0.95, 0.42 + (index % 3) * 0.16, cluster.z + Math.sin(angle) * 0.85);
    const body = new THREE.Mesh(kit.torus(0.24, 0.05, 10, 40), new THREE.MeshStandardMaterial({
      color: palette.gold, metalness: 0.9, roughness: 0.32, emissive: palette.gold, emissiveIntensity: 0.12,
    }));
    body.position.copy(position);
    body.rotation.set(Math.PI / 2, index * 0.4, 0);
    body.userData.nodeId = series.id;
    orbit.add(body);
    pickables.push(body);
    positions.set(series.id, position);
    const label = createSpriteLabel(series.title.slice(0, 14), `${series.posts} 篇`, palette, 0.5, palette.gold);
    label.position.copy(position).add(V(0, 0.42, 0));
    root.add(label);
  });

  data.tags.forEach((tag, index) => {
    const angle = (index / Math.max(1, data.tags.length)) * Math.PI * 2 + 0.3;
    const cluster = clusters[3].center;
    const position = V(cluster.x + Math.cos(angle) * 1.05, 0.42 + (index % 3) * 0.14, cluster.z + Math.sin(angle) * 0.95);
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), new THREE.MeshStandardMaterial({
      color: palette.mode === "dark" ? 0x45525a : 0xc8d2d4,
      metalness: 0.7, roughness: 0.3, emissive: palette.blue, emissiveIntensity: 0.2,
    }));
    body.position.copy(position);
    body.userData.nodeId = `tag:${tag.id}`;
    orbit.add(body);
    pickables.push(body);
    positions.set(`tag:${tag.id}`, position);
    const label = createSpriteLabel(tag.name, `${tag.posts} 篇`, palette, 0.46, palette.blue);
    label.position.copy(position).add(V(0, 0.3, 0));
    root.add(label);
  });

  // 只连接真实存在的关联（合集/标签），不生成随机关系。
  const edgePositions: number[] = [];
  for (const edge of data.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    edgePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
  }
  if (edgePositions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
    root.add(new THREE.LineSegments(geometry, kit.edge(palette.link, 0.22)));
  }

  return {
    key: "content", root, kit, nodes: [], links: [], pickables,
    defaultCamera: { position: [7.6, 9.4, 9.6], target: [0, 0.2, 0] },
    bounds: { center: [0, 0.2, 0], radius: 5.6 },
    update() {},
    setSelected(id) {
      for (const pickable of pickables) {
        const material = (pickable as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (!material || material.emissiveIntensity == null) continue;
        const matched = !id || pickable.userData.nodeId === id;
        material.emissiveIntensity = matched ? 0.32 : 0.04;
        material.transparent = Boolean(id) && !matched;
        material.opacity = id && !matched ? 0.28 : 1;
      }
    },
    focusPoint(id) { return positions.get(id) || null; },
    dispose() {
      disposeObject(root);
      kit.dispose();
    },
  };
}

// =============================================================================================
// 场景七：安全防御空间
// =============================================================================================

function buildSecurity(data: NexusSecurityScene | null, palette: NexusPalette): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  addPlatform(root, kit, palette, 4.9);

  const pickables: THREE.Object3D[] = [];
  const layerPoints = new Map<string, THREE.Vector3>();
  const layers = [
    { id: "layer:edge", label: "网络入口", note: "Caddy 反代 · 访问日志", radius: 3.55, tone: "blue" },
    { id: "layer:rules", label: "访问规则", note: "频率限制 · IP 封禁", radius: 2.55, tone: "amber" },
    { id: "layer:auth", label: "身份校验", note: "JWT · 权限判定", radius: 1.65, tone: "green" },
  ];

  // 核心：紧凑版 HEIKA 设施，不再是低多边形球。
  const core = new THREE.Group();
  const coreBody = buildNodeModel("server", kit, palette, "healthy");
  coreBody.group.scale.setScalar(0.92);
  core.add(coreBody.group);
  const coreBase = new THREE.Mesh(kit.cyl(0.86, 0.94, 0.14, 8), kit.graphiteDeep());
  coreBase.position.y = 0.06;
  coreBase.userData.nodeId = "security-core";
  core.add(coreBase);
  core.position.y = 0.1;
  root.add(core);
  pickables.push(coreBase);
  layerPoints.set("security-core", V(0, 0.5, 0));

  layers.forEach((layer, layerIndex) => {
    const tone = toneValue(palette, layer.tone);
    const group = new THREE.Group();

    // 半透明球壳（下缘切口，能看到内部），配合细网格与分段护板。
    const shell = new THREE.Mesh(
      // 半球壳：从顶点切到赤道，赤道正好落在地台上，
      // thetaLength 过大会让壳体穿过地台，看起来像“插进地面的气泡”。
      new THREE.SphereGeometry(layer.radius, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshPhysicalMaterial({
        color: tone, metalness: 0, roughness: 0.26, transparent: true, opacity: 0.08,
        side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.8, envMapIntensity: 1,
      }),
    );
    shell.position.y = 0.55;
    shell.userData.nodeId = layer.id;
    group.add(shell);
    pickables.push(shell);

    const grid = new THREE.Mesh(
      new THREE.IcosahedronGeometry(layer.radius * 0.998, layerIndex === 0 ? 2 : 1),
      new THREE.MeshBasicMaterial({ color: tone, wireframe: true, transparent: true, opacity: 0.15, depthWrite: false }),
    );
    grid.position.y = 0.55;
    group.add(grid);

    // 赤道分段护板：12 段，段间留缝，体现“可拆解的保护结构”。
    for (let index = 0; index < 12; index += 1) {
      const arc = (Math.PI * 2 / 12) * 0.66;
      const start = (index / 12) * Math.PI * 2;
      const segment = new THREE.Mesh(
        new THREE.TorusGeometry(layer.radius, 0.022, 6, 20, arc),
        new THREE.MeshStandardMaterial({
          color: palette.mode === "dark" ? 0x39464c : 0xb9c4c6,
          metalness: 0.85, roughness: 0.32, emissive: tone, emissiveIntensity: 0.05,
        }),
      );
      segment.rotation.x = Math.PI / 2;
      segment.rotation.z = start;
      segment.position.y = 0.55;
      group.add(segment);
    }
    // 竖向支撑：6 根细柱沿壳体曲面内侧，高度按半球剖面计算，不穿出壳外。
    const strutHeight = layer.radius * 0.62;
    const strutRadius = layer.radius * Math.sqrt(1 - 0.28);
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const strut = new THREE.Mesh(kit.cyl(0.007, 0.007, strutHeight, 6), kit.ring(tone, 0.34));
      strut.position.set(Math.cos(angle) * strutRadius, 0.55 + strutHeight / 2, Math.sin(angle) * strutRadius);
      group.add(strut);
    }

    root.add(group);
    layerPoints.set(layer.id, V(layer.radius, 0.55, 0));

    // 标签沿径向外移并逐层降低高度，落在球壳外侧，不压住核心与网格。
    const labelAngle = -0.9 + layerIndex * 0.55;
    const label = createSpriteLabel(layer.label, layer.note, palette, 0.58, tone);
    label.position.set(
      Math.cos(labelAngle) * (layer.radius + 0.55),
      1.15 + layerIndex * 0.34,
      Math.sin(labelAngle) * (layer.radius + 0.55),
    );
    root.add(label);
  });

  // 真实规则：挂在所属防御层上，不虚构不存在的系统。
  (data?.rules || []).slice(0, 18).forEach((rule, index) => {
    const outer = rule.type.endsWith("block");
    const radius = outer ? 3.55 : rule.type.includes("auth") ? 1.65 : 2.55;
    const angle = (index / 18) * Math.PI * 2;
    const pylon = new THREE.Mesh(kit.rounded(0.1, 0.3, 0.1, 0.008), kit.graphite());
    pylon.position.set(Math.cos(angle) * radius, 0.72, Math.sin(angle) * radius);
    pylon.userData.nodeId = `rule:${rule.id}`;
    root.add(pylon);
    pickables.push(pylon);
    const led = new THREE.Mesh(kit.box(0.03, 0.02, 0.03), kit.led(rule.active ? palette.red : palette.neutral, 0.9));
    led.position.copy(pylon.position).add(V(0, 0.17, 0));
    root.add(led);
    layerPoints.set(`rule:${rule.id}`, pylon.position.clone());
  });

  return {
    key: "security", root, kit, nodes: [], links: [], pickables,
    defaultCamera: { position: [6.8, 8.6, 8.4], target: [0, 0.9, 0] },
    bounds: { center: [0, 0.9, 0], radius: 4.4 },
    update() {},
    setSelected(id) {
      for (const pickable of pickables) {
        const material = (pickable as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
        if (!material) continue;
        if (material.transparent) {
          material.opacity = id && pickable.userData.nodeId !== id ? 0.022 : 0.055;
        } else if ("emissive" in material) {
          material.emissiveIntensity = id && pickable.userData.nodeId === id ? 0.5 : 0.05;
        }
      }
    },
    focusPoint(id) { return layerPoints.get(id) || null; },
    dispose() {
      disposeObject(root);
      kit.dispose();
    },
  };
}

// =============================================================================================
// 场景八：时空回溯中心
// =============================================================================================

function buildTimeline(palette: NexusPalette): BuiltScene {
  const kit = new ModelKit(palette);
  const root = new THREE.Group();
  addPlatform(root, kit, palette, 5.9);

  // 时间轴：一条抬起的金属导轨 + 25 个刻度柱 + 金色游标。
  // 旧实现是一根贴地的细线，镜头一拉远就消失，刻度标签还会斜着排到画布外。
  const axisLength = 6.8;
  const axisZ = 2.45;
  // 默认机位方位角约 38°，导轨若沿世界 X 轴会在屏幕上斜穿；
  // 这里把整条导轨旋到与视线垂直，屏幕上是水平结构，读起来才像时间轴。
  const railGroup = new THREE.Group();
  railGroup.rotation.y = 0.658;
  root.add(railGroup);

  const rail = new THREE.Mesh(kit.rounded(axisLength + 0.3, 0.07, 0.2, 0.02), kit.graphite());
  rail.position.set(0, 0.2, axisZ);
  rail.castShadow = true;
  railGroup.add(rail);
  const railTop = new THREE.Mesh(kit.box(axisLength, 0.012, 0.055), kit.ring(palette.gridStrong, 0.5));
  railTop.position.set(0, 0.245, axisZ);
  railGroup.add(railTop);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(kit.cyl(0.05, 0.06, 0.24, 12), kit.titaniumMatte());
    post.position.set(side * (axisLength / 2 + 0.06), 0.12, axisZ);
    railGroup.add(post);
  }

  // 刻度柱高度只做等差的视觉节奏（6 格高、2 格中、其余短），不伪造任何数据。
  const tickBands: Record<string, Array<{ p: [number, number, number] }>> = { tall: [], mid: [], short: [] };
  for (let index = 0; index <= 24; index += 1) {
    const x = -axisLength / 2 + (index / 24) * axisLength;
    const band = index % 6 === 0 ? "tall" : index % 2 === 0 ? "mid" : "short";
    const height = band === "tall" ? 0.17 : band === "mid" ? 0.1 : 0.06;
    tickBands[band].push({ p: [x, 0.245 + height / 2, axisZ] });
    if (index % 6 === 0) {
      const label = createSpriteLabel(`${String(index).padStart(2, "0")}`, "", palette, 0.34, palette.neutral);
      label.position.set(x, 0.62, axisZ + 0.16);
      railGroup.add(label);
    }
  }
  for (const [band, height] of [["tall", 0.17], ["mid", 0.1], ["short", 0.06]] as const) {
    railGroup.add(createInstances(kit, kit.box(0.016, height, 0.05), kit.titaniumMatte(), tickBands[band]));
  }

  const cursor = new THREE.Mesh(kit.box(0.035, 0.44, 0.3), kit.ring(palette.gold, 0.72));
  cursor.position.set(axisLength / 2, 0.44, axisZ);
  railGroup.add(cursor);
  const cursorLabel = createSpriteLabel("当前快照", "", palette, 0.5, palette.gold);
  cursorLabel.position.set(axisLength / 2, 0.9, axisZ);
  railGroup.add(cursorLabel);

  // 指标环：五个真实指标，半径固定，数值只改变环的亮度与刻度。
  const rings: Array<{ key: keyof NexusHistoryPoint; mesh: THREE.Mesh; value: number | null; max: number; label: string }> = [];
  const specs: Array<{ key: keyof NexusHistoryPoint; radius: number; tone: string; max: number; label: string }> = [
    { key: "cpuPercent", radius: 1.15, tone: "cyan", max: 100, label: "CPU" },
    { key: "memPercent", radius: 1.65, tone: "violet", max: 100, label: "内存" },
    { key: "diskPercent", radius: 2.15, tone: "gold", max: 100, label: "磁盘" },
    { key: "apiP95Ms", radius: 2.65, tone: "blue", max: 800, label: "P95" },
    { key: "aiQueue", radius: 3.15, tone: "amber", max: 20, label: "AI 队列" },
  ];
  specs.forEach((spec) => {
    const material = kit.ring(toneValue(palette, spec.tone), 0.16);
    const mesh = new THREE.Mesh(kit.torus(spec.radius, 0.022, 6, 120), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.2;
    root.add(mesh);
    rings.push({ key: spec.key, mesh, value: null, max: spec.max, label: spec.label });
    const angle = -0.62 + rings.length * 0.42;
    const label = createSpriteLabel(spec.label, "", palette, 0.44, toneValue(palette, spec.tone));
    label.position.set(Math.cos(angle) * (spec.radius + 0.22), 0.34, Math.sin(angle) * (spec.radius + 0.22));
    root.add(label);
  });

  const core = new THREE.Mesh(kit.cyl(0.42, 0.5, 0.3, 8), kit.graphiteDeep());
  core.position.y = 0.3;
  root.add(core);
  const coreRing = new THREE.Mesh(kit.torus(0.5, 0.008, 6, 64), kit.ring(palette.gold, 0.5));
  coreRing.rotation.x = Math.PI / 2;
  coreRing.position.y = 0.46;
  root.add(coreRing);

  const markerGroup = new THREE.Group();
  railGroup.add(markerGroup);
  let markerSignature = "";

  return {
    key: "timeline", root, kit, nodes: [], links: [], pickables: [],
    defaultCamera: { position: [7.6, 9.6, 9.8], target: [0, 0.6, 0.8] },
    bounds: { center: [0, 0.6, 0.8], radius: 6.2 },
    update() {},
    setSelected() {},
    focusPoint() { return V(0, 0.6, 0.8); },
    setHistorical(point, markers) {
      if (!point) {
        for (const ring of rings) {
          ring.value = null;
          (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.1;
          ring.mesh.scale.setScalar(1);
        }
        return;
      }
      for (const ring of rings) {
        const raw = point[ring.key];
        const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        ring.value = value;
        const material = ring.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = value == null ? 0.08 : 0.34 + Math.min(0.5, value / ring.max * 0.5);
        ring.mesh.scale.setScalar(value == null ? 1 : 0.94 + Math.min(0.16, value / ring.max * 0.16));
      }
      // 游标位置按快照真实时间落在时间轴上。
      const at = Date.parse(point.bucketAt);
      if (Number.isFinite(at)) {
        const minute = (at / 60000) % 60;
        cursor.position.x = -axisLength / 2 + (minute / 60) * axisLength;
        cursorLabel.position.x = cursor.position.x;
      }
      const signature = markers.map((marker) => `${marker.at}:${marker.level}`).join("|");
      if (signature === markerSignature) return;
      markerSignature = signature;
      // 标记只用场景共享资产，清空时不 dispose，避免把仍在使用的材质一起释放。
      markerGroup.clear();
      const times = markers.map((marker) => Date.parse(marker.at)).filter(Number.isFinite);
      const start = times.length ? Math.min(...times) : 0;
      const end = times.length ? Math.max(...times) : 0;
      const span = Math.max(1, end - start);
      markers.slice(-32).forEach((marker) => {
        const time = Date.parse(marker.at);
        if (!Number.isFinite(time)) return;
        const ratio = (time - start) / span;
        const x = -axisLength / 2 + Math.min(1, Math.max(0, ratio)) * axisLength;
        const height = 0.35 + (marker.level === "error" ? 0.5 : marker.level === "warn" ? 0.3 : 0.18);
        const color = marker.level === "error" ? palette.red : marker.level === "warn" ? palette.amber : palette.blue;
        const pillar = new THREE.Mesh(kit.box(0.035, height, 0.035), kit.ring(color, 0.85));
        pillar.position.set(x, 0.245 + height / 2, axisZ - 0.1);
        markerGroup.add(pillar);
        const dot = new THREE.Mesh(kit.sphere(0.03, 8, 6), kit.led(color, 1.2));
        dot.position.set(x, 0.255 + height, axisZ - 0.1);
        markerGroup.add(dot);
      });
    },
    dispose() {
      disposeObject(root);
      kit.dispose();
    },
  };
}

// =============================================================================================
// 工厂
// =============================================================================================

export function buildScene(
  key: NexusSceneKey,
  snapshot: NexusSnapshot,
  palette: NexusPalette,
  options: SceneExtras & { particleCap: number },
): BuiltScene {
  const built = buildSceneInner(key, snapshot, palette, options);
  // 取景范围以实际几何为准：手写 bounds 容易和地台/外围结构脱节，
  // 导致地台被裁切或主体缩在中央。这里用真实包围球覆盖整棵场景树。
  // 标签是屏幕空间的 Sprite，不参与包围盒计算，避免面板高度被标签撑大。
  built.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  built.root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh && !(child as THREE.Points).isPoints) return;
    if ((child as THREE.Sprite).isSprite) return;
    box.expandByObject(mesh);
  });
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    built.box = box;
    built.bounds = {
      center: [center.x, center.y, center.z],
      // 用水平半宽而不是外接球半径：扁平场景的外接球会把半径放大 40%，
      // 相机因此退得过远，主体缩在画布中央。
      radius: Math.max(1, Math.max(size.x, size.z) / 2),
    };
    built.defaultCamera = { ...built.defaultCamera, target: [center.x, center.y * 0.6, center.z] };
  }
  return built;
}

function buildSceneInner(
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
    case "globe": return buildGlobe(options.globe || null, palette);
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

export { OVERVIEW_NODES, statusTone, LINK_COLORS };
