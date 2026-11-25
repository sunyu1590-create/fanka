"use client";

import { useMemo, useRef, useState } from "react";
import { fmtBytes, fmtNum } from "./AdminUIKit";

export type ConsolePoint = { t: number; v: number | null };

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { left: 52, right: 12, top: 12, bottom: 22 };

function defaultFormat(value: number, axis: "percent" | "bytes" | "count", unit: string) {
  if (axis === "bytes") return `${fmtBytes(value)}/s`;
  if (axis === "percent") return `${Math.round(value * 10) / 10}%`;
  return `${fmtNum(Math.round(value))}${unit ? ` ${unit}` : ""}`;
}

/**
 * 控制中心统一趋势图：
 * - 固定 viewBox + 百分比宽度，容器高度固定，数据更新不引起布局位移；
 * - 相邻点间隔超过 1.8 个桶宽时断开折线，不把采集缺口画成直线；
 * - hover / 触摸显示最近采样点与真实时间，不生成插值点。
 */
export default function ConsoleChart({
  points,
  axis = "count",
  unit = "",
  color = "var(--ab-blue)",
  bucketMs = 60_000,
  pending = false,
  emptyText = "该时间范围内暂无采集数据",
  formatValue,
}: {
  points: ConsolePoint[];
  axis?: "percent" | "bytes" | "count";
  unit?: string;
  color?: string;
  bucketMs?: number;
  pending?: boolean;
  emptyText?: string;
  formatValue?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const valid = useMemo(
    () => points.filter((point): point is { t: number; v: number } => point.v != null && Number.isFinite(point.v) && Number.isFinite(point.t)),
    [points],
  );

  const fmt = (value: number) => (formatValue ? formatValue(value) : defaultFormat(value, axis, unit));

  const model = useMemo(() => {
    if (valid.length < 2) return null;
    const tMin = valid[0].t;
    const tMax = Math.max(valid[valid.length - 1].t, tMin + bucketMs * 2);
    const values = valid.map((point) => point.v);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const minV = axis === "percent" ? 0 : Math.max(0, rawMin - (rawMax - rawMin) * 0.12);
    const maxV = axis === "percent" ? 100 : rawMax === rawMin ? rawMax + 1 : rawMax + (rawMax - rawMin) * 0.08;
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - tMin) / Math.max(1, tMax - tMin)) * innerW;
    const y = (v: number) => PAD.top + innerH - ((v - minV) / Math.max(0.0001, maxV - minV)) * innerH;

    const segments: Array<Array<{ x: number; y: number; t: number; v: number }>> = [];
    let current: Array<{ x: number; y: number; t: number; v: number }> = [];
    let previous: number | null = null;
    for (const point of valid) {
      const shaped = { x: x(point.t), y: y(point.v), t: point.t, v: point.v };
      if (previous != null && point.t - previous > bucketMs * 1.8) {
        if (current.length) segments.push(current);
        current = [];
      }
      current.push(shaped);
      previous = point.t;
    }
    if (current.length) segments.push(current);

    return { tMin, tMax, minV, maxV, x, y, segments, innerH };
  }, [valid, axis, bucketMs]);

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!model || !valid.length) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    valid.forEach((point, index) => {
      const gap = Math.abs(model.x(point.t) - px);
      if (gap < distance) { distance = gap; nearest = index; }
    });
    setHover(nearest);
  };

  if (!model) {
    return (
      <div className="cc2-chart" data-pending={pending ? "1" : "0"}>
        <div className="cc2-chart__empty">{emptyText}</div>
      </div>
    );
  }

  const active = hover != null ? valid[hover] : null;
  const activeX = active ? model.x(active.t) : 0;
  const activeY = active ? model.y(active.v) : 0;
  const timeLabel = (t: number) =>
    new Date(t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const fullTime = (t: number) =>
    new Date(t).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const gradientId = `cc2-grad-${Math.abs(Math.round(model.tMin / 1000)) % 100000}`;

  return (
    <div className="cc2-chart" data-pending={pending ? "1" : "0"}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`趋势图，最新 ${fmt(valid[valid.length - 1].v)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 水平网格与纵轴刻度 */}
        {[0, 1 / 3, 2 / 3, 1].map((ratio) => {
          const value = model.maxV - (model.maxV - model.minV) * ratio;
          const gy = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * ratio;
          return (
            <g key={ratio}>
              <line x1={PAD.left} y1={gy} x2={WIDTH - PAD.right} y2={gy} stroke="var(--ab-line)" strokeDasharray={ratio === 1 ? "0" : "3 4"} strokeWidth="1" />
              <text x={PAD.left - 7} y={gy + 3.5} fontSize="9.5" fill="var(--ab-ink-3)" textAnchor="end">{fmt(value)}</text>
            </g>
          );
        })}

        {/* 垂直时间网格 */}
        {[0, 1 / 3, 2 / 3, 1].map((ratio) => {
          const gx = PAD.left + (WIDTH - PAD.left - PAD.right) * ratio;
          return (
            <g key={ratio}>
              <line x1={gx} y1={PAD.top} x2={gx} y2={HEIGHT - PAD.bottom} stroke="var(--ab-line)" strokeDasharray="2 5" strokeWidth="1" opacity="0.7" />
              <text
                x={gx}
                y={HEIGHT - 6}
                fontSize="9.5"
                fill="var(--ab-ink-3)"
                textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
              >
                {timeLabel(model.tMin + (model.tMax - model.tMin) * ratio)}
              </text>
            </g>
          );
        })}

        {/* 数据：每段独立闭合，缺口不连线 */}
        {model.segments.map((segment, index) => {
          const line = segment.map((point, i) => `${i === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
          const area = `${line} L${segment[segment.length - 1].x.toFixed(1)},${HEIGHT - PAD.bottom} L${segment[0].x.toFixed(1)},${HEIGHT - PAD.bottom} Z`;
          return (
            <g key={index}>
              <path d={area} fill={`url(#${gradientId})`} />
              <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {active ? (
          <g>
            <line x1={activeX} y1={PAD.top} x2={activeX} y2={HEIGHT - PAD.bottom} stroke="var(--ab-ink-3)" strokeDasharray="3 3" strokeWidth="1" />
            <circle cx={activeX} cy={activeY} r="4" fill={color} stroke="var(--ab-surface)" strokeWidth="2" />
          </g>
        ) : (
          <circle
            cx={model.x(valid[valid.length - 1].t)}
            cy={model.y(valid[valid.length - 1].v)}
            r="3.6"
            fill={color}
            stroke="var(--ab-surface)"
            strokeWidth="2"
          />
        )}
      </svg>

      {active ? (
        <div
          className="cc2-chart__tip"
          style={{ left: `${(activeX / WIDTH) * 100}%`, top: `${Math.max(12, (activeY / HEIGHT) * 100 - 2)}%` }}
        >
          {fmt(active.v)}
          <small>{fullTime(active.t)}</small>
        </div>
      ) : null}
    </div>
  );
}
