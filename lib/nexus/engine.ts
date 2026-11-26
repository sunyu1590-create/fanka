"use client";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { NexusHistoryPoint, NexusMarker, NexusSceneKey, NexusSnapshot } from "./types";
import { buildScene, type BuiltScene, type SceneExtras } from "./scenes";
import { paletteFor, type NexusPalette } from "./palette";
import { advanceLink } from "./objects";

export type QualityMode = "auto" | "eco" | "balanced" | "ultra";
export type ProjectionMode = "perspective" | "iso" | "top";
export type PickResult = { type: "node" | "link"; id: string } | null;

type EngineOptions = {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  theme: "dark" | "light";
  onPick?: (result: PickResult) => void;
  onFocus?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  onStats?: (stats: { fps: number; quality: QualityMode; drawCalls: number; particles: number }) => void;
  onContextLost?: () => void;
};

const QUALITY_CONFIG: Record<Exclude<QualityMode, "auto">, { fps: number; particles: number; pixelRatio: number }> = {
  eco: { fps: 24, particles: 9, pixelRatio: 1 },
  balanced: { fps: 30, particles: 18, pixelRatio: 1.5 },
  ultra: { fps: 60, particles: 34, pixelRatio: 2 },
};

/**
 * HEIKA Nexus 三维引擎。
 * - 一个 WebGLRenderer、一个场景、一个渲染循环；切换场景只重建内容组。
 * - 渲染帧率与后端采集频率解耦：引擎不发起任何网络请求。
 * - 标签面向摄像机（Sprite），并按屏幕矩形做简单避让。
 */
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
  private clock = new THREE.Clock();
  private quality: QualityMode = "auto";
  private effectiveQuality: Exclude<QualityMode, "auto"> = "balanced";
  private projection: ProjectionMode = "perspective";
  private targetFps = 30;
  private fpsSamples: number[] = [];
  private lastStatsAt = 0;
  private autoCheckAt = 0;
  private pointer = { x: 0, y: 0, downX: 0, downY: 0, downAt: 0, dragging: false, moved: false, id: null as number | null };
  private longPress: ReturnType<typeof setTimeout> | null = null;
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

  constructor(options: EngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.container = options.container;
    this.palette = paletteFor(options.theme);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.palette.background);
    this.scene.fog = new THREE.Fog(this.palette.fog, 16, 42);
    this.applyLights();
    this.camera = this.makePerspective();
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
      this.options.onContextLost?.();
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

  private applyLights() {
    const hemi = new THREE.HemisphereLight(this.palette.mode === "dark" ? 0x9fb8c2 : 0xffffff, this.palette.background, this.palette.mode === "dark" ? 1.25 : 1.5);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(this.palette.mode === "dark" ? 0xfff2dc : 0xffffff, this.palette.mode === "dark" ? 2.1 : 1.7);
    key.position.set(8, 12, 7);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(this.palette.blue, this.palette.mode === "dark" ? 0.9 : 0.55);
    fill.position.set(-9, 5, -8);
    this.scene.add(fill);
    const rim = new THREE.PointLight(this.palette.gold, this.palette.mode === "dark" ? 18 : 8, 24);
    rim.position.set(0, 3, -6);
    this.scene.add(rim);
  }

  private makePerspective(fov = 42) {
    return new THREE.PerspectiveCamera(fov, 1, 0.1, 120);
  }

  private makeControls(camera: THREE.Camera) {
    const controls = new OrbitControls(camera, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.85;
    controls.panSpeed = 0.7;
    controls.screenSpacePanning = true;
    controls.minDistance = 3.2;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.target.set(0, 0.2, 0);
    return controls;
  }

  private destroyControls() {
    this.controls.dispose();
  }

  private rebuildControls() {
    this.destroyControls();
    this.controls = this.makeControls(this.camera);
    this.controls.addEventListener("start", () => { this.tween = null; });
  }

  setQuality(mode: QualityMode) {
    this.quality = mode;
    this.applyQuality();
  }

  private applyQuality() {
    const resolved: Exclude<QualityMode, "auto"> = this.quality === "auto" ? this.effectiveQuality : this.quality;
    this.effectiveQuality = resolved;
    const config = QUALITY_CONFIG[resolved];
    this.targetFps = config.fps;
    const ratio = Math.min(config.pixelRatio, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = false;
    this.resize();
    if (this.built && this.snapshot) {
      const key = this.built.key;
      this.built.update(this.snapshot);
      this.setScene(key, this.snapshot, { rebuild: true, data: this.sceneExtras });
    }
    this.options.onStats?.({ fps: 0, quality: resolved, drawCalls: this.renderer.info.render.calls, particles: 0 });
  }

  private particleCap() {
    return QUALITY_CONFIG[this.effectiveQuality].particles;
  }

  setTheme(theme: "dark" | "light", rebuild = false) {
    this.palette = paletteFor(theme);
    (this.scene.background as THREE.Color).setHex(this.palette.background);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.setHex(this.palette.fog);
    if (rebuild && this.snapshot) {
      const key = this.built?.key || "overview";
      this.setScene(key, this.snapshot, { rebuild: true });
    }
  }

  setScene(key: NexusSceneKey, snapshot: NexusSnapshot, extras: { rebuild?: boolean; data?: SceneExtras } = {}) {
    this.snapshot = snapshot;
    if (extras.data) this.sceneExtras = extras.data;
    if (this.built?.key === key && !extras.rebuild) {
      this.built.update(snapshot);
      return;
    }
    const previousCamera = this.camera.position.clone();
    const previousTarget = this.controls.target.clone();
    if (this.built) {
      this.scene.remove(this.built.root);
      this.built.dispose();
      this.built = null;
    }
    this.built = buildScene(key, snapshot, this.palette, {
      particleCap: this.particleCap(), ...(this.sceneExtras || {}), ...(extras.data || {}),
    });
    this.scene.add(this.built.root);
    this.applyProjectionDefault();
    // 场景切换：镜头从当前位置平滑过渡到新场景默认机位。
    const target = new THREE.Vector3(...this.built.defaultCamera.target);
    const position = new THREE.Vector3(...this.built.defaultCamera.position);
    this.tween = {
      fromP: previousCamera, toP: position, fromT: previousTarget, toT: target,
      start: performance.now(), duration: 620,
    };
    this.selected = null;
    this.forceRender();
  }

  private applyProjectionDefault() {
    if (this.projection === "top" || this.projection === "iso") return;
    const perspective = this.camera as THREE.PerspectiveCamera;
    perspective.fov = 42;
    perspective.updateProjectionMatrix();
  }

  setProjection(mode: ProjectionMode) {
    if (this.projection === mode) return;
    this.projection = mode;
    const target = this.controls.target.clone();
    if (mode === "top") {
      const width = this.container.clientWidth || 1;
      const height = this.container.clientHeight || 1;
      const span = 16;
      this.camera = new THREE.OrthographicCamera(-span * (width / height) / 2, span * (width / height) / 2, span / 2, -span / 2, 0.1, 100);
      this.camera.position.set(0, 22, 0.001);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(target);
    } else {
      const fov = mode === "iso" ? 30 : 42;
      this.camera = this.makePerspective(fov);
      const distance = 14;
      const angle = Math.PI / 4;
      this.camera.position.set(
        target.x + Math.cos(angle) * distance * (mode === "iso" ? 1 : 1),
        target.y + (mode === "iso" ? 11 : 7),
        target.z + Math.sin(angle) * distance,
      );
      this.camera.lookAt(target);
    }
    this.camera.updateProjectionMatrix();
    this.rebuildControls();
    this.controls.target.copy(target);
    this.controls.update();
    this.resize();
    this.forceRender();
  }

  setLabels(enabled: boolean) {
    this.labelsEnabled = enabled;
    for (const node of this.built?.nodes || []) node.setLabelVisible(enabled);
  }

  setLabelMode(mode: "all" | "auto" | "none") {
    this.labelMode = mode;
    this.setLabels(mode !== "none");
    if (mode === "all") {
      for (const node of this.built?.nodes || []) node.setLabelVisible(true);
    }
    this.lastLabelAt = 0;
  }

  setHistorical(point: NexusHistoryPoint | null, markers: NexusMarker[]) {
    this.built?.setHistorical?.(point, markers);
    this.forceRender();
  }

  setAutoRotate(enabled: boolean, speed = 0.42) {
    this.controls.autoRotate = enabled;
    this.controls.autoRotateSpeed = speed;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) this.clock.getDelta();
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
    const distance = id.startsWith("layer:") || id.startsWith("rule:") ? 7 : 6.2;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    if (direction.lengthSq() < 0.1) direction.set(0.6, 0.5, 0.8).normalize();
    const position = point.clone().add(direction.multiplyScalar(distance));
    if (position.y < point.y + 2) position.y = point.y + 2.4;
    this.tween = {
      fromP: this.camera.position.clone(), toP: position,
      fromT: this.controls.target.clone(), toT: point,
      start: performance.now(), duration: 680,
    };
    this.built?.setSelected(id);
    this.selected = id;
    this.options.onFocus?.(id);
    this.forceRender();
  }

  resetCamera() {
    if (!this.built) return;
    const target = new THREE.Vector3(...this.built.defaultCamera.target);
    const position = new THREE.Vector3(...this.built.defaultCamera.position);
    this.tween = {
      fromP: this.camera.position.clone(), toP: position,
      fromT: this.controls.target.clone(), toT: target,
      start: performance.now(), duration: 560,
    };
    this.forceRender();
  }

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
    for (const link of this.built.links) {
      for (const child of link.group.children) if (child.userData.linkId) targets.push(child);
    }
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
    } else {
      const now = performance.now();
      if (now - (this.lastHoverAt || 0) > 120) {
        this.lastHoverAt = now;
        const result = this.pickAt(event.clientX, event.clientY);
        this.options.onHover?.(result?.type === "node" || result?.type === "link" ? result.id : null);
        this.canvas.style.cursor = result ? "pointer" : "grab";
      }
    }
  };
  private lastHoverAt = 0;

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
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height;
    } else {
      const span = 16;
      this.camera.left = -span * (width / height) / 2;
      this.camera.right = span * (width / height) / 2;
      this.camera.top = span / 2;
      this.camera.bottom = -span / 2;
    }
    this.camera.updateProjectionMatrix();
    this.forceRender();
  };

  private startLoop() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (!this.running || this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const interval = 1000 / this.targetFps;
      if (now - this.lastFrame < interval) return;
      const delta = Math.min(0.08, (now - this.lastFrame) / 1000);
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
      const eased = 1 - Math.pow(1 - progress, 3);
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, eased);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, eased);
      if (progress >= 1) this.tween = null;
    }
    this.controls.update();
    if (this.built && !this.paused) {
      for (const link of this.built.links) advanceLink(link, delta);
    }
    this.animateNodes(now);
    this.renderer.render(this.scene, this.camera);
    this.updateLabels(now);
    this.collectStats(now);
  }

  private animateNodes(now: number) {
    if (!this.built) return;
    for (const node of this.built.nodes) {
      if (node.status === "down") {
        const scale = 1 + Math.sin(now / 220) * 0.08;
        node.statusRing.scale.setScalar(scale);
      } else if (node.statusRing.scale.x !== 1) {
        node.statusRing.scale.setScalar(1);
      }
    }
  }

  private updateLabels(now: number) {
    if (!this.built || !this.labelsEnabled || this.labelMode === "none") return;
    if (now - this.lastLabelAt < 220) return;
    this.lastLabelAt = now;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const cameraPosition = this.camera.position;
    for (const node of this.built.nodes) {
      const sprite = node.labelSprite;
      if (!sprite) continue;
      if (this.labelMode === "auto" && node.id === this.selected) {
        sprite.visible = true;
      }
      const world = new THREE.Vector3();
      sprite.getWorldPosition(world);
      const distance = cameraPosition.distanceTo(world);
      const projected = world.clone().project(this.camera);
      const visible = projected.z > -1 && projected.z < 1
        && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05
        && distance < 30;
      if (!visible) { sprite.visible = false; continue; }
      const screenX = (projected.x * 0.5 + 0.5) * width;
      const screenY = (-projected.y * 0.5 + 0.5) * height;
      const box = { x: screenX - 62, y: screenY - 18, w: 124, h: 36 };
      const selected = node.id === this.selected;
      const overlaps = !selected && rects.some((rect) => !(box.x + box.w < rect.x || box.x > rect.x + rect.w || box.y + box.h < rect.y || box.y > rect.y + rect.h));
      if (this.labelMode === "auto" && overlaps) { sprite.visible = false; continue; }
      sprite.visible = true;
      if (!selected) rects.push(box);
    }
  }

  private collectStats(now: number) {
    if (now - this.lastStatsAt < 1000) return;
    const elapsed = Math.max(1, now - this.lastStatsAt);
    const fps = Math.round((this.frameCount * 1000) / elapsed);
    this.frameCount = 0;
    this.lastStatsAt = now;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 5) this.fpsSamples.shift();
    const average = this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length;
    this.options.onStats?.({
      fps: Math.round(average),
      quality: this.effectiveQuality,
      drawCalls: this.renderer.info.render.calls,
      particles: this.renderer.info.render.points,
    });
    if (this.quality === "auto" && now - this.autoCheckAt > 6000) {
      this.autoCheckAt = now;
      if (average < this.targetFps * 0.7 && this.effectiveQuality !== "eco") {
        this.effectiveQuality = this.effectiveQuality === "ultra" ? "balanced" : "eco";
        this.applyQuality();
      }
    }
  }
  private frameCount = 0;

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
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
