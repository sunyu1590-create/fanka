/**
 * HEIKA Lite 网页端运行环境。
 *
 * 设计目标：
 * 1. 只有一个识别入口。任何页面都不允许自己判断 UA 或再写一套模式分支。
 * 2. 只在 Lite 容器内生效。普通浏览器、标准版 APP 下所有 data-lite-* 属性都不存在，
 *    因此现有样式与功能零影响。
 * 3. 性能模式落到 <html data-lite-mode> 与 data-lite-* 细化开关，由 CSS 消费；
 *    组件层只读 liteRuntime.mode，不直接改 DOM。
 */
import { getNativeEnvironment, hasNativeBridge, syncNativeTheme, type NativePerformanceMode } from "./native-bridge";

/** 三档正式运行模式，auto 只作为用户偏好存在，生效值永远解析为具体档位。 */
export type LiteMode = "ultra-light" | "balanced" | "full";
export type LiteWindowClass = "compact" | "medium" | "expanded";

export type LiteRuntime = {
  active: true;
  mode: LiteMode;
  preference: NativePerformanceMode;
  windowClass: LiteWindowClass;
  /** 允许高斯模糊等玻璃材质 */
  glass: boolean;
  /** 允许页面过渡与弹性动画 */
  motion: boolean;
  /** 允许视频自动播放 */
  videoAutoplay: boolean;
  /** 允许预加载非首屏资源 */
  preload: boolean;
  /** 图片请求的目标宽度倍数，1 表示按 CSS 像素请求 */
  imageScale: number;
};

type Listener = (runtime: LiteRuntime | null) => void;

let current: LiteRuntime | null = null;
let installed = false;
const listeners = new Set<Listener>();

function modeToTraits(mode: LiteMode): Pick<LiteRuntime, "glass" | "motion" | "videoAutoplay" | "preload" | "imageScale"> {
  switch (mode) {
    case "ultra-light":
      return { glass: false, motion: false, videoAutoplay: false, preload: false, imageScale: 1 };
    case "balanced":
      return { glass: true, motion: true, videoAutoplay: false, preload: false, imageScale: 1.5 };
    case "full":
    default:
      return { glass: true, motion: true, videoAutoplay: false, preload: true, imageScale: 2 };
  }
}

/** 视口宽度分级：与 Android 侧 dp 分级对应，但按真实 CSS 视口计算。 */
export function resolveWindowClass(width: number): LiteWindowClass {
  if (width < 768) return "compact";
  if (width < 1120) return "medium";
  return "expanded";
}

function applyToDocument(runtime: LiteRuntime | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!runtime) {
    delete root.dataset.lite;
    delete root.dataset.liteMode;
    delete root.dataset.liteWindow;
    delete root.dataset.liteGlass;
    delete root.dataset.liteMotion;
    delete root.dataset.liteAutoplay;
    root.style.removeProperty("--lite-image-scale");
    return;
  }
  root.dataset.lite = "true";
  root.dataset.liteMode = runtime.mode;
  root.dataset.liteWindow = runtime.windowClass;
  root.dataset.liteGlass = runtime.glass ? "on" : "off";
  root.dataset.liteMotion = runtime.motion ? "on" : "off";
  root.dataset.liteAutoplay = runtime.videoAutoplay ? "on" : "off";
  root.style.setProperty("--lite-image-scale", String(runtime.imageScale));
}

function notify() {
  for (const listener of listeners) {
    try {
      listener(current);
    } catch {
      // 单个订阅者异常不能影响其他订阅者。
    }
  }
}

/** 读取当前 Lite 运行环境；不是 Lite 容器时返回 null。 */
export function getLiteRuntime(): LiteRuntime | null {
  return current;
}

export function subscribeLiteRuntime(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 安装运行环境。重复调用只刷新状态，不会重复注册监听。
 * 在非 Lite 容器内调用是安全的空操作。
 */
export async function installLiteRuntime(): Promise<LiteRuntime | null> {
  if (typeof window === "undefined") return null;
  const env = await getNativeEnvironment();
  if (!env) {
    current = null;
    applyToDocument(null);
    notify();
    return null;
  }

  const mode: LiteMode = env.mode === "auto" ? "balanced" : env.mode;
  const windowClass = resolveWindowClass(window.innerWidth);
  const runtime: LiteRuntime = {
    active: true,
    mode,
    preference: env.modePreference,
    windowClass,
    ...modeToTraits(mode),
  };
  current = runtime;
  applyToDocument(runtime);

  if (!installed && hasNativeBridge()) {
    installed = true;
    // 原生在窗口尺寸、性能模式、网络与生命周期变化时推事件，这里统一刷新。
    const { subscribeNativeEvent } = await import("./native-bridge");
    subscribeNativeEvent("window.change", () => void refreshLiteRuntime());
    subscribeNativeEvent("performance.changed", () => void refreshLiteRuntime());
    subscribeNativeEvent("performance.degraded", () => void refreshLiteRuntime());
  }

  notify();
  return runtime;
}

export async function refreshLiteRuntime(): Promise<LiteRuntime | null> {
  return installLiteRuntime();
}

/** 用户在设置页切换性能模式：先写原生，原生确认后再刷新本地环境。 */
export async function changeLiteMode(mode: NativePerformanceMode): Promise<boolean> {
  const { setNativePerformanceMode } = await import("./native-bridge");
  const accepted = await setNativePerformanceMode(mode);
  if (accepted) await refreshLiteRuntime();
  return accepted;
}
