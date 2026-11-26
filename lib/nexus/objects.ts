"use client";

import * as THREE from "three";
import type { NexusLink, NexusNode, NexusStatus } from "./types";
import { KIND_TONE, LINK_COLORS, type NexusPalette } from "./palette";

/** 统一释放：几何、材质、贴图，避免切换场景后 GPU 资源越积越多。 */
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

export function cssColor(palette: NexusPalette, tone: string) {
  switch (tone) {
    case "gold": return palette.goldCss;
    case "cyan": return palette.cyanCss;
    case "blue": return palette.blueCss;
    case "violet": return palette.violetCss;
    case "green": return palette.greenCss;
    case "amber": return palette.amberCss;
    case "red": return palette.redCss;
    default: return palette.neutralCss;
  }
}

function toneNumber(palette: NexusPalette, tone: string) {
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

export function statusTone(status: NexusStatus) {
  if (status === "down" || status === "offline") return "red";
  if (status === "degraded") return "amber";
  if (status === "unknown") return "neutral";
  return "cyan";
}

function labelTexture(title: string, subtitle: string, palette: NexusPalette) {
  const canvas = document.createElement("canvas");
  const width = 512;
  const height = 150;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const dark = palette.mode === "dark";
  ctx.clearRect(0, 0, width, height);
  // 半透明底板保证在任何背景上都能读清，不使用发光描边。
  ctx.fillStyle = dark ? "rgba(10,15,18,.72)" : "rgba(248,250,249,.84)";
  roundRect(ctx, 8, 8, width - 16, height - 16, 16);
  ctx.fill();
  ctx.strokeStyle = dark ? "rgba(160,190,200,.22)" : "rgba(40,60,66,.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = dark ? "#eaf1f3" : "#1b2427";
  ctx.font = '600 44px "Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText(clip(title, 12), 30, 58);
  ctx.fillStyle = dark ? "rgba(190,208,214,.78)" : "rgba(60,74,78,.78)";
  ctx.font = '400 30px "Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  ctx.fillText(clip(subtitle, 20), 30, 108);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function clip(value: string, max: number) {
  const text = value || "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export type NodeObject = {
  id: string;
  kind: string;
  label: string;
  group: THREE.Group;
  labelSprite: THREE.Sprite | null;
  statusRing: THREE.Mesh;
  pickables: THREE.Object3D[];
  baseY: number;
  status: NexusStatus;
  selected: boolean;
  setStatus: (status: NexusStatus) => void;
  setSelected: (selected: boolean) => void;
  setLabelVisible: (visible: boolean) => void;
  dispose: () => void;
};

export function createNodeObject(node: Pick<NexusNode, "id" | "label" | "kind" | "status">, palette: NexusPalette, options: { label?: boolean } = {}): NodeObject {
  const tone = statusTone(node.status);
  const accent = toneNumber(palette, tone);
  const group = new THREE.Group();
  group.name = node.id;
  group.userData.nodeId = node.id;

  const metal = new THREE.MeshStandardMaterial({
    color: palette.metal, metalness: 0.55, roughness: 0.38,
    emissive: accent, emissiveIntensity: 0.06,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: palette.metalDark, metalness: 0.7, roughness: 0.42,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accent, metalness: 0.3, roughness: 0.32, emissive: accent, emissiveIntensity: 0.45,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: accent, transparent: true, opacity: 0.16, metalness: 0.2, roughness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.38 });
  const pickables: THREE.Object3D[] = [];
  const add = (mesh: THREE.Mesh, pickable = true) => {
    group.add(mesh);
    if (pickable) pickables.push(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), edgeMaterial);
    mesh.add(edges);
    return mesh;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = metal) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    pickables.push(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial);
    mesh.add(edges);
    return mesh;
  };
  const cylinder = (rt: number, rb: number, h: number, y: number, material = metal, segments = 36) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material);
    mesh.position.y = y;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  };

  switch (node.kind) {
    case "database": {
      // 多层圆柱 + 存储阵列：数据库的典型形态，不是通用方块。
      for (let index = 0; index < 4; index += 1) {
        const disk = cylinder(0.56, 0.56, 0.16, -0.3 + index * 0.22, index === 3 ? metal : darkMetal, 44);
        disk.rotation.y = index * 0.25;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.012, 8, 48), accentMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = disk.position.y + 0.09;
        group.add(ring);
      }
      const core = cylinder(0.12, 0.12, 0.95, 0.12, accentMaterial, 16);
      core.material = glass;
      break;
    }
    case "server": {
      // 机柜：主体 + 前面板槽位 + 顶部状态灯条。
      const rack = box(0.86, 1.3, 0.62, 0, 0.1, 0, metal);
      rack.material = metal;
      for (let index = 0; index < 5; index += 1) {
        box(0.62, 0.1, 0.03, 0, -0.3 + index * 0.2, 0.32, darkMetal);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), accentMaterial);
        led.position.set(0.26, -0.3 + index * 0.2, 0.345);
        group.add(led);
      }
      box(0.9, 0.05, 0.66, 0, 0.78, 0, accentMaterial);
      break;
    }
    case "storage": {
      // 存储阵列：三组高低不同的仓体 + 顶部光带。
      const heights = [0.5, 0.9, 0.68];
      heights.forEach((height, index) => {
        const slab = box(0.34, height, 0.62, (index - 1) * 0.42, -0.4 + height / 2, 0, index === 1 ? metal : darkMetal);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, height * 0.8, 0.02), accentMaterial);
        line.position.set((index - 1) * 0.42 + 0.16, -0.4 + height / 2, 0.32);
        group.add(line);
        slab.userData.kind = "storage";
      });
      break;
    }
    case "ai": {
      // 计算核心：多面体 + 双层调度环。
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), metal);
      core.position.y = 0.1;
      add(core);
      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), accentMaterial);
      glow.position.y = 0.1;
      group.add(glow);
      for (let index = 0; index < 2; index += 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62 + index * 0.16, 0.014, 8, 64), accentMaterial);
        ring.rotation.x = Math.PI / 2 + (index === 0 ? 0.1 : -0.18);
        ring.rotation.z = index === 0 ? 0.15 : -0.2;
        ring.position.y = 0.1;
        group.add(ring);
      }
      break;
    }
    case "gateway": {
      // 连接枢纽：环形入口 + 四个接入柱。
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 12, 64), metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.25;
      add(ring);
      for (let index = 0; index < 4; index += 1) {
        const angle = (index / 4) * Math.PI * 2;
        const pillar = box(0.1, 0.5, 0.1, Math.cos(angle) * 0.55, 0.02, Math.sin(angle) * 0.55, darkMetal);
        pillar.rotation.y = -angle;
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.18, 24), accentMaterial);
      hub.position.y = 0.25;
      group.add(hub);
      break;
    }
    case "client": {
      const octa = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), metal);
      octa.position.y = 0.2;
      add(octa);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 6, 40), accentMaterial);
      halo.rotation.x = Math.PI / 2;
      group.add(halo);
      break;
    }
    case "auth": {
      // 认证：盾形/钥匙孔意象，用双层圆盘 + 中心立柱。
      cylinder(0.4, 0.44, 0.12, 0.05, darkMetal, 40);
      cylinder(0.3, 0.33, 0.08, 0.2, metal, 40);
      const key = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 32), accentMaterial);
      key.position.y = 0.4;
      key.rotation.x = Math.PI / 2;
      group.add(key);
      break;
    }
    case "realtime": {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), new THREE.MeshStandardMaterial({
        color: palette.metalDark, metalness: 0.6, roughness: 0.3, wireframe: true, transparent: true, opacity: 0.7,
      }));
      sphere.position.y = 0.12;
      add(sphere);
      for (let index = 0; index < 2; index += 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.01, 6, 48), accentMaterial);
        ring.rotation.x = Math.PI / 2.4 + index * 0.5;
        ring.rotation.z = index * 0.7;
        group.add(ring);
      }
      break;
    }
    case "monitor": {
      box(0.52, 0.4, 0.42, 0, 0, 0, darkMetal);
      box(0.04, 0.34, 0.04, 0.18, 0.34, 0, accentMaterial);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), accentMaterial);
      dot.position.set(0.18, 0.54, 0);
      group.add(dot);
      break;
    }
    case "external": {
      const beacon = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 24), metal);
      beacon.position.y = 0.1;
      add(beacon);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 6, 36), accentMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.2;
      group.add(ring);
      break;
    }
    default: {
      box(0.66, 0.66, 0.66, 0, 0, 0, metal);
    }
  }

  // 基座状态环：颜色只由真实状态决定（正常青 / 预警琥珀 / 故障红 / 未知灰）。
  const statusRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.018, 6, 64),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.75 }),
  );
  statusRing.rotation.x = Math.PI / 2;
  statusRing.position.y = -0.52;
  group.add(statusRing);

  const labelSprite = options.label === false ? null : new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture(node.label, subtitleOf(node.kind), palette),
    transparent: true, depthWrite: false, depthTest: false,
    sizeAttenuation: true,
  }));
  if (labelSprite) {
    labelSprite.scale.set(1.72, 0.5, 1);
    labelSprite.position.set(0, 1.12, 0);
    labelSprite.renderOrder = 20;
    group.add(labelSprite);
  }

  const pickSet = [...pickables, statusRing];
  group.userData.pickables = pickSet;
  for (const pickable of pickSet) pickable.userData.nodeId = node.id;

  let currentStatus = node.status;
  const state: NodeObject = {
    id: node.id,
    kind: node.kind,
    label: node.label,
    group,
    labelSprite,
    statusRing,
    pickables: pickSet,
    baseY: 0,
    status: currentStatus,
    selected: false,
    setStatus(status) {
      if (status === currentStatus) return;
      currentStatus = status;
      state.status = status;
      const color = toneNumber(palette, statusTone(status));
      (statusRing.material as THREE.MeshBasicMaterial).color.setHex(color);
      (accentMaterial as THREE.MeshStandardMaterial).color.setHex(color);
      (accentMaterial as THREE.MeshStandardMaterial).emissive.setHex(color);
    },
    setSelected(selected) {
      if (state.selected === selected) return;
      state.selected = selected;
      statusRing.scale.setScalar(selected ? 1.35 : 1);
      (statusRing.material as THREE.MeshBasicMaterial).opacity = selected ? 1 : 0.75;
      group.position.y = state.baseY + (selected ? 0.06 : 0);
    },
    setLabelVisible(visible) {
      if (labelSprite) labelSprite.visible = visible;
    },
    dispose() {
      disposeObject(group);
    },
  };
  return state;
}

function subtitleOf(kind: string) {
  switch (kind) {
    case "database": return "PostgreSQL";
    case "server": return "Compute";
    case "storage": return "Object Storage";
    case "ai": return "AI Scheduler";
    case "gateway": return "Edge Gateway";
    case "client": return "Client";
    case "auth": return "Identity";
    case "realtime": return "Realtime";
    case "monitor": return "Observability";
    case "external": return "External API";
    default: return "Service";
  }
}

export type LinkObject = {
  id: string;
  link: NexusLink;
  group: THREE.Group;
  curve: THREE.QuadraticBezierCurve3;
  pickMesh: THREE.Mesh;
  setActive: (active: boolean) => void;
  update: (rate: number | null, bytes: number | null, measured: boolean) => void;
  dispose: () => void;
};

type ParticleMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uStart: { value: THREE.Vector3 };
    uControl: { value: THREE.Vector3 };
    uEnd: { value: THREE.Vector3 };
    uColor: { value: THREE.Color };
    uPixelRatio: { value: number };
    uOpacity: { value: number };
  };
};

const PARTICLE_VERTEX = `
  uniform float uTime;
  uniform vec3 uStart;
  uniform vec3 uControl;
  uniform vec3 uEnd;
  uniform float uPixelRatio;
  attribute float aT;
  attribute float aSpeed;
  attribute float aSize;
  varying float vFade;
  void main() {
    float t = fract(aT + uTime * aSpeed);
    vec3 p = (1.0 - t) * (1.0 - t) * uStart + 2.0 * (1.0 - t) * t * uControl + t * t * uEnd;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (260.0 / max(1.0, -mv.z));
    vFade = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.94, t);
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, r) * vFade * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export function createLinkObject(link: NexusLink, start: THREE.Vector3, end: THREE.Vector3, palette: NexusPalette, quality: number): LinkObject {
  const mid = start.clone().add(end).multiplyScalar(0.5);
  // 链路向上拱起，避免穿过节点；拱高随水平距离变化。
  const lift = Math.max(0.35, start.distanceTo(end) * 0.22);
  mid.y += lift;
  const curve = new THREE.QuadraticBezierCurve3(start.clone(), mid, end.clone());
  const group = new THREE.Group();
  group.name = link.id;

  const tone = LINK_COLORS[link.kind] || "neutral";
  const color = toneNumber(palette, tone);

  let tube: THREE.Mesh | null = null;
  let tubeBucket = -1;
  const buildTube = (radius: number) => {
    if (tube) {
      group.remove(tube);
      tube.geometry.dispose();
      (tube.material as THREE.Material).dispose();
    }
    tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, radius, 6, false),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.24, depthWrite: false }),
    );
    group.add(tube);
    if (pickMesh) {
      group.remove(pickMesh);
      pickMesh.geometry.dispose();
      (pickMesh.material as THREE.Material).dispose();
    }
    pickMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.16, 4, false),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    pickMesh.userData.linkId = link.id;
    group.add(pickMesh);
  };

  let pickMesh: THREE.Mesh = null as unknown as THREE.Mesh;
  buildTube(0.026);

  const maxParticles = Math.max(8, Math.round(quality));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(maxParticles * 3);
  const tValues = new Float32Array(maxParticles);
  const speeds = new Float32Array(maxParticles);
  const sizes = new Float32Array(maxParticles);
  for (let index = 0; index < maxParticles; index += 1) {
    tValues[index] = index / maxParticles + (Math.sin(index * 12.9898) * 0.5 + 0.5) / maxParticles;
    speeds[index] = 0.06 + ((Math.sin(index * 78.233) * 0.5 + 0.5) * 0.05);
    sizes[index] = 2.6 + (Math.sin(index * 37.719) * 0.5 + 0.5) * 1.8;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aT", new THREE.BufferAttribute(tValues, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.boundingSphere = new THREE.Sphere(mid, start.distanceTo(end));

  const material = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uStart: { value: start.clone() },
      uControl: { value: mid.clone() },
      uEnd: { value: end.clone() },
      uColor: { value: new THREE.Color(color) },
      uPixelRatio: { value: Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1) },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }) as ParticleMaterial;

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = true;
  group.add(points);

  let rate: number | null = null;
  let measured = link.measured;
  const state: LinkObject = {
    id: link.id,
    link,
    group,
    curve,
    pickMesh,
    setActive(active) {
      (material.uniforms.uOpacity as { value: number }).value = active ? Math.min(1, (material.uniforms.uOpacity.value || 0) + 0.2) : baseOpacity;
      if (tube) (tube.material as THREE.MeshBasicMaterial).opacity = active ? 0.72 : 0.24;
    },
    update(nextRate, bytes, nextMeasured) {
      rate = nextRate;
      measured = nextMeasured;
      const effective = measured && nextRate != null ? Math.max(0, nextRate) : 0;
      // 粒子数量按真实请求频率的对数增长；无请求时彻底不生成，避免装饰性流动。
      const active = effective > 0 ? Math.min(maxParticles, Math.max(3, Math.ceil(Math.log10(1 + effective * 9) * maxParticles * 0.42))) : 0;
      geometry.setDrawRange(0, active);
      material.uniforms.uOpacity.value = active ? 0.88 : 0;
      points.visible = active > 0;
      const speed = 0.045 + Math.min(0.22, Math.log10(1 + effective) * 0.07);
      for (let index = 0; index < speeds.length; index += 1) speeds[index] = speed * (0.75 + (index % 5) * 0.08);
      (geometry.getAttribute("aSpeed") as THREE.BufferAttribute).needsUpdate = true;
      // 只在线宽档位变化时重建 TubeGeometry，避免每帧产生垃圾。
      const bucket = effective <= 0 ? 0 : Math.min(4, Math.floor(Math.log10(1 + effective) * 2));
      if (bucket !== tubeBucket) {
        tubeBucket = bucket;
        buildTube(0.016 + bucket * 0.008);
      }
      if (tube) (tube.material as THREE.MeshBasicMaterial).opacity = active ? 0.2 + bucket * 0.04 : 0.08;
      link.rate = rate;
      link.measured = measured;
    },
    dispose() {
      disposeObject(group);
      geometry.dispose();
      material.dispose();
    },
  };
  const baseOpacity = 0.88;
  state.update(link.rate, link.bytesPerSecond, link.measured);
  return state;
}

/** 每帧推进粒子时间；暂停时由引擎停止调用。 */
export function advanceLink(link: LinkObject, deltaSeconds: number) {
  const points = link.group.children.find((child) => (child as THREE.Points).isPoints) as THREE.Points | undefined;
  if (!points) return;
  const material = points.material as ParticleMaterial;
  material.uniforms.uTime.value += deltaSeconds;
}

/** 独立文字标签：用于服务器分层、资源建筑、时间轴标记等没有完整节点模型的拾取点。 */
export function createSpriteLabel(title: string, subtitle: string, palette: NexusPalette, scale = 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture(title, subtitle, palette),
    transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: true,
  }));
  sprite.scale.set(1.7 * scale, 0.5 * scale, 1);
  sprite.renderOrder = 20;
  return sprite;
}
