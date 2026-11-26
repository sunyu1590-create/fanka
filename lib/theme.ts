/**
 * 主题解析与切换的唯一入口。
 *
 * 之前深浅色有三套写入逻辑（首屏内联脚本、Community 的 effect、装扮中心的观察器），
 * 各自解析「跟随系统」，导致两个真实问题：
 *   1. 内联脚本把 "system" 原样写进 data-theme，而 CSS 只有 light / dark 两套令牌，
 *      "system" 匹配不到任何一组，回落到 :root 的深色 —— 浅色系统上首屏先黑一下再变白；
 *   2. 切换瞬间没有任何颜色过渡，整页硬切。
 *
 * 这里统一成：data-theme 只存解析后的 light / dark（CSS 一定能命中），
 * 原始选择另存 data-theme-mode 与 localStorage，切换时给 html 挂 320ms 的过渡窗口。
 */

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "heika-theme";
const SWITCH_CLASS = "theme-switching";
/** 比过渡本身（260ms）略长，保证最后一帧也走完过渡再撤掉全局规则。 */
/** 过渡窗口基准：实际时长会按动效设置里的速度档位缩放，reduce 模式直接取最小值。 */
const SWITCH_WINDOW = 320;

/** 读取当前主题过渡窗口（毫秒）。theme 与 motion 解耦：只在这里取一次设置值。 */
function switchWindow(): number {
  if (typeof window === "undefined") return SWITCH_WINDOW;
  try {
    const raw = window.localStorage.getItem("heika-motion-v2");
    const saved = raw ? (JSON.parse(raw) as { mode?: string; speed?: string }) : {};
    const scale = saved.speed === "fast" ? 0.78 : saved.speed === "calm" ? 1.28 : 1;
    const modeCap = saved.mode === "reduce" ? 0.12 : saved.mode === "lite" ? 0.85 : 1;
    return Math.max(40, Math.round(SWITCH_WINDOW * scale * modeCap));
  } catch {
    return SWITCH_WINDOW;
  }
}

const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: "#101115",
  light: "#F6F5F1",
};

let switchTimer: number | null = null;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

export function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 会抛错，按默认深色处理即可。
  }
  return "dark";
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? systemTheme() : mode;
}

function syncThemeColor(theme: ResolvedTheme) {
  const head = document.head;
  if (!head) return;
  let meta = head.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * 应用主题。animate=false 用于首屏同步，避免刚打开页面就播一次颜色渐变。
 * 只有真正发生明暗变化时才开过渡窗口，重复点同一个选项不会触发。
 */
export function applyThemeMode(mode: ThemeMode, options: { animate?: boolean } = {}): ResolvedTheme {
  if (typeof document === "undefined") return "dark";
  const root = document.documentElement;
  const next = resolveTheme(mode);

  if (options.animate !== false && root.dataset.theme !== next) {
    root.classList.add(SWITCH_CLASS);
    if (switchTimer !== null) window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => {
      // 切走窗口后必须清掉，否则会长期保留一份全局 transition，影响后续组件动画。
      root.classList.remove(SWITCH_CLASS);
      switchTimer = null;
    }, switchWindow());
  }

  root.dataset.theme = next;
  root.dataset.themeMode = mode;
  syncThemeColor(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 存不进去也不影响本次渲染。
  }
  return next;
}

/** 系统外观变化时只重算，不写回 localStorage（用户的选择仍是 system）。 */
export function followSystemTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "dark";
  const mode = isThemeMode(document.documentElement.dataset.themeMode)
    ? (document.documentElement.dataset.themeMode as ThemeMode)
    : readThemeMode();
  if (mode !== "system") return resolveTheme(mode);
  return applyThemeMode("system");
}
