"use client";

/**
 * 管理员实时数据管理器（前端唯一实例）。
 *
 * - 每 1 秒拉取一次 /api/v1/admin/realtime，所有后台页面共享同一份快照；
 * - 标签页不可见时暂停，恢复可见时立即补一次；
 * - 上一次请求未完成不叠加新请求；失败走指数退避 + 抖动，避免断网时轰炸服务器；
 * - 组件只订阅，不自己起计时器，切换页面不会重建连接。
 */

import { useSyncExternalStore } from "react";
import type { RealtimeSnapshot } from "@/lib/server/realtime";

export type LiveStatus = "idle" | "live" | "reconnecting" | "offline";

type State = {
  snapshot: RealtimeSnapshot | null;
  status: LiveStatus;
  lastUpdated: number | null;
  error: string;
  failures: number;
  requests: number;
};

const INITIAL: State = { snapshot: null, status: "idle", lastUpdated: null, error: "", failures: 0, requests: 0 };

let state: State = INITIAL;
const listeners = new Set<() => void>();
let timer: number | null = null;
let started = 0;
let inflight = false;
let authLost = false;

function emit() {
  for (const listener of listeners) listener();
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

async function readSessionToken(): Promise<string | null> {
  try {
    const { browserDb } = await import("@/lib/browser-db");
    const db = await browserDb();
    const { data } = await db.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

function schedule(delay: number) {
  if (timer != null) window.clearTimeout(timer);
  if (!started) return;
  timer = window.setTimeout(() => { void tick(); }, delay);
}

async function tick() {
  if (!started) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    schedule(1000);
    return;
  }
  if (inflight) { schedule(500); return; }

  inflight = true;
  try {
    const token = await readSessionToken();
    if (!token) {
      authLost = true;
      set({ status: "offline", error: "登录状态已失效", failures: state.failures + 1 });
      schedule(10_000);
      return;
    }
    const response = await fetch("/api/v1/admin/realtime", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      authLost = true;
      set({ status: "offline", error: response.status === 401 ? "登录状态已失效" : "管理员权限已被取消", failures: state.failures + 1 });
      schedule(10_000);
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { data?: RealtimeSnapshot };
    if (!payload.data) throw new Error("数据格式异常");
    authLost = false;
    set({ snapshot: payload.data, status: "live", lastUpdated: Date.now(), error: "", failures: 0, requests: state.requests + 1 });
    schedule(1000);
  } catch (error) {
    const failures = state.failures + 1;
    const backoff = Math.min(15_000, 1000 * 2 ** Math.min(4, failures - 1));
    const jitter = Math.round(Math.random() * 300);
    set({ status: failures >= 3 ? "offline" : "reconnecting", failures, error: error instanceof Error ? error.message : "实时连接中断" });
    schedule(backoff + jitter);
  } finally {
    inflight = false;
  }
}

function onVisibility() {
  if (typeof document === "undefined" || !started) return;
  if (document.visibilityState === "visible") {
    if (timer != null) window.clearTimeout(timer);
    void tick();
  }
}

/** 进入后台时调用；可重复调用，只有第一次真正启动。 */
export function startRealtime() {
  started += 1;
  if (started > 1) return;
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  void tick();
}

/** 离开后台时调用；引用计数归零后停止所有高频请求。 */
export function stopRealtime() {
  started = Math.max(0, started - 1);
  if (started > 0) return;
  if (timer != null) window.clearTimeout(timer);
  timer = null;
  inflight = false;
  authLost = false;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  state = INITIAL;
  emit();
}

export function getRealtimeState() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useRealtime(): State {
  return useSyncExternalStore(subscribe, getRealtimeState, () => INITIAL);
}

/** 连接状态文案与颜色：连接中断固定显示琥珀，连续失败显示红色，不假装绿色。 */
export function liveBadge(state: State): { text: string; tone: "ok" | "warn" | "bad" } {
  if (state.status === "offline") return { text: authLost ? "连接中断" : "连接异常", tone: "bad" };
  if (state.status === "reconnecting") return { text: "正在重连", tone: "warn" };
  if (state.status === "live") {
    const age = state.lastUpdated ? Date.now() - state.lastUpdated : Number.POSITIVE_INFINITY;
    if (age > 6000) return { text: "数据延迟", tone: "warn" };
    return { text: "实时", tone: "ok" };
  }
  return { text: "连接中", tone: "warn" };
}
