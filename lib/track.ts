"use client";

import { cloudFetch } from "./cloud";

/** 行为上报统一走这里：失败静默，绝不阻塞阅读或页面交互。 */
export async function trackImpression(
  items: { type: "post" | "series"; id: string }[],
  surface: string,
  pool = "",
) {
  if (!items.length) return;
  try {
    const response = await cloudFetch("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "impression", surface, pool, items: items.slice(0, 30) }),
      keepalive: true,
    });
    await response.json().catch(() => null);
  } catch {
    /* 忽略 */
  }
}

export async function trackRead(input: {
  postId: string;
  seriesId?: string | null;
  percent: number;
  seconds: number;
  surface?: string;
}) {
  try {
    await cloudFetch("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "read",
        postId: input.postId,
        seriesId: input.seriesId || undefined,
        percent: Math.round(input.percent),
        seconds: Math.round(input.seconds),
        surface: input.surface || "web",
      }),
      keepalive: true,
    });
  } catch {
    /* 忽略 */
  }
}

export async function trackSearchClick(term: string, entityType: string, entityId?: string | null) {
  if (!term) return;
  try {
    await cloudFetch("/api/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "search_click", term, entityType, entityId: entityId || undefined }),
      keepalive: true,
    });
  } catch {
    /* 忽略 */
  }
}
