"use client";

import { useEffect } from "react";
import { hasNativeBridge, syncNativeTheme, subscribeNativeEvent } from "@/lib/native-bridge";
import { installLiteRuntime, getLiteRuntime, subscribeLiteRuntime } from "@/lib/lite-runtime";

const MOTION_KEY = "heika-motion-v2";

/**
 * 把 Lite 性能模式落到现有动效体系上。
 *
 * 复用 lib/motion.ts 已经存在的 data-motion-* 契约，不新造一套动效开关，
 * 这样 MotionSettings 面板、页面过渡与服务端渲染的首屏脚本仍然一致。
 */
function applyMotionTrait(mode: "ultra-light" | "balanced" | "full" | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!mode) {
    // 退出 Lite：交还给用户自己的动效设置。
    try {
      const raw = window.localStorage.getItem(MOTION_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      const restored = ["enhanced", "standard", "lite", "reduce"].includes(saved.mode) ? saved.mode : "standard";
      root.dataset.motionMode = restored;
      root.dataset.motionGlass = saved.glass === false ? "off" : "on";
    } catch {
      root.dataset.motionMode = "standard";
    }
    return;
  }

  if (mode === "ultra-light") {
    // 极致轻量：关闭玻璃与高阶动效，但不影响任何业务功能。
    root.dataset.motionMode = "lite";
    root.dataset.motionGlass = "off";
    root.dataset.motionRefresh = "standard";
    return;
  }
  if (mode === "balanced") {
    root.dataset.motionGlass = "on";
    return;
  }
  root.dataset.motionGlass = "on";
}

/** 首次进入或原生上报深浅色变化时，把系统栏配色与网页对齐。 */
function syncThemeWithNative() {
  if (typeof document === "undefined") return;
  const dark = document.documentElement.dataset.theme !== "light";
  void syncNativeTheme(dark);
}

export default function LiteRuntimeBridge() {
  useEffect(() => {
    if (!hasNativeBridge()) return;

    let disposed = false;

    void installLiteRuntime().then((runtime) => {
      if (disposed) return;
      applyMotionTrait(runtime ? runtime.mode : null);
      syncThemeWithNative();
    });

    const unsubscribeRuntime = subscribeLiteRuntime((runtime) => {
      applyMotionTrait(runtime ? runtime.mode : null);
    });

    const unsubscribeTheme = subscribeNativeEvent("theme.changed", () => {
      syncThemeWithNative();
    });

    // 网页内切换主题后，系统栏需要跟着变，否则会出现浅色页面配深色状态栏。
    const observer = new MutationObserver(() => syncThemeWithNative());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // 窗口尺寸变化只更新运行环境分级，不重载页面。
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (getLiteRuntime()) void installLiteRuntime();
      }, 180);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      unsubscribeRuntime();
      unsubscribeTheme();
      observer.disconnect();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
