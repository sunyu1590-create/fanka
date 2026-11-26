"use client";

/**
 * HEIKA Nexus 2.0 模型资产：每种设施都有明确的功能识别度。
 *
 * 统一规范：
 * - 共同底座（机加工平台）+ 接触阴影，设施不再“漂浮”；
 * - 主体、辅助结构、表面细节、状态指示区、选中边界五件套；
 * - 散热孔、磁盘槽、网口、芯片阵列等重复结构用 InstancedMesh，单模型 8–14 次绘制；
 * - 状态色只出现在指示灯与细边线，不整块染色；
 * - 关键尺寸固定，布局、标签锚点与包围盒都从这里取，避免各场景各写一套。
 */

import * as THREE from "three";
import type { NexusStatus } from "./types";
import type { NexusPalette } from "./palette";
import { ModelKit } from "./materials";

export type BuiltModel = {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  /** 随真实状态变色的指示灯材质。 */
  leds: THREE.MeshStandardMaterial[];
  /** 选中时显示的细轮廓。 */
  outline: THREE.LineSegments;
  height: number;
  radius: number;
};

function toneOf(palette: NexusPalette, status: NexusStatus) {
  if (status === "down" || status === "offline") return { led: palette.red, accent: palette.red };
  if (status === "degraded") return { led: palette.amber, accent: palette.amber };
  if (status === "unknown") return { led: palette.neutral, accent: palette.neutral };
  return { led: palette.cyan, accent: palette.cyan };
}

function mesh(kit: ModelKit, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  return item;
}

type Transform = { p: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] };

function instanced(kit: ModelKit, geometry: THREE.BufferGeometry, material: THREE.Material, transforms: Transform[]) {
  const items = new THREE.InstancedMesh(geometry, material, transforms.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  transforms.forEach((transform, index) => {
    position.set(...transform.p);
    euler.set(...(transform.r || [0, 0, 0]));
    quaternion.setFromEuler(euler);
    scale.set(...(transform.s || [1, 1, 1]));
    matrix.compose(position, quaternion, scale);
    items.setMatrixAt(index, matrix);
  });
  items.instanceMatrix.needsUpdate = true;
  items.castShadow = false;
  items.receiveShadow = false;
  return items;
}


/** 可拾取网格：排除接触阴影等纯装饰面。 */
function pickablesOf(group: THREE.Group) {
  return group.children.filter((child) => (child as THREE.Mesh).isMesh && child.userData.noPick !== true) as THREE.Mesh[];
}

/** 机加工底座 + 接触阴影。 */
function plinth(kit: ModelKit, group: THREE.Group, width: number, depth: number, round = false) {
  const height = 0.07;
  const base = round
    ? mesh(kit, kit.cyl(width / 2, width / 2 + 0.02, height, 48), kit.graphiteDeep())
    : mesh(kit, kit.rounded(width, height, depth, 0.018), kit.graphiteDeep());
  base.position.y = height / 2;
  base.receiveShadow = true;
  group.add(base);

  const rim = round
    ? mesh(kit, kit.torus(width / 2 - 0.006, 0.006, 6, 56), kit.titaniumMatte())
    : mesh(kit, kit.rounded(width - 0.02, 0.01, depth - 0.02, 0.006), kit.titaniumMatte());
  rim.position.y = height + 0.002;
  if (round) rim.rotation.x = Math.PI / 2;
  group.add(rim);

  const shadow = mesh(kit, kit.plane(width * 2.1, depth * 2.4), kit.shadowMaterial());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.renderOrder = 1;
  shadow.userData.noPick = true;
  group.add(shadow);
}

function boltRing(kit: ModelKit, group: THREE.Group, radius: number, count: number, y: number) {
  const transforms: Transform[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    transforms.push({ p: [Math.cos(angle) * radius, y, Math.sin(angle) * radius] });
  }
  group.add(instanced(kit, kit.cyl(0.012, 0.012, 0.008, 6), kit.titaniumMatte(), transforms));
}

/** 机柜：19 英寸结构、散热槽、把手、顶部排风、侧透玻璃与后部线束。 */
function buildRack(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 0.98, 0.74);

  const body = mesh(kit, kit.rounded(0.9, 1.28, 0.64, 0.024), kit.graphite(), 0, 0.71, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const front = mesh(kit, kit.rounded(0.82, 1.16, 0.035, 0.012), kit.graphiteDeep(), 0, 0.71, 0.325);
  group.add(front);

  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.35, metalness: 0.2, roughness: 0.3,
  });

  const slotTransforms: Transform[] = [];
  const ventTransforms: Transform[] = [];
  const ledTransforms: Transform[] = [];
  for (let slot = 0; slot < 7; slot += 1) {
    const y = 0.26 + slot * 0.155;
    slotTransforms.push({ p: [0, y, 0.345] });
    for (let column = 0; column < 6; column += 1) {
      ventTransforms.push({ p: [-0.29 + column * 0.09, y, 0.352] });
    }
    ledTransforms.push({ p: [0.355, y, 0.352] });
  }
  group.add(instanced(kit, kit.rounded(0.78, 0.128, 0.014, 0.006), kit.composite(), slotTransforms));
  group.add(instanced(kit, kit.rounded(0.062, 0.024, 0.006, 0.002), kit.titaniumMatte(), ventTransforms));
  group.add(instanced(kit, kit.box(0.018, 0.018, 0.008), ledMaterial, ledTransforms));

  // 机柜把手与顶部铭牌。
  for (const side of [-1, 1]) {
    const handle = mesh(kit, kit.rounded(0.022, 0.16, 0.022, 0.008), kit.titanium(), side * 0.4, 1.18, 0.36);
    group.add(handle);
    const screw = mesh(kit, kit.cyl(0.012, 0.012, 0.01, 8), kit.titaniumMatte(), side * 0.4, 1.245, 0.36);
    screw.rotation.x = Math.PI / 2;
    group.add(screw);
  }
  const badge = mesh(kit, kit.rounded(0.26, 0.035, 0.012, 0.004), kit.brass(), 0, 1.335, 0.33);
  group.add(badge);
  group.add(mesh(kit, kit.rounded(0.6, 0.008, 0.008, 0.003), kit.titaniumMatte(), 0, 1.3, 0.33));

  // 顶部排风。
  const topVents: Transform[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      topVents.push({ p: [-0.27 + column * 0.18, 1.352, -0.2 + row * 0.1] });
    }
  }
  group.add(instanced(kit, kit.rounded(0.14, 0.008, 0.035, 0.003), kit.composite(), topVents));

  // 侧透玻璃：能看到内部板卡，而不是一整块实心盒子。
  const glass = mesh(kit, kit.rounded(0.012, 0.94, 0.46, 0.004), kit.glass(0.24), -0.452, 0.76, 0);
  group.add(glass);
  const board = mesh(kit, kit.box(0.008, 0.82, 0.4), kit.pcb(), -0.44, 0.76, 0);
  group.add(board);
  const chipTransforms: Transform[] = [];
  for (let index = 0; index < 9; index += 1) {
    chipTransforms.push({ p: [-0.432, 0.46 + Math.floor(index / 3) * 0.22, -0.13 + (index % 3) * 0.13] });
  }
  group.add(instanced(kit, kit.box(0.012, 0.1, 0.07), kit.titaniumMatte(), chipTransforms));

  // 后部电源与线束。
  for (const side of [-1, 1]) {
    group.add(mesh(kit, kit.rounded(0.3, 0.2, 0.1, 0.01), kit.graphiteDeep(), side * 0.22, 0.22, -0.34));
  }
  for (let index = 0; index < 3; index += 1) {
    const cable = mesh(kit, kit.cyl(0.016, 0.016, 0.46, 8), kit.composite(), -0.3 + index * 0.12, 0.72, -0.36);
    cable.rotation.x = 0.18;
    group.add(cable);
  }

  boltRing(kit, group, 0.4, 6, 0.075);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.rounded(0.94, 1.33, 0.68, 0.02)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.71;
  group.add(outline);

  return { group, pickables: [body, front], leds: [ledMaterial], outline, height: 1.42, radius: 0.56 };
}

/** 数据库：分层存储阵列 + 环形磁盘槽 + 中央玻璃导光柱。 */
function buildDatabase(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 1.24, 1.24, true);

  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3,
  });

  const driveTransforms: Transform[] = [];
  for (let shelf = 0; shelf < 4; shelf += 1) {
    const y = 0.19 + shelf * 0.235;
    const shelfMesh = mesh(kit, kit.cyl(0.54, 0.54, 0.19, 48), shelf === 3 ? kit.graphite() : kit.graphiteDeep(), 0, y, 0);
    shelfMesh.castShadow = true;
    group.add(shelfMesh);
    group.add(mesh(kit, kit.torus(0.543, 0.006, 6, 64), kit.titaniumMatte(), 0, y + 0.095, 0).rotateX(Math.PI / 2));
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      driveTransforms.push({
        p: [Math.cos(angle) * 0.5, y, Math.sin(angle) * 0.5],
        r: [0, -angle, 0],
      });
    }
    // 每层一圈微指示灯，用实例化保持 1 次绘制。
    const ledTransforms: Transform[] = [];
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + 0.06;
      ledTransforms.push({ p: [Math.cos(angle) * 0.566, y + 0.02, Math.sin(angle) * 0.566], r: [0, -angle, 0] });
    }
    group.add(instanced(kit, kit.box(0.014, 0.012, 0.008), ledMaterial, ledTransforms));
  }
  group.add(instanced(kit, kit.box(0.075, 0.13, 0.05), kit.composite(), driveTransforms));
  group.add(instanced(kit, kit.box(0.03, 0.012, 0.052), kit.titaniumMatte(), driveTransforms.map((t) => ({
    p: [t.p[0], t.p[1] + 0.05, t.p[2]], r: t.r,
  }))));

  // 中央导光柱：玻璃外壳 + 低亮度芯。
  const column = mesh(kit, kit.cyl(0.15, 0.15, 0.98, 32, true), kit.glass(0.3), 0, 0.56, 0);
  group.add(column);
  const core = mesh(kit, kit.cyl(0.045, 0.045, 0.94, 16), kit.led(tone.accent, 0.9), 0, 0.56, 0);
  group.add(core);

  const cap = mesh(kit, kit.cyl(0.47, 0.5, 0.07, 48), kit.titaniumMatte(), 0, 1.06, 0);
  group.add(cap);
  group.add(mesh(kit, kit.cyl(0.34, 0.34, 0.012, 40), kit.composite(), 0, 1.1, 0));
  boltRing(kit, group, 0.4, 8, 1.11);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.cyl(0.58, 0.58, 1.12, 36)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.56;
  group.add(outline);

  return { group, pickables: pickablesOf(group), leds: [ledMaterial], outline, height: 1.2, radius: 0.62 };
}

/** AI 计算核心：基板 + 芯粒 + HBM + 均热板 + 冷板鳍片 + 调度环。 */
function buildAiCore(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 1.24, 1.24);

  group.add(mesh(kit, kit.rounded(1.0, 0.07, 1.0, 0.02), kit.composite(), 0, 0.105, 0));
  group.add(mesh(kit, kit.rounded(0.92, 0.02, 0.92, 0.008), kit.pcb(), 0, 0.15, 0));

  // 4 个计算芯粒与 8 组 HBM，真实芯片封装的布局。
  const chipTransforms: Transform[] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      chipTransforms.push({ p: [(column - 0.5) * 0.42, 0.185, (row - 0.5) * 0.42] });
    }
  }
  group.add(instanced(kit, kit.rounded(0.3, 0.05, 0.3, 0.006), kit.titanium(), chipTransforms));
  const hbm: Transform[] = [];
  for (let row = 0; row < 4; row += 1) {
    hbm.push({ p: [-0.36, 0.18, -0.36 + row * 0.24] });
    hbm.push({ p: [0.36, 0.18, -0.36 + row * 0.24] });
  }
  group.add(instanced(kit, kit.rounded(0.09, 0.035, 0.19, 0.004), kit.titaniumMatte(), hbm));

  // 均热板 + 四个支撑柱 + 中央玻璃观察窗。
  group.add(mesh(kit, kit.rounded(0.72, 0.04, 0.72, 0.01), kit.titanium(), 0, 0.34, 0));
  for (const x of [-0.3, 0.3]) {
    for (const z of [-0.3, 0.3]) {
      group.add(mesh(kit, kit.cyl(0.014, 0.014, 0.14, 10), kit.titaniumMatte(), x, 0.25, z));
    }
  }
  const viewport = mesh(kit, kit.rounded(0.46, 0.012, 0.46, 0.006), kit.glass(0.42), 0, 0.362, 0);
  group.add(viewport);

  // 冷板鳍片：12 片，实例化。
  const fins: Transform[] = [];
  for (let index = 0; index < 12; index += 1) {
    fins.push({ p: [-0.28 + index * 0.051, 0.43, 0] });
  }
  group.add(instanced(kit, kit.box(0.012, 0.11, 0.52), kit.titaniumMatte(), fins));
  group.add(mesh(kit, kit.rounded(0.66, 0.02, 0.56, 0.008), kit.graphiteDeep(), 0, 0.378, 0));

  // 边缘状态灯与调度环。
  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.5, metalness: 0.2, roughness: 0.3,
  });
  const edgeLeds: Transform[] = [];
  for (let index = 0; index < 20; index += 1) {
    const angle = (index / 20) * Math.PI * 2;
    edgeLeds.push({ p: [Math.cos(angle) * 0.47, 0.16, Math.sin(angle) * 0.47] });
  }
  group.add(instanced(kit, kit.box(0.022, 0.016, 0.01), ledMaterial, edgeLeds));

  for (let index = 0; index < 2; index += 1) {
    const ring = mesh(kit, kit.torus(0.72 + index * 0.12, 0.004, 6, 80), kit.ring(index === 0 ? palette.cyan : palette.gold, 0.18), 0, 0.2 + index * 0.03, 0);
    ring.rotation.x = Math.PI / 2 + (index === 0 ? 0.06 : -0.08);
    group.add(ring);
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.rounded(1.02, 0.56, 1.02, 0.02)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.28;
  group.add(outline);

  return { group, pickables: pickablesOf(group), leds: [ledMaterial], outline, height: 0.72, radius: 0.7 };
}

/** 网络入口：1U 交换机 + 端口阵列 + 双上联桅杆 + 风扇。 */
function buildGateway(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 1.24, 0.76);

  const chassis = mesh(kit, kit.rounded(1.06, 0.2, 0.5, 0.014), kit.graphite(), 0, 0.18, 0);
  chassis.castShadow = true;
  group.add(chassis);
  const bezel = mesh(kit, kit.rounded(1.02, 0.155, 0.03, 0.008), kit.graphiteDeep(), 0, 0.19, 0.252);
  group.add(bezel);

  const ports: Transform[] = [];
  const leds: Transform[] = [];
  for (let index = 0; index < 12; index += 1) {
    const x = -0.42 + index * 0.077;
    ports.push({ p: [x, 0.155, 0.268] });
    leds.push({ p: [x, 0.222, 0.268] });
  }
  group.add(instanced(kit, kit.box(0.05, 0.036, 0.014), kit.composite(), ports));
  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3,
  });
  group.add(instanced(kit, kit.box(0.016, 0.01, 0.006), ledMaterial, leds));

  for (let index = 0; index < 4; index += 1) {
    group.add(mesh(kit, kit.box(0.075, 0.05, 0.02), kit.titaniumMatte(), -0.34 + index * 0.1, 0.25, 0.27));
  }

  // 顶部双风扇与上联桅杆。
  for (const x of [-0.26, 0.26]) {
    group.add(mesh(kit, kit.cyl(0.11, 0.11, 0.03, 24), kit.graphiteDeep(), x, 0.285, 0));
    group.add(mesh(kit, kit.torus(0.105, 0.006, 6, 32), kit.titaniumMatte(), x, 0.302, 0).rotateX(Math.PI / 2));
  }
  for (const x of [-0.4, 0.4]) {
    group.add(mesh(kit, kit.cyl(0.01, 0.01, 0.42, 8), kit.titanium(), x, 0.5, -0.18));
    group.add(mesh(kit, kit.sphere(0.022, 10, 8), ledMaterial, x, 0.72, -0.18));
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.rounded(1.1, 0.24, 0.54, 0.014)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.2;
  group.add(outline);

  return { group, pickables: [chassis, bezel], leds: [ledMaterial], outline, height: 0.86, radius: 0.68 };
}

/** 媒体存储：盘位仓 + 玻璃柜门 + 顶部磁带机。 */
function buildStorageArray(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 1.1, 0.9);

  const frame = mesh(kit, kit.rounded(0.98, 1.24, 0.68, 0.02), kit.graphiteDeep(), 0, 0.69, 0);
  frame.castShadow = true;
  group.add(frame);
  // 四根立柱与顶板，让内部盘位可见。
  for (const x of [-0.47, 0.47]) {
    for (const z of [-0.32, 0.32]) {
      group.add(mesh(kit, kit.rounded(0.035, 1.24, 0.035, 0.006), kit.titaniumMatte(), x, 0.69, z));
    }
  }
  group.add(mesh(kit, kit.rounded(1.0, 0.05, 0.7, 0.012), kit.graphite(), 0, 1.31, 0));

  const caddies: Transform[] = [];
  const handles: Transform[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      caddies.push({ p: [-0.26 + column * 0.26, 0.28 + row * 0.22, 0.06] });
      handles.push({ p: [-0.26 + column * 0.26, 0.33 + row * 0.22, 0.32] });
    }
  }
  group.add(instanced(kit, kit.rounded(0.23, 0.19, 0.52, 0.008), kit.composite(), caddies));
  group.add(instanced(kit, kit.rounded(0.14, 0.016, 0.018, 0.005), kit.titanium(), handles));

  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.35, metalness: 0.2, roughness: 0.3,
  });
  const bayLeds: Transform[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      bayLeds.push({ p: [-0.26 + column * 0.26 + 0.09, 0.22 + row * 0.22, 0.328] });
    }
  }
  group.add(instanced(kit, kit.box(0.01, 0.012, 0.006), ledMaterial, bayLeds));

  // 玻璃柜门：只挡灰，不挡视线。
  const door = mesh(kit, kit.rounded(0.94, 1.18, 0.02, 0.006), kit.glass(0.16), 0, 0.7, 0.345);
  group.add(door);
  group.add(mesh(kit, kit.rounded(0.02, 1.18, 0.05, 0.006), kit.titaniumMatte(), 0.47, 0.7, 0.345));

  // 顶部磁带仓（媒体设施的功能特征）。
  for (const x of [-0.18, 0.18]) {
    group.add(mesh(kit, kit.cyl(0.13, 0.13, 0.05, 28), kit.titaniumMatte(), x, 1.28, -0.1).rotateX(Math.PI / 2));
    group.add(mesh(kit, kit.cyl(0.05, 0.05, 0.052, 16), kit.composite(), x, 1.28, -0.1).rotateX(Math.PI / 2));
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.rounded(1.02, 1.3, 0.72, 0.02)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.69;
  group.add(outline);

  return { group, pickables: [frame], leds: [ledMaterial], outline, height: 1.4, radius: 0.62 };
}

/** 身份认证：盾形模块，内部玻璃与锁芯。 */
function buildAuthModule(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 0.9, 0.9, true);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0.52);
  shape.lineTo(0.36, 0.34);
  shape.lineTo(0.36, -0.08);
  shape.quadraticCurveTo(0.34, -0.4, 0, -0.56);
  shape.quadraticCurveTo(-0.34, -0.4, -0.36, -0.08);
  shape.lineTo(-0.36, 0.34);
  shape.closePath();
  const shield = mesh(kit, kit.extrude(shape, 0.1, 0.022), kit.titanium(), 0, 0.66, 0);
  shield.castShadow = true;
  group.add(shield);

  const inner = mesh(kit, kit.extrude(shape, 0.03, 0.008), kit.glass(0.3), 0, 0.66, 0.058);
  inner.scale.set(0.74, 0.74, 1);
  group.add(inner);

  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3,
  });
  // 锁芯：圆环 + 钥匙槽。
  const keyRing = mesh(kit, kit.torus(0.1, 0.022, 10, 36), kit.brass(), 0, 0.7, 0.075);
  group.add(keyRing);
  group.add(mesh(kit, kit.rounded(0.03, 0.12, 0.02, 0.006), kit.composite(), 0, 0.63, 0.078));
  for (const side of [-1, 1]) {
    group.add(mesh(kit, kit.cyl(0.012, 0.012, 0.01, 8), ledMaterial, side * 0.2, 0.42, 0.075).rotateX(Math.PI / 2));
  }
  group.add(mesh(kit, kit.rounded(0.5, 0.012, 0.02, 0.004), kit.titaniumMatte(), 0, 0.98, 0.06));

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.extrude(shape, 0.1, 0.022)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.66;
  group.add(outline);

  return { group, pickables: [shield], leds: [ledMaterial], outline, height: 1.24, radius: 0.5 };
}

/** 实时通信：信号塔 + 三层环。 */
function buildRealtimeTower(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 0.78, 0.78, true);

  group.add(mesh(kit, kit.cyl(0.3, 0.34, 0.12, 32), kit.graphiteDeep(), 0, 0.13, 0));
  group.add(mesh(kit, kit.cyl(0.16, 0.2, 0.34, 28), kit.graphite(), 0, 0.36, 0));
  group.add(mesh(kit, kit.cyl(0.1, 0.14, 0.34, 24), kit.graphite(), 0, 0.7, 0));
  group.add(mesh(kit, kit.cyl(0.045, 0.09, 0.3, 20), kit.titaniumMatte(), 0, 1.02, 0));

  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.5, metalness: 0.2, roughness: 0.3,
  });
  const rings = [
    { y: 0.44, r: 0.3 },
    { y: 0.72, r: 0.24 },
    { y: 1.0, r: 0.17 },
  ];
  for (const ring of rings) {
    const item = mesh(kit, kit.torus(ring.r, 0.007, 6, 48), kit.ring(tone.accent, 0.5), 0, ring.y, 0);
    item.rotation.x = Math.PI / 2;
    group.add(item);
    const strut = mesh(kit, kit.box(0.01, 0.01, ring.r * 1.9), kit.titaniumMatte(), 0, ring.y, 0);
    group.add(strut);
  }
  group.add(mesh(kit, kit.sphere(0.045, 14, 10), ledMaterial, 0, 1.2, 0));

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.cyl(0.36, 0.36, 1.28, 20)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.64;
  group.add(outline);

  return { group, pickables: pickablesOf(group), leds: [ledMaterial], outline, height: 1.28, radius: 0.44 };
}

/** 监控采集：遥测传感器（底座 + 云台 + 镜头 + 天线）。 */
function buildSensor(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 0.7, 0.7, true);

  group.add(mesh(kit, kit.cyl(0.2, 0.24, 0.08, 28), kit.graphite(), 0, 0.11, 0));
  const arm = mesh(kit, kit.rounded(0.05, 0.34, 0.05, 0.008), kit.titaniumMatte(), 0, 0.3, 0);
  group.add(arm);
  group.add(mesh(kit, kit.sphere(0.05, 12, 10), kit.titanium(), 0, 0.47, 0));

  const head = mesh(kit, kit.rounded(0.34, 0.2, 0.24, 0.02), kit.graphite(), 0, 0.54, 0.03);
  head.castShadow = true;
  group.add(head);
  const lens = mesh(kit, kit.cyl(0.07, 0.07, 0.04, 20), kit.glass(0.5), 0, 0.54, 0.16);
  lens.rotation.x = Math.PI / 2;
  group.add(lens);
  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3,
  });
  group.add(mesh(kit, kit.cyl(0.03, 0.03, 0.012, 12), ledMaterial, 0, 0.54, 0.182).rotateX(Math.PI / 2));
  group.add(mesh(kit, kit.cyl(0.008, 0.008, 0.3, 6), kit.titanium(), 0.14, 0.68, -0.04));
  group.add(mesh(kit, kit.sphere(0.016, 8, 6), ledMaterial, 0.14, 0.84, -0.04));

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.rounded(0.38, 0.72, 0.3, 0.02)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.42;
  group.add(outline);

  return { group, pickables: [head], leds: [ledMaterial], outline, height: 0.92, radius: 0.36 };
}

/** 客户端：网页用显示器，APP 用手机，形态必须可区分。 */
function buildClient(kit: ModelKit, palette: NexusPalette, kind: "web" | "app"): BuiltModel {
  const group = new THREE.Group();
  plinth(kit, group, 0.86, 0.66);

  if (kind === "web") {
    group.add(mesh(kit, kit.rounded(0.38, 0.02, 0.24, 0.008), kit.graphiteDeep(), 0, 0.11, 0));
    group.add(mesh(kit, kit.rounded(0.06, 0.26, 0.05, 0.008), kit.titaniumMatte(), 0, 0.22, -0.02));
    const screen = mesh(kit, kit.rounded(0.74, 0.44, 0.035, 0.012), kit.graphite(), 0, 0.52, 0);
    screen.castShadow = true;
    group.add(screen);
    group.add(mesh(kit, kit.plane(0.66, 0.36), kit.screen(palette.cyan), 0, 0.52, 0.019));
    group.add(mesh(kit, kit.rounded(0.74, 0.012, 0.012, 0.004), kit.brass(), 0, 0.3, 0.02));
  } else {
    group.add(mesh(kit, kit.rounded(0.24, 0.02, 0.3, 0.008), kit.graphiteDeep(), 0, 0.11, 0));
    group.add(mesh(kit, kit.rounded(0.06, 0.18, 0.05, 0.008), kit.titaniumMatte(), 0, 0.2, 0));
    const phone = mesh(kit, kit.rounded(0.32, 0.62, 0.035, 0.016), kit.graphite(), 0, 0.5, 0);
    phone.rotation.x = -0.08;
    phone.castShadow = true;
    group.add(phone);
    const glass = mesh(kit, kit.plane(0.27, 0.54), kit.screen(palette.cyan), 0, 0.5, 0.02);
    glass.rotation.x = -0.08;
    group.add(glass);
    group.add(mesh(kit, kit.rounded(0.06, 0.012, 0.004, 0.002), kit.brass(), 0, 0.765, 0.012));
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.rounded(0.8, kind === "web" ? 0.6 : 0.7, 0.3, 0.02)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = kind === "web" ? 0.42 : 0.48;
  group.add(outline);

  return { group, pickables: pickablesOf(group), leds: [], outline, height: kind === "web" ? 0.8 : 0.86, radius: 0.45 };
}

/** 外部服务：三片散热鳍包裹的接口塔。 */
function buildExternal(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  plinth(kit, group, 0.72, 0.72, true);

  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2;
    const fin = mesh(kit, kit.rounded(0.05, 0.92, 0.2, 0.012), kit.titanium(), Math.cos(angle) * 0.2, 0.55, Math.sin(angle) * 0.2);
    fin.rotation.y = -angle;
    fin.castShadow = true;
    group.add(fin);
  }
  group.add(mesh(kit, kit.cyl(0.16, 0.16, 0.84, 28, true), kit.glass(0.24), 0, 0.55, 0));
  const core = mesh(kit, kit.cyl(0.06, 0.06, 0.8, 16), kit.led(tone.accent, 0.7), 0, 0.55, 0);
  group.add(core);
  group.add(mesh(kit, kit.torus(0.24, 0.008, 6, 48), kit.brass(), 0, 1.0, 0).rotateX(Math.PI / 2));
  group.add(mesh(kit, kit.cyl(0.28, 0.3, 0.06, 32), kit.graphiteDeep(), 0, 0.1, 0));
  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.5, metalness: 0.2, roughness: 0.3,
  });
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 + 0.5;
    group.add(mesh(kit, kit.box(0.02, 0.02, 0.01), ledMaterial, Math.cos(angle) * 0.17, 0.7, Math.sin(angle) * 0.17));
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.cyl(0.3, 0.3, 1.08, 16)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.54;
  group.add(outline);

  return { group, pickables: pickablesOf(group), leds: [ledMaterial], outline, height: 1.08, radius: 0.4 };
}

/** 中央核心设施：HEIKA 的视觉中心，不是普通节点。 */
export function buildCoreModel(kit: ModelKit, palette: NexusPalette, status: NexusStatus): BuiltModel {
  const group = new THREE.Group();
  const tone = toneOf(palette, status);
  const base = mesh(kit, kit.cyl(0.95, 1.02, 0.14, 8), kit.graphiteDeep(), 0, 0.07, 0);
  base.receiveShadow = true;
  group.add(base);
  group.add(mesh(kit, kit.torus(0.94, 0.012, 6, 64), kit.brass(), 0, 0.145, 0).rotateX(Math.PI / 2));
  const shadow = mesh(kit, kit.plane(3.2, 3.2), kit.shadowMaterial());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  shadow.userData.noPick = true;
  group.add(shadow);

  // 三层八边形机架：从下到上收分，形成可读的“核心塔”。
  const tiers = [
    { r: 0.72, y: 0.34, h: 0.28 },
    { r: 0.6, y: 0.66, h: 0.26 },
    { r: 0.46, y: 0.94, h: 0.24 },
  ];
  tiers.forEach((tier, index) => {
    group.add(mesh(kit, kit.cyl(tier.r, tier.r + 0.03, tier.h, 8), index === 1 ? kit.graphite() : kit.graphiteDeep(), 0, tier.y, 0));
    group.add(mesh(kit, kit.torus(tier.r + 0.004, 0.005, 6, 8), kit.titaniumMatte(), 0, tier.y + tier.h / 2, 0).rotateX(Math.PI / 2));
    // 八面散热槽，实例化。
    const vents: Transform[] = [];
    for (let side = 0; side < 8; side += 1) {
      const angle = (side / 8) * Math.PI * 2 + Math.PI / 8;
      vents.push({ p: [Math.cos(angle) * (tier.r + 0.002), tier.y, Math.sin(angle) * (tier.r + 0.002)], r: [0, -angle, 0] });
    }
    group.add(instanced(kit, kit.box(0.012, tier.h * 0.5, 0.1), kit.composite(), vents));
  });

  // 玻璃核心 + 内部光柱。
  const glass = mesh(kit, kit.cyl(0.3, 0.34, 0.9, 32, true), kit.glass(0.26), 0, 0.62, 0);
  group.add(glass);
  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070a, emissive: tone.led, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.3,
  });
  group.add(mesh(kit, kit.cyl(0.06, 0.06, 0.86, 16), ledMaterial, 0, 0.62, 0));

  // 顶部品牌环与四个悬浮数据面。
  group.add(mesh(kit, kit.torus(0.5, 0.008, 6, 64), kit.ring(palette.gold, 0.45), 0, 1.12, 0).rotateX(Math.PI / 2));
  for (let index = 0; index < 3; index += 1) {
    const ring = mesh(kit, kit.torus(0.78 + index * 0.12, 0.004, 6, 80), kit.ring(index === 0 ? palette.cyan : palette.gold, 0.16), 0, 0.2 + index * 0.05, 0);
    ring.rotation.x = Math.PI / 2 + index * 0.04;
    group.add(ring);
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(kit.cyl(1.0, 1.0, 1.16, 8)),
    new THREE.LineBasicMaterial({ color: palette.gold, transparent: true, opacity: 0 }),
  );
  outline.position.y = 0.58;
  group.add(outline);

  return { group, pickables: pickablesOf(group), leds: [ledMaterial], outline, height: 1.28, radius: 1.0 };
}

export type NodeModelKind =
  | "server" | "database" | "ai" | "gateway" | "storage" | "auth"
  | "realtime" | "monitor" | "external" | "client-web" | "client-app";

export function buildNodeModel(
  kind: NodeModelKind,
  kit: ModelKit,
  palette: NexusPalette,
  status: NexusStatus,
): BuiltModel {
  switch (kind) {
    case "database": return buildDatabase(kit, palette, status);
    case "ai": return buildAiCore(kit, palette, status);
    case "gateway": return buildGateway(kit, palette, status);
    case "storage": return buildStorageArray(kit, palette, status);
    case "auth": return buildAuthModule(kit, palette, status);
    case "realtime": return buildRealtimeTower(kit, palette, status);
    case "monitor": return buildSensor(kit, palette, status);
    case "external": return buildExternal(kit, palette, status);
    case "client-web": return buildClient(kit, palette, "web");
    case "client-app": return buildClient(kit, palette, "app");
    case "server":
    default: return buildRack(kit, palette, status);
  }
}

export function applyStatus(model: BuiltModel, palette: NexusPalette, status: NexusStatus) {
  const tone = toneOf(palette, status);
  for (const material of model.leds) {
    material.emissive.setHex(tone.led);
  }
}

export function setOutline(model: BuiltModel, selected: boolean) {
  const material = model.outline.material as THREE.LineBasicMaterial;
  material.opacity = selected ? 0.92 : 0;
}

export { mesh as buildMesh, instanced as buildInstances };
