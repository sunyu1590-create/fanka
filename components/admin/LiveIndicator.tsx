"use client";

import { useEffect, useState } from "react";
import { liveBadge, useRealtime } from "@/lib/admin-live";

function clock(value: number | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * 顶部紧凑实时状态：● 实时 / 正在重连 / 连接中断，附真实最后更新时间。
 * 颜色只表达连接状态，文字始终同步，不靠颜色单独传递信息。
 */
export default function LiveIndicator({ compact = false }: { compact?: boolean }) {  const state = useRealtime();
  const badge = liveBadge(state);
  const [, force] = useState(0);

  // 数据延迟判定依赖当前时间，每 2 秒重算一次显示（不触发网络请求）。
  useEffect(() => {
    const timer = window.setInterval(() => force((value) => value + 1), 2000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className={`ab-live tone-${badge.tone}`} title={state.error || "管理员实时数据通道"}>
      <i className="ab-dot" aria-hidden="true" />
      <b>{badge.text}</b>
      {compact ? null :       <small>{clock(state.lastUpdated)}</small>}
    </span>
  );
}

/** 导航角标：优先用实时快照的未处理数量，实时通道尚未就绪时回退到页面加载值。 */
export function LiveCount({ of, fallback = 0 }: { of: "review" | "report" | "alerts" | "tasksRunning" | "uploadFailed"; fallback?: number }) {
  const state = useRealtime();
  const value = state.snapshot?.counts?.[of] ?? fallback;
  if (!value) return null;
  return <span className="ab-side-item__count">{value}</span>;
}
