"use client";

import { useMemo } from "react";
import type { NexusSnapshot } from "@/lib/nexus/types";
import type { PickResult } from "@/lib/nexus/engine";

const POSITIONS: Record<string, [number, number]> = {
  "client-web": [150, 90], "client-app": [750, 90], edge: [450, 150], app: [450, 220],
  rest: [300, 300], auth: [360, 380], storage: [560, 300], realtime: [640, 380],
  db: [450, 470], "ai-worker": [680, 250], "ai-provider": [810, 190], metrics: [210, 430],
};

const COLORS: Record<string, string> = {
  healthy: "#4fb9c8", degraded: "#d3a24a", down: "#d6605f", unknown: "#7d8a90", offline: "#7d8a90",
};

export default function NexusFallback2D({ snapshot, onPick }: { snapshot: NexusSnapshot; onPick: (result: PickResult) => void }) {
  const links = useMemo(() => snapshot.links.filter((link) => POSITIONS[link.from] && POSITIONS[link.to]), [snapshot.links]);
  return (
    <div className="nx-fallback">
      <div className="nx-fallback__badge">二维拓扑降级模式 · 真实监控数据与交互保持可用</div>
      <svg viewBox="0 0 900 560" role="img" aria-label="HEIKA Nexus 二维服务拓扑">
        <defs>
          <pattern id="nx-grid" width="45" height="45" patternUnits="userSpaceOnUse">
            <path d="M 45 0 L 0 0 0 45" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="900" height="560" fill="url(#nx-grid)" />
        {links.map((link) => {
          const from = POSITIONS[link.from];
          const to = POSITIONS[link.to];
          const active = link.measured && (link.rate || 0) > 0;
          return (
            <g key={link.id} className={active ? "nx2-link is-live" : "nx2-link"}>
              <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={link.measured ? "var(--nx-2d-link)" : "var(--nx-2d-link-muted)"} strokeWidth={Math.min(4, 1 + Math.log10(1 + (link.rate || 0)) * 0.8)} strokeDasharray={link.measured ? "6 6" : "2 7"} strokeOpacity={link.measured ? 0.55 : 0.28} />
              {active ? <circle r="3" fill="var(--nx-2d-flow)"><animateMotion dur={`${Math.max(1.2, 6 - Math.log10(1 + (link.rate || 0)))}s`} repeatCount="indefinite" path={`M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`} /></circle> : null}
            </g>
          );
        })}
        {snapshot.nodes.map((node) => {
          const position = POSITIONS[node.id];
          if (!position) return null;
          return (
            <g key={node.id} role="button" tabIndex={0} className="nx2-node" onClick={() => onPick({ type: "node", id: node.id })} onKeyDown={(event) => { if (event.key === "Enter") onPick({ type: "node", id: node.id }); }}>
              <circle cx={position[0]} cy={position[1]} r="20" fill="var(--nx-node-fill)" stroke={COLORS[node.status] || COLORS.unknown} strokeWidth="2" />
              <circle cx={position[0]} cy={position[1]} r={node.status === "down" ? 28 : 25} fill="none" stroke={COLORS[node.status] || COLORS.unknown} strokeOpacity="0.24" />
              <text x={position[0]} y={position[1] + 4} textAnchor="middle" className="nx2-node__mark">{node.label.slice(0, 2)}</text>
              <text x={position[0]} y={position[1] + 40} textAnchor="middle" className="nx2-node__label">{node.label}</text>
              <text x={position[0]} y={position[1] + 55} textAnchor="middle" className="nx2-node__meta">{node.metrics[0]?.value == null ? "无数据" : `${node.metrics[0].label} ${node.metrics[0].value}`}</text>
            </g>
          );
        })}
      </svg>
      <p className="nx-fallback__note">未检测到可用的 WebGL，或图形上下文已丢失。二维视图仍由同一份真实快照驱动，可点击节点查看详情；三维资源不会加载。</p>
    </div>
  );
}
