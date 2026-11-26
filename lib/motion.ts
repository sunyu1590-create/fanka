"use client";

/**
 * HEIKA Motion 2.0 — 网页端全局动效系统。
 *
 * 职责边界：
 * - 只负责动效的「参数、模式、速度、生命周期、降级」；不碰业务逻辑、不碰 UI 结构。
 * - 所有页面/组件从这里取时长与曲线，不再各自硬编码；已有成熟动画（共享元素、翻卡）
 *   继续沿用其专属参数，只通过 motionScale() 统一受速度档位与减少动态效果影响。
 * - 与玻璃材质解耦：这里不计算、不修改 backdrop-filter；玻璃由 motion.css 的令牌控制。
 *
 * 持久化与 APP 端保持一致：enhanced / standard / lite / reduce 四档模式，
 * fast / standard / calm 三档速度，独立玻璃开关。
 */

export type MotionMode = "enhanced" | "standard" | "lite" | "reduce";
export type MotionSpeed = "fast" | "standard" | "calm";

export type MotionSettings = {
  mode: MotionMode;
  speed: MotionSpeed;
  glass: boolean;
  highRefresh: boolean;
};

export const DEFAULT_MOTION: MotionSettings = {
  mode: "standard",
  speed: "standard",
  glass: true,
  highRefresh: false,
};

const KEY = "heika-motion-v2";

export const MOTION_MODES: ReadonlyArray<{ value: MotionMode; label: string; description: string }> = [
  { value: "enhanced", label: "增强", description: "完整连续转场与翻卡动效，仍受性能约束" },
  { value: "standard", label: "标准", description: "视觉与性能平衡，默认推荐" },
  { value: "lite", label: "精简", description: "减少装饰动画与实时模糊，保留核心反馈" },
  { value: "reduce", label: "减少动态效果", description: "遵循无障碍规范，去除大幅位移与旋转" },
];

export const MOTION_SPEEDS: ReadonlyArray<{ value: MotionSpeed; label: string; scale: number }> = [
  { value: "fast", label: "快速", scale: 0.78 },
  { value: "standard", label: "标准", scale: 1 },
  { value: "calm", label: "舒缓", scale: 1.28 },
];

/** 基准时长，与 motion.css 的 --motion-* 一一对应；单位毫秒。 */
export const DURATION = {
  press: 100,
  icon: 150,
  toggle: 160,
  tag: 200,
  local: 210,
  page: 280,
  menu: 300,
  theme: 320,
  card: 400,
  flip: 640,
} as const;

export type DurationName = keyof typeof DURATION;

/** 统一非线性曲线；共享元素与翻卡保留其专属曲线，不强制统一。 */
export const EASE = {
  standard: "cubic-bezier(.22,.72,.18,1)",
  inOut: "cubic-bezier(.42,0,.58,1)",
  open: "cubic-bezier(.20,.75,.25,1)",
  close: "cubic-bezier(.32,.72,.20,1)",
  expand: "cubic-bezier(.25,.80,.25,1)",
  spatial: "cubic-bezier(.22,.78,.18,1)",
} as const;

/** 用户是否请求减少动态效果：显式设置优先于系统设置。 */
export function prefersReducedMotion(settings: MotionSettings = readMotionSettings()): boolean {
  if (typeof window === "undefined") return false;
  if (settings.mode === "reduce") return true;
  if (settings.mode !== "standard" && settings.mode !== "enhanced") return false;
  // 未显式选择减少时尊重系统无障碍设置。
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function motionScale(settings: MotionSettings = readMotionSettings()): number {
  const speed = MOTION_SPEEDS.find((item) => item.value === settings.speed)?.scale ?? 1;
  if (settings.mode === "reduce") return Math.min(speed, 0.35);
  if (settings.mode === "lite") return Math.min(speed, 0.85);
  return speed;
}

/** 取某个标准动作在用户设置下的实际时长。 */
export function motionDuration(name: DurationName, settings: MotionSettings = readMotionSettings()): number {
  return Math.max(60, Math.round(DURATION[name] * motionScale(settings)));
}

export function isMotionMode(value: unknown): value is MotionMode {
  return value === "enhanced" || value === "standard" || value === "lite" || value === "reduce";
}
export function isMotionSpeed(value: unknown): value is MotionSpeed {
  return value === "fast" || value === "standard" || value === "calm";
}

export function readMotionSettings(): MotionSettings {
  if (typeof window === "undefined") return DEFAULT_MOTION;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_MOTION;
    const parsed = JSON.parse(raw) as Partial<MotionSettings>;
    return {
      mode: isMotionMode(parsed.mode) ? parsed.mode : DEFAULT_MOTION.mode,
      speed: isMotionSpeed(parsed.speed) ? parsed.speed : DEFAULT_MOTION.speed,
      glass: typeof parsed.glass === "boolean" ? parsed.glass : DEFAULT_MOTION.glass,
      highRefresh: typeof parsed.highRefresh === "boolean" ? parsed.highRefresh : DEFAULT_MOTION.highRefresh,
    };
  } catch {
    return DEFAULT_MOTION;
  }
}

/**
 * 把设置写进 localStorage 并同步到 <html> 的 data 属性。
 * CSS 只通过属性选择器降级，不读取 JS 变量，避免首屏闪烁。
 */
export function applyMotionSettings(settings: MotionSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.motionMode = settings.mode;
  root.dataset.motionSpeed = settings.speed;
  root.dataset.motionGlass = settings.glass ? "on" : "off";
  root.dataset.motionRefresh = settings.highRefresh ? "high" : "standard";
  root.style.setProperty("--motion-scale", String(motionScale(settings)));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式下不持久化，但本次会话仍然生效。
  }
  window.dispatchEvent(new CustomEvent<MotionSettings>("heika:motion-settings", { detail: settings }));
}

export function resetMotionSettings(): MotionSettings {
  applyMotionSettings(DEFAULT_MOTION);
  return DEFAULT_MOTION;
}

/** 首屏同步应用：必须在 React 挂载前调用，避免动效设置晚一帧生效。 */
export function applyStoredMotionSettings(): MotionSettings {
  const settings = readMotionSettings();
  applyMotionSettings(settings);
  return settings;
}

/**
 * 动画生命周期管理：同名动画可打断，取消后从当前状态平滑过渡到新目标，
 * 不等待旧动画结束、不重播。页面销毁时通过 dispose() 统一释放。
 */
export type MotionHandle = {
  id: string;
  cancel: () => void;
  finished: Promise<boolean>;
};

class MotionController {
  private active = new Map<string, { handle: MotionHandle; animation: Animation }>();
  private seq = 0;

  /**
   * 启动一个可打断动画。同名 key 的旧动画会先被 cancel（保留其当前视觉状态），
   * 新动画从该状态继续，而不是从初始值重播。
   */
  play(key: string, element: Element, frames: Keyframe[], options: KeyframeAnimationOptions): MotionHandle {
    this.cancel(key);
    const settings = readMotionSettings();
    const scale = motionScale(settings);
    const baseDuration = typeof options.duration === "number" ? options.duration : DURATION.local;
    const duration = Math.max(60, Math.round(baseDuration * scale));
    const anim = element.animate(frames, { ...options, duration });
    const id = `motion-${++this.seq}`;
    let resolve: (value: boolean) => void = () => {};
    const finished = new Promise<boolean>((r) => { resolve = r; });
    const handle: MotionHandle = { id, cancel: () => this.cancel(key), finished };
    this.active.set(key, { handle, animation: anim });
    void anim.finished.then(() => { resolve(true); if (this.active.get(key)?.animation === anim) this.active.delete(key); })
      .catch(() => { resolve(false); });
    return handle;
  }

  cancel(key: string): void {
    const entry = this.active.get(key);
    if (!entry) return;
    entry.animation.cancel();
    this.active.delete(key);
  }

  cancelAll(): void {
    for (const key of [...this.active.keys()]) this.cancel(key);
  }

  dispose(): void {
    this.cancelAll();
  }
}

export const motionController = new MotionController();

/**
 * 高频组件共用的「短暂模糊反馈」：只改变自身的轻量滤镜，不触发全屏模糊，
 * 动画结束自动移除，避免残留图层。精简/减少模式下直接跳过。
 */
export function pulseBlur(element: HTMLElement | null, radius = 6): void {
  if (!element) return;
  const settings = readMotionSettings();
  if (!settings.glass || settings.mode === "lite" || settings.mode === "reduce") return;
  motionController.play(
    `blur:${element.dataset.motionBlurKey ?? element.id ?? Math.random()}`,
    element,
    [{ filter: `blur(0px)` }, { filter: `blur(${radius}px)` }, { filter: `blur(0px)` }],
    { duration: DURATION.icon, easing: EASE.inOut },
  );
}
