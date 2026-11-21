"use client";

import { useSyncExternalStore } from "react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import {
  DEFAULT_BOTTOM_BAR,
  DEFAULT_CARD,
  normalizeBottomBar,
  normalizeCard,
  paletteFor,
  withAlpha,
  type BottomBarConfig,
  type CardConfig,
  type DecorConfig,
} from "./types";

export type DecorPayload = {
  signedIn: boolean;
  bottomBar: BottomBarConfig;
  card: CardConfig;
  bottomBarThemeId: string | null;
  cardThemeId: string | null;
  bottomBarTheme: { id: string; title: string; slug: string | null; status: string } | null;
  cardTheme: { id: string; title: string; slug: string | null; status: string } | null;
  updatedAt: string | null;
};

type DecorState = {
  loaded: boolean;
  signedIn: boolean;
  decor: DecorConfig;
  bottomBarThemeId: string | null;
  cardThemeId: string | null;
  bottomBarThemeTitle: string | null;
  cardThemeTitle: string | null;
  error: string;
};

const EMPTY: DecorState = {
  loaded: false,
  signedIn: false,
  decor: { version: 1, bottomBar: DEFAULT_BOTTOM_BAR, card: DEFAULT_CARD },
  bottomBarThemeId: null,
  cardThemeId: null,
  bottomBarThemeTitle: null,
  cardThemeTitle: null,
  error: "",
};

let state: DecorState = EMPTY;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Partial<DecorState>) {
  state = { ...state, ...next };
  applyDecorToDocument(state.decor);
  emit();
}

export function decorSnapshot() {
  return state;
}

export function subscribeDecor(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDecor() {
  return useSyncExternalStore(subscribeDecor, decorSnapshot, decorSnapshot);
}

export function toPayload(payload: DecorPayload): DecorState {
  return {
    loaded: true,
    signedIn: payload.signedIn,
    decor: { version: 1, bottomBar: normalizeBottomBar(payload.bottomBar), card: normalizeCard(payload.card) },
    bottomBarThemeId: payload.bottomBarThemeId,
    cardThemeId: payload.cardThemeId,
    bottomBarThemeTitle: payload.bottomBarTheme?.title ?? null,
    cardThemeTitle: payload.cardTheme?.title ?? null,
    error: "",
  };
}

/** 读取账号装扮。未登录时退回默认，不会把上一位用户的装扮留在界面上。 */
export async function loadDecor(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const response = await cloudFetch("/api/v1/decor/settings", { cache: "no-store" });
      if (!response.ok) throw new Error("装扮读取失败");
      const result = await response.json();
      if (!result?.data) throw new Error("装扮读取失败");
      state = toPayload(result.data as DecorPayload);
      applyDecorToDocument(state.decor);
      emit();
    } catch (error) {
      // 同步失败时保留已有装扮，不清空界面。
      setState({ loaded: true, error: error instanceof Error ? error.message : "装扮读取失败" });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function resetDecor(): void {
  state = { ...EMPTY, loaded: true };
  applyDecorToDocument(state.decor);
  emit();
}

export async function saveDecor(patch: {
  bottomBar?: BottomBarConfig | null;
  card?: CardConfig | null;
  bottomBarThemeId?: string | null;
  cardThemeId?: string | null;
}): Promise<DecorState> {
  const data = await cloudRequest("/api/v1/decor/settings", patch, "PATCH") as DecorPayload | null;
  if (!data) throw new Error("登录后才能同步装扮");
  state = toPayload(data);
  applyDecorToDocument(state.decor);
  emit();
  window.dispatchEvent(new CustomEvent("heika-decor-updated"));
  return state;
}

const mode = (): "dark" | "light" =>
  typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";

/**
 * 把装扮写成 CSS 变量。透明度只作用于背景层，
 * 图标与文字始终使用各自的实色，避免「整块变淡」。
 */
export function applyDecorToDocument(decor: DecorConfig): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = mode();
  const bar = paletteFor(decor.bottomBar, dark);
  const card = paletteFor(decor.card, dark);

  const set = (name: string, value: string) => root.style.setProperty(name, value);

  set("--decor-bar-bg", withAlpha(bar.bg, bar.bgOpacity));
  set("--decor-bar-bg-solid", bar.bg);
  set("--decor-bar-border", withAlpha(bar.border, bar.borderOpacity));
  set("--decor-bar-icon", bar.icon);
  set("--decor-bar-active-icon", bar.activeIcon);
  set("--decor-bar-label", bar.label);
  set("--decor-bar-active-label", bar.activeLabel);
  set("--decor-bar-pill", withAlpha(bar.activePill, bar.activePillOpacity));
  set("--decor-bar-pill-solid", bar.activePill);
  set("--decor-publish-bg", decor.bottomBar.publish.bg);
  set("--decor-publish-icon", decor.bottomBar.publish.icon);

  set("--decor-card-back-bg", card.backBg);
  set("--decor-card-back-image", card.backImage ? `url("${card.backImage}")` : "none");
  set("--decor-card-back-border", card.backBorder);
  set("--decor-card-number", card.numberColor);
  set("--decor-card-hint", card.hintColor);
  set("--decor-card-action-bg", card.actionBg);
  set("--decor-card-action-text", card.actionText);
  set("--decor-card-content-bg", card.contentBg);
  set("--decor-card-content-border", card.contentBorder);
  set("--decor-card-content-image", card.contentImage ? `url("${card.contentImage}")` : "none");
  set("--decor-card-title", card.titleColor);
  set("--decor-card-body", card.bodyColor);
  set("--decor-card-chip-bg", card.chipBg);
  set("--decor-card-chip-border", card.chipBorder);
  set("--decor-card-accent", card.accent);

  root.dataset.decorBar = "custom";
  root.dataset.decorCard = "custom";
  root.dataset.decorCardTexture = card.texture;
  root.dataset.decorCardPattern = card.pattern;
}

/** 深浅色切换后重算（透明度与主题色不同步会导致对比度失真）。 */
export function installDecorThemeSync(): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(() => applyDecorToDocument(state.decor));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
