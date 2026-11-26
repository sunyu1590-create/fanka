"use client";

/**
 * HEIKA Nexus 2.0 三维引擎。
 *
 * 职责边界：
 * - 一个 WebGLRenderer、一个 Scene、一个渲染循环；切换场景只重建内容组；
 * - 不发起任何网络请求，渲染帧率与采集频率完全解耦；
 * - 相机按真实包围球取景，面板尺寸变化时重算可用画布；
 * - 标签按距离分层、按优先级避让，尺寸随距离换算保持屏幕可读；
 * - WebGL 上下文丢失/恢复、页面不可见、系统减少动态效果都有明确处理。
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { NexusHistoryPoint, NexusMarker, NexusSceneKey, NexusSnapshot } from "./types";
import { buildScene, type BuiltScene, type SceneExtras } from "./scenes";
import { paletteFor, type NexusPalette } from "./palette";
import { advanceLink } from "./objects";
import type { LabelLevel, LabelObject } from "./labels";

export type QualityMode = "auto" | "eco" | "balanced" | "ultra";
export type ProjectionMode = "perspective" | "iso" | "top";
export type PickResult = { type: "node" | "link"; id: string } | null;

export type RenderStats = {
  fps: number;
  frameMs: number;
  quality: Exclude<QualityMode, "auto">;
  drawCalls: number;
  points: number;
  triangles: number;
  geometries: number;
  textures: number;
  dpr: number;
  width: number;
  height: number;
  labels: number;
  particleCap: number;
  /** performance.memory 可用时的已用 JS 堆；不可用时为 0（前端显示“不支持”）。 */
  heapBytes: number;
};

type EngineOptions = {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  theme: "dark" | "light";
  onPick?: (result: PickResult) => void;
  onFocus?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  onStats?: (stats: RenderStats) => void;
  onContextLost?: () => void;
};

type QualityProfile = {
  fps: number;
  pixelRatio: number;
  particles: number;
  shadows: boolean;
  shadowSize: number;
  labels: number;
};

const QUALITY_CONFIG: Record<Exclude<QualityMode, "auto">, QualityProfile> = {
  // 节能：低分辨率、无实时阴影、粒子减半，保证移动端稳定。
  eco: { fps: 24, pixelRatio: 1, particles: 40, shadows: false, shadowSize: 512, labels: 8 },
  balanced: { fps: 30, pixelRatio: 1.5, particles: 90, shadows: true, shadowSize: 1024, labels: 14 },
  ultra: { fps: 60, pixelRatio: 2, particles: 160, shadows: true, shadowSize: 2048, labels: 24 },
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export class NexusEngine {
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controls: OrbitControls;
  private palette: NexusPalette;
  private built: BuiltScene | null = null;
  private options: EngineOptions;
  private raf = 0;
  private running = false;
  private paused = false;
  private disposed = false;
  private lastFrame = 0;
  private quality: QualityMode = "auto";
  private effectiveQuality: Exclude<QualityMode, "auto"> = "balanced";
  private projection: ProjectionMode = "perspective";
  private targetFps = 30;
  private fpsSamples: number[] = [];
  private frameSamples: number[] = [];
  private lastStatsAt = 0;
  private lastAutoCheck = 0;
  private lastUpgradeAt = 0;
  private frameCount = 0;
  private userAdjusted = false;
  private tween: { fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; start: number; duration: number } | null = null;
  private labelsEnabled = true;
  private labelMode: "all" | "auto" | "none" = "auto";
  private lastLabelAt = 0;
  private selected: string | null = null;
  private visibilityHandler: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private contextLostHandler: (event: Event) => void;
  private contextRestoredHandler: () => void;
  private snapshot: NexusSnapshot | null = null;
  private sceneExtras: SceneExtras = {};
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private hemi: THREE.HemisphereLight | null = null;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private environmentScene: RoomEnvironment | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private backgroundTexture: THREE.Texture | null = null;
  private wireframe = false;
  private showParticles = true;
  private showLinks = true;
  private showShadows = true;
  private explodeState = false;
  private sceneLabels: Array<{ sprite: THREE.Sprite; label: LabelObject }> | null = null;
  private bottomInset = 0;
  private reducedMotion = false;
  private longPress: ReturnType<typeof setTimeout> | null = null;
  private pointer = { x: 0, y: 0, downX: 0, downY: 0, downAt: 0, dragging: false, moved: false, id: null as number | null };
  private lastHoverAt = 0;

  constructor(options: EngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.container = options.container;
    this.palette = paletteFor(options.theme);
    this.reducedMotion = prefersReducedMotion();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.theme === "dark" ? 1.08 : 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.applyAtmosphere();
    this.applyLights();
    this.camera = this.makePerspective(38);
    this.controls = this.makeControls(this.camera);
    this.resize();

    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") this.stopLoop();
      else if (!this.disposed) this.startLoop();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    this.contextLostHandler = (event) => {
      event.preventDefault();
      this.stopLoop();
      this.options.onContextLost?.();
    };
    this.contextRestoredHandler = () => {
      // 上下文恢复后 GPU 资源全部失效，必须重建当前场景内容。
      const key = this.built?.key || "overview";
      if (this.snapshot) this.setScene(key, this.snapshot, { rebuild: true, data: this.sceneExtras });
      this.startLoop();
    };
    this.canvas.addEventListener("webglcontextlost", this.contextLostHandler as EventListener, false);
    this.canvas.addEventListener("webglcontextrestored", this.contextRestoredHandler, false);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("dblclick", this.onDoubleClick);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);

    this.startLoop();
  }

  // ---------- 环境与光照 ----------

  private applyAtmosphere() {
    this.scene.background = new THREE.Color(this.palette.background);
    // 极轻的雾只用来分开前后景，不遮蔽模型。
    this.scene.fog = new THREE.FogExp2(this.palette.fog, this.palette.mode === "dark" ? 0.011 : 0.008);
  }

  /** 程序化环境反射：一次 PMREM，之后所有材质共享，不需要 HDR 资源。 */
  private ensureEnvironment() {
    if (this.environmentTarget || !this.renderer) return;
    try {
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.pmrem.compileEquirectangularShader();
      this.environmentScene = new RoomEnvironment();
      this.environmentTarget = this.pmrem.fromScene(this.environmentScene, 0.04);
      this.scene.environment = this.environmentTarget.texture;
    } catch {
      // 软件渲染或低端设备上环境贴图可能失败，失败时退回纯灯光照明。
      this.scene.environment = null;
    }
  }

  private applyLights() {
    const dark = this.palette.mode === "dark";
    this.hemi = new THREE.HemisphereLight(dark ? 0x9fb6c1 : 0xffffff, dark ? 0x0a0e11 : 0xd7dedf, dark ? 0.78 : 0.95);
    this.scene.add(this.hemi);

    // 主光：右上前方，提供清晰的受光面与投影方向。
    const key = new THREE.DirectionalLight(dark ? 0xfff3e2 : 0xffffff, dark ? 2.15 : 1.75);
    key.position.set(7.5, 11, 6.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.keyLight = key;

    // 补光：冷色，从左侧压住暗部，避免“半张脸全黑”。
    const fill = new THREE.DirectionalLight(dark ? 0x7fa8c4 : 0xc9dbe4, dark ? 0.72 : 0.55);
    fill.position.set(-8, 4.5, -6);
    this.scene.add(fill);
    this.fillLight = fill;

    // 轮廓光：后方偏金，勾出设备边缘，不参与泛光。
    const rim = new THREE.DirectionalLight(dark ? 0xd8b878 : 0xffffff, dark ? 0.7 : 0.45);
    rim.position.set(-2.5, 5.5, -9);
    this.scene.add(rim);
    this.rimLight = rim;
  }

  private disposeAtmosphere() {
    this.backgroundTexture?.dispose();
    this.backgroundTexture = null;
  }

  private makePerspective(fov = 38) {
    return new THREE.PerspectiveCamera(fov, 1, 0.08, 220);
  }

  private makeControls(camera: THREE.Camera) {
    const controls = new OrbitControls(camera, this.canvas);
    controls.enableDamping = !this.reducedMotion;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.65;
    controls.screenSpacePanning = true;
    controls.minDistance = 2.2;
    controls.maxDistance = 34;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minPolarAngle = 0.08;
    controls.target.set(0, 0.6, 0);
    controls.addEventListener("start", () => { this.tween = null; this.userAdjusted = true; });
    return controls;
  }

  private rebuildControls() {
    this.controls.dispose();
    this.controls = this.makeControls(this.camera);
    this.controls.update();
  }

  // ---------- 画质 ----------

  setQuality(mode: QualityMode) {
    this.quality = mode;
    this.applyQuality();
  }

  private profile() {
    return QUALITY_CONFIG[this.effectiveQuality];
  }

  private applyQuality() {
    const resolved: Exclude<QualityMode, "auto"> = this.quality === "auto" ? this.effectiveQuality : this.quality;
    this.effectiveQuality = resolved;
    const profile = this.profile();
    this.targetFps = profile.fps;
    this.renderer.setPixelRatio(Math.min(profile.pixelRatio, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = profile.shadows && this.showShadows;
    if (this.keyLight) {
      this.keyLight.castShadow = profile.shadows && this.showShadows;
      this.keyLight.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
      if (this.keyLight.shadow.map) {
        this.keyLight.shadow.map.dispose();
        this.keyLight.shadow.map = null;
      }
    }
    if (profile.pixelRatio >= 1.5) this.ensureEnvironment();
    this.resize();
    if (this.built && this.snapshot) {
      // 粒子预算与几何细节随画质变化：重建内容组，但不重建引擎。
      const key = this.built.key;
      this.setScene(key, this.snapshot, { rebuild: true, data: this.sceneExtras });
    }
  }

  setShadows(enabled: boolean) {
    this.showShadows = enabled;
    this.applyQuality();
  }

  setTheme(theme: "dark" | "light", rebuild = false) {
    const next = paletteFor(theme);
    this.palette = next;
    (this.scene.background as THREE.Color).setHex(next.background);
    if (this.scene.fog) (this.scene.fog as THREE.FogExp2).color.setHex(next.fog);
    if (this.hemi) {
      this.hemi.color.setHex(theme === "dark" ? 0x9fb6c1 : 0xffffff);
      this.hemi.groundColor.setHex(theme === "dark" ? 0x0a0e11 : 0xd7dedf);
    }
    if (this.keyLight) this.keyLight.intensity = theme === "dark" ? 2.15 : 1.75;
    this.renderer.toneMappingExposure = theme === "dark" ? 1.08 : 1.0;
    if (rebuild && this.snapshot) {
      const key = this.built?.key || "overview";
      this.setScene(key, this.snapshot, { rebuild: true, data: this.sceneExtras });
    }
  }

  // ---------- 场景 ----------

  setScene(key: NexusSceneKey, snapshot: NexusSnapshot, extras: { rebuild?: boolean; data?: SceneExtras } = {}) {
    this.snapshot = snapshot;
    if (extras.data) this.sceneExtras = extras.data;
    if (this.built?.key === key && !extras.rebuild) {
      this.built.update(snapshot);
      return;
    }
    const previousCamera = this.camera.position.clone();
    const previousTarget = this.controls.target.clone();
    const hadScene = Boolean(this.built);
    if (this.built) {
      this.scene.remove(this.built.root);
      this.built.dispose();
      this.built = null;
    }
    this.built = buildScene(key, snapshot, this.palette, {
      particleCap: this.profile().particles, ...(this.sceneExtras || {}), ...(extras.data || {}),
    });
    this.scene.add(this.built.root);
    this.sceneLabels = null;
    // 重建后恢复用户显式设定的显示状态，避免切换场景把调试开关重置。
    if (this.wireframe) this.applyWireframe(true);
    if (!this.showParticles) this.setParticlesVisible(false);
    if (!this.showLinks) this.setLinksVisible(false);
    if (this.explodeState) this.setExplode(true);
    this.applyProjectionDefault();
    this.selected = null;
    if (hadScene && !this.reducedMotion) {
      // 场景切换：从旧机位平滑过渡到新场景取景。
      const target = this.fitTarget();
      this.tween = {
        fromP: previousCamera, toP: target.position, fromT: previousTarget, toT: target.target,
        start: performance.now(), duration: 560,
      };
    } else {
      this.frameScene(false);
    }
    this.forceRender();
  }

  private fitTarget() {
    const bounds = this.built?.bounds || { center: [0, 0, 0] as [number, number, number], radius: 6 };
    const center = new THREE.Vector3(...bounds.center);
    const radius = Math.max(1, bounds.radius);
    const camera = this.camera as THREE.PerspectiveCamera;
    const fov = (camera.isPerspectiveCamera ? camera.fov : 38) * Math.PI / 180;
    const aspect = Math.max(0.4, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const dir = this.viewDirection();
    const box = this.built?.box;

    // 有真实包围盒时按包围盒的 8 个顶点投影取景：分别满足水平与垂直视野，
    // 得到“刚好把内容放进画布”的距离，而不是用外接球粗暴放远。
    let distance: number;
    if (box && !box.isEmpty()) {
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
      if (right.lengthSq() < 0.01) right.set(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(dir, right).normalize();
      let halfW = 0;
      let halfH = 0;
      const corner = new THREE.Vector3();
      for (let index = 0; index < 8; index += 1) {
        corner.set(
          index & 1 ? box.max.x : box.min.x,
          index & 2 ? box.max.y : box.min.y,
          index & 4 ? box.max.z : box.min.z,
        ).sub(center);
        halfW = Math.max(halfW, Math.abs(corner.dot(right)));
        halfH = Math.max(halfH, Math.abs(corner.dot(up)));
      }
      const byHeight = halfH / Math.tan(fov / 2);
      const byWidth = halfW / Math.tan(fovH / 2);
      // 0.94 = 留 6% 边距，既不裁切也不留大片空白。
      distance = Math.max(byHeight, byWidth) * 0.94;
    } else {
      const fit = Math.min(fov, fovH);
      distance = (radius / Math.sin(fit / 2)) * 0.88;
    }
    // 底部面板遮挡：把取景中心上移，避免核心被面板压住。
    const height = Math.max(1, this.container.clientHeight);
    if (this.bottomInset > 0) distance *= 1 + Math.min(0.6, this.bottomInset / height);

    const position = center.clone().add(dir.clone().multiplyScalar(distance));
    const target = center.clone();
    if (this.bottomInset > 0) {
      // 视线整体下移，内容在屏幕上抬升，让出底部面板。
      const worldPerPixel = (2 * Math.tan(fov / 2) * distance) / height;
      const lift = (this.bottomInset / 2) * worldPerPixel;
      const up = this.camera.up.clone().normalize();
      position.addScaledVector(up, -lift);
      target.addScaledVector(up, -lift);
    }
    return { position, target, distance };
  }

  private viewDirection() {
    if (this.projection === "top") return new THREE.Vector3(0, 1, 0.001).normalize();
    if (this.projection === "iso") return new THREE.Vector3(1, 0.92, 1).normalize();
    const camera = this.built?.defaultCamera;
    if (!camera) return new THREE.Vector3(0.62, 0.46, 0.72).normalize();
    return new THREE.Vector3(
      camera.position[0] - camera.target[0],
      camera.position[1] - camera.target[1],
      camera.position[2] - camera.target[2],
    ).normalize();
  }

  private frameScene(animate: boolean) {
    if (!this.built) return;
    const { position, target } = this.fitTarget();
    if (!animate || this.reducedMotion) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.userAdjusted = false;
      this.forceRender();
      return;
    }
    this.tween = {
      fromP: this.camera.position.clone(), toP: position,
      fromT: this.controls.target.clone(), toT: target,
      start: performance.now(), duration: 520,
    };
    this.userAdjusted = false;
    this.forceRender();
  }

  private applyProjectionDefault() {
    if (this.projection === "perspective" && this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.fov = 38;
      this.camera.updateProjectionMatrix();
    }
  }

  setProjection(mode: ProjectionMode) {
    if (this.projection === mode) return;
    this.projection = mode;
    const center = this.built ? new THREE.Vector3(...this.built.bounds.center) : new THREE.Vector3();
    if (mode === "top") {
      const width = Math.max(1, this.container.clientWidth - 8);
      const height = Math.max(1, this.container.clientHeight - 8);
      const radius = (this.built?.bounds.radius || 6) * 1.12;
      const spanX = radius * 2;
      const spanY = spanX / Math.max(0.5, width / height);
      this.camera = new THREE.OrthographicCamera(-spanX / 2, spanX / 2, spanY / 2, -spanY / 2, 0.1, 120);
      this.camera.position.set(center.x, center.y + 26, center.z + 0.001);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(center);
      this.rebuildControls();
      this.controls.target.copy(center);
      this.controls.update();
    } else {
      const camera = this.makePerspective(mode === "iso" ? 30 : 38);
      this.camera = camera;
      this.rebuildControls();
      this.frameScene(true);
    }
    this.camera.updateProjectionMatrix();
    this.resize();
    this.forceRender();
  }

  setLabels(enabled: boolean) {
    this.labelsEnabled = enabled;
    for (const node of this.built?.nodes || []) node.setLabelVisible(enabled);
    this.lastLabelAt = 0;
  }

  setLabelMode(mode: "all" | "auto" | "none") {
    this.labelMode = mode;
    this.labelsEnabled = mode !== "none";
    for (const node of this.built?.nodes || []) node.setLabelVisible(mode !== "none");
    this.lastLabelAt = 0;
  }

  setParticlesVisible(visible: boolean) {
    this.showParticles = visible;
    for (const link of this.built?.links || []) {
      const points = link.group.children.filter((child) => (child as THREE.Points).isPoints);
      for (const point of points) point.visible = visible;
    }
  }

  setLinksVisible(visible: boolean) {
    this.showLinks = visible;
    for (const link of this.built?.links || []) {
      for (const child of link.group.children) {
        if (!(child as THREE.Points).isPoints) child.visible = visible;
      }
    }
  }

  setExplode(value: boolean) {
    this.explodeState = value;
    this.built?.setExplode?.(value);
    this.forceRender();
  }

  setWireframe(value: boolean) {
    this.wireframe = value;
    this.applyWireframe(value);
    this.forceRender();
  }

  private wireframeState = new Map<THREE.Material, boolean>();

  private applyWireframe(value: boolean) {
    if (!this.built) return;
    this.built.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      const list = Array.isArray(material) ? material : [material];
      for (const item of list) {
        const candidate = item as THREE.MeshStandardMaterial;
        if (!("wireframe" in candidate)) continue;
        if (value) {
          if (!this.wireframeState.has(candidate)) this.wireframeState.set(candidate, candidate.wireframe);
          candidate.wireframe = true;
        } else {
          candidate.wireframe = this.wireframeState.get(candidate) ?? false;
        }
        candidate.needsUpdate = true;
      }
    });
    if (!value) this.wireframeState.clear();
  }

  setHistorical(point: NexusHistoryPoint | null, markers: NexusMarker[]) {
    this.built?.setHistorical?.(point, markers);
    this.forceRender();
  }

  setAutoRotate(enabled: boolean, speed = 0.32) {
    this.controls.autoRotate = enabled && !this.reducedMotion;
    this.controls.autoRotateSpeed = speed;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.forceRender();
  }

  update(snapshot: NexusSnapshot) {
    this.snapshot = snapshot;
    if (this.built) this.built.update(snapshot);
  }

  setSelected(id: string | null) {
    this.selected = id;
    this.built?.setSelected(id);
    this.forceRender();
  }

  focus(id: string) {
    const point = this.built?.focusPoint(id);
    if (!point) return;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    if (direction.lengthSq() < 0.1) direction.set(0.6, 0.5, 0.8).normalize();
    const radius = this.built?.bounds.radius || 6;
    const distance = Math.max(2.6, Math.min(7.5, radius * 0.72));
    const position = point.clone().add(direction.multiplyScalar(distance));
    if (position.y < point.y + 1.6) position.y = point.y + 1.6;
    this.tween = {
      fromP: this.camera.position.clone(), toP: position,
      fromT: this.controls.target.clone(), toT: point,
      start: performance.now(), duration: this.reducedMotion ? 1 : 620,
    };
    this.built?.setSelected(id);
    this.selected = id;
    this.options.onFocus?.(id);
    this.forceRender();
  }

  resetCamera() {
    this.frameScene(true);
  }

  setBottomInset(px: number) {
    const next = Math.max(0, Math.round(px));
    if (next === this.bottomInset) return;
    this.bottomInset = next;
    if (!this.userAdjusted) this.frameScene(true);
  }

  // ---------- 拾取 ----------

  pickAt(clientX: number, clientY: number): PickResult {
    if (!this.built) return null;
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const targets: THREE.Object3D[] = [...this.built.pickables];
    for (const link of this.built.links) targets.push(link.pickMesh);
    const hits = raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      let current: THREE.Object3D | null = hit.object;
      while (current) {
        if (current.userData.linkId) return { type: "link", id: String(current.userData.linkId) };
        if (current.userData.nodeId) return { type: "node", id: String(current.userData.nodeId) };
        current = current.parent;
      }
    }
    return null;
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pointer.downX = event.clientX;
    this.pointer.downY = event.clientY;
    this.pointer.downAt = performance.now();
    this.pointer.moved = false;
    this.pointer.id = event.pointerId;
    this.tween = null;
    if (this.longPress) clearTimeout(this.longPress);
    this.longPress = setTimeout(() => {
      if (!this.pointer.moved) {
        const result = this.pickAt(this.pointer.downX, this.pointer.downY);
        if (result?.type === "node") this.options.onContextMenu?.(result.id, this.pointer.downX, this.pointer.downY);
      }
    }, 620);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.pointer.downAt) {
      const dx = event.clientX - this.pointer.downX;
      const dy = event.clientY - this.pointer.downY;
      if (Math.hypot(dx, dy) > 6) {
        this.pointer.moved = true;
        if (this.longPress) { clearTimeout(this.longPress); this.longPress = null; }
      }
      return;
    }
    const now = performance.now();
    if (now - this.lastHoverAt < 120) return;
    this.lastHoverAt = now;
    const result = this.pickAt(event.clientX, event.clientY);
    this.options.onHover?.(result?.type === "node" || result?.type === "link" ? result.id : null);
    this.canvas.style.cursor = result ? "pointer" : "grab";
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.longPress) { clearTimeout(this.longPress); this.longPress = null; }
    const quick = performance.now() - this.pointer.downAt < 620;
    if (!this.pointer.moved && quick) {
      const result = this.pickAt(event.clientX, event.clientY);
      this.options.onPick?.(result);
      if (result?.type === "node") this.setSelected(result.id);
      else if (result?.type === "link") this.setSelected(null);
    }
    this.pointer.downAt = 0;
    this.pointer.moved = false;
    this.canvas.style.cursor = "grab";
  };

  private onPointerLeave = () => {
    this.options.onHover?.(null);
    if (this.longPress) { clearTimeout(this.longPress); this.longPress = null; }
    this.pointer.downAt = 0;
  };

  private onDoubleClick = (event: MouseEvent) => {
    const result = this.pickAt(event.clientX, event.clientY);
    if (result?.type === "node") this.focus(result.id);
  };

  private onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    const result = this.pickAt(event.clientX, event.clientY);
    if (result?.type === "node") this.options.onContextMenu?.(result.id, event.clientX, event.clientY);
  };

  private resize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height;
    } else {
      const radius = (this.built?.bounds.radius || 6) * 1.12;
      const spanX = radius * 2;
      const spanY = spanX / Math.max(0.5, width / height);
      this.camera.left = -spanX / 2;
      this.camera.right = spanX / 2;
      this.camera.top = spanY / 2;
      this.camera.bottom = -spanY / 2;
    }
    this.camera.updateProjectionMatrix();
    // 面板开合导致画布尺寸变化：未手动调整视角时重新取景。
    if (this.built && !this.userAdjusted) this.frameScene(false);
    this.forceRender();
  };

  // ---------- 渲染循环 ----------

  private startLoop() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (!this.running || this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const interval = 1000 / this.targetFps;
      if (now - this.lastFrame < interval) return;
      const delta = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.tick(delta, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopLoop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick(delta: number, now: number) {
    this.frameCount += 1;
    if (this.tween) {
      const progress = Math.min(1, (now - this.tween.start) / this.tween.duration);
      // easeOutCubic：起步快、收尾稳，避免镜头像被“甩”过去。
      const eased = 1 - Math.pow(1 - progress, 3);
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, eased);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, eased);
      if (progress >= 1) this.tween = null;
    }
    this.controls.update();
    if (this.built && !this.paused) {
      for (const link of this.built.links) advanceLink(link, delta);
    }
    const started = performance.now();
    this.renderer.render(this.scene, this.camera);
    const frameMs = performance.now() - started;
    this.updateLabels(now);
    this.collectStats(now, frameMs);
  }

  private updateLabels(now: number) {
    if (!this.built || !this.labelsEnabled || this.labelMode === "none") return;
    if (now - this.lastLabelAt < 180) return;
    this.lastLabelAt = now;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const camera = this.camera;
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov * Math.PI / 180 : Math.PI / 4;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const maxLabels = this.profile().labels;

    const sceneRadius = this.built.bounds.radius || 6;

    const ranked = [...this.built.nodes].sort((a, b) => {
      if (a.id === this.selected) return -1;
      if (b.id === this.selected) return 1;
      const weight = (node: (typeof this.built)["nodes"][number]) =>
        node.status === "down" ? 0 : node.status === "degraded" ? 1 : 2;
      return weight(a) - weight(b);
    });

    let shown = 0;
    for (const node of ranked) {
      const label = node.labelObject;
      if (!label) continue;
      const world = new THREE.Vector3();
      label.sprite.getWorldPosition(world);
      const distance = camera.position.distanceTo(world);
      const projected = world.clone().project(camera);
      const onScreen = projected.z > -1 && projected.z < 1
        && projected.x > -1.04 && projected.x < 1.04 && projected.y > -1.04 && projected.y < 1.04;
      const selected = node.id === this.selected;
      if (!onScreen) { label.setVisible(false); continue; }
      if (!selected && shown >= maxLabels) { label.setVisible(false); continue; }

      let level: LabelLevel = "mid";
      if (distance > sceneRadius * 2.1) level = "far";
      else if (selected || distance < sceneRadius * 0.85) level = "near";
      label.setLevel(level);

      // 尺寸换算：按“标题字号在屏幕上的像素高度”反推 sprite 世界尺寸。
      // 直接给 canvas 高度设目标像素会让文字缩到 8px（画布里有大量内边距）。
      const pixelsPerWorld = camera instanceof THREE.PerspectiveCamera
        ? (height / 2) / (Math.tan(fov / 2) * Math.max(0.2, distance))
        : height / (sceneRadius * 2.4);
      const desiredTitlePx = level === "far" ? 14.5 : level === "near" ? 18 : 16;
      const worldHeight = desiredTitlePx / Math.max(0.04, label.titleRatio) / Math.max(1, pixelsPerWorld);
      label.sprite.scale.set(worldHeight * label.aspect, worldHeight, 1);

      const screenX = (projected.x * 0.5 + 0.5) * width;
      const screenY = (-projected.y * 0.5 + 0.5) * height;
      const boxHeight = worldHeight * pixelsPerWorld;
      const boxWidth = boxHeight * label.aspect;
      const box = { x: screenX - boxWidth / 2, y: screenY - boxHeight, w: boxWidth, h: boxHeight };
      const overlaps = !selected && rects.some((rect) => !(box.x + box.w < rect.x || box.x > rect.x + rect.w || box.y + box.h < rect.y || box.y > rect.y + rect.h));
      if (this.labelMode === "auto" && overlaps) { label.setVisible(false); continue; }
      label.setVisible(true);
      if (!selected) rects.push(box);
      shown += 1;
    }

    this.sizeSceneLabels(camera, fov, width, height);
  }

  /**
   * 场景内独立标签（服务器分层、资源分区、防御层、时间刻度）统一按屏幕字号换算。
   * 旧实现用固定世界尺寸，镜头一远就缩成 6px，等于不可读。
   */
  private sizeSceneLabels(
    camera: THREE.Camera,
    fov: number,
    width: number,
    height: number,
  ) {
    if (!this.built) return;
    let sprites = this.sceneLabels;
    if (!sprites) {
      sprites = [];
      this.built.root.traverse((child) => {
        const sprite = child as THREE.Sprite;
        if (!sprite.isSprite) return;
        const label = sprite.userData.label as LabelObject | undefined;
        if (label) sprites!.push({ sprite, label });
      });
      this.sceneLabels = sprites;
    }
    const world = new THREE.Vector3();
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
    // 场景内标签同样需要避让：先按屏幕位置排定顺序，再逐条压掉重叠项，
    // 否则内容星群/资源城市会出现十几条标签互相覆盖、挡住模型。
    const measured: Array<{ sprite: THREE.Sprite; label: LabelObject; x: number; y: number; w: number; h: number }> = [];
    for (const item of sprites) {
      item.sprite.getWorldPosition(world);
      const distance = camera.position.distanceTo(world);
      const projected = world.clone().project(camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.06 || Math.abs(projected.y) > 1.06) {
        item.sprite.visible = false;
        continue;
      }
      const pixelsPerWorld = camera instanceof THREE.PerspectiveCamera
        ? (height / 2) / (Math.tan(fov / 2) * Math.max(0.2, distance))
        : height / Math.max(1, (this.built.bounds.radius || 6) * 2.4);
      const level = item.label.level;
      const desiredTitlePx = level === "far" ? 12.5 : level === "near" ? 16 : 14;
      const worldHeight = desiredTitlePx / Math.max(0.04, item.label.titleRatio) / Math.max(1, pixelsPerWorld);
      const screenHeight = worldHeight * pixelsPerWorld;
      const screenWidth = screenHeight * item.label.aspect;
      item.sprite.scale.set(worldHeight * item.label.aspect, worldHeight, 1);
      measured.push({
        sprite: item.sprite,
        label: item.label,
        // sprite 以底部中点为锚，先转换成包围盒左上角。
        x: (projected.x * 0.5 + 0.5) * width - screenWidth / 2,
        y: (-projected.y * 0.5 + 0.5) * height - screenHeight,
        w: screenWidth,
        h: screenHeight,
      });
    }
    for (const item of measured) {
      const overlap = boxes.some((box) => !(item.x + item.w < box.x || item.x > box.x + box.w || item.y + item.h < box.y || item.y > box.y + box.h));
      item.sprite.visible = !overlap || this.labelMode === "all";
      if (!overlap) boxes.push({ x: item.x, y: item.y, w: item.w, h: item.h });
    }
  }

  private readHeapBytes() {
    // performance.memory 仅 Chromium 系暴露；其他浏览器返回 0，界面显示“不支持”。
    const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    const used = memory?.usedJSHeapSize;
    return typeof used === "number" && Number.isFinite(used) ? used : 0;
  }

  private collectStats(now: number, frameMs: number) {
    this.frameSamples.push(frameMs);
    if (this.frameSamples.length > 30) this.frameSamples.shift();
    if (now - this.lastStatsAt < 1000) return;
    const elapsed = Math.max(1, now - this.lastStatsAt);
    const fps = Math.round((this.frameCount * 1000) / elapsed);
    this.frameCount = 0;
    this.lastStatsAt = now;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 6) this.fpsSamples.shift();
    const average = this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length;
    const frameAvg = this.frameSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, this.frameSamples.length);

    this.options.onStats?.({
      fps: Math.round(average),
      frameMs: Number(frameAvg.toFixed(2)),
      quality: this.effectiveQuality,
      drawCalls: this.renderer.info.render.calls,
      points: this.renderer.info.render.points,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      dpr: this.renderer.getPixelRatio(),
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      labels: this.built?.nodes.filter((node) => node.labelObject?.sprite.visible).length || 0,
      particleCap: this.profile().particles,
      heapBytes: this.readHeapBytes(),
    });

    // 自动画质：持续低帧率先降档；稳定高帧率再逐级恢复，带滞回避免抖动。
    if (this.quality !== "auto") return;
    if (now - this.lastAutoCheck < 5000) return;
    this.lastAutoCheck = now;
    const below = average < this.targetFps * 0.7;
    const above = average > Math.min(58, this.targetFps * 1.18) && now - this.lastUpgradeAt > 15_000;
    if (below && this.effectiveQuality !== "eco") {
      this.effectiveQuality = this.effectiveQuality === "ultra" ? "balanced" : "eco";
      this.lastUpgradeAt = now;
      this.applyQuality();
    } else if (above && this.effectiveQuality !== "ultra") {
      this.effectiveQuality = this.effectiveQuality === "eco" ? "balanced" : "ultra";
      this.lastUpgradeAt = now;
      this.applyQuality();
    }
  }

  forceRender() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.stopLoop();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    window.removeEventListener("resize", this.resize);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.contextLostHandler as EventListener);
    this.canvas.removeEventListener("webglcontextrestored", this.contextRestoredHandler);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    if (this.longPress) clearTimeout(this.longPress);
    if (this.built) {
      this.scene.remove(this.built.root);
      this.built.dispose();
      this.built = null;
    }
    this.controls.dispose();
    this.environmentTarget?.dispose();
    this.environmentScene?.dispose?.();
    this.pmrem?.dispose();
    this.disposeAtmosphere();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
