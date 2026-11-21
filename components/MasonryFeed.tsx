"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props<T> = {
  items: T[];
  getKey: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
  columns?: number;
  className?: string;
};

/**
 * 真正的双列瀑布流：按「当前列高」把下一张卡片放进最短的一列，
 * 不用会被同行最高卡片撑开的普通 grid。
 *
 * 高度先按估算值分配，挂载后用 ResizeObserver 逐张测量再纠正一次；
 * 因为列宽一致，纠正不会改变卡片自身高度，所以只会收敛一次，不会来回抖。
 */
export default function MasonryFeed<T>({ items, getKey, render, columns = 2, className = "" }: Props<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heights = useRef(new Map<string, number>());
  const frame = useRef(0);
  const [assignment, setAssignment] = useState<string[][]>([]);

  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, index) => map.set(getKey(item), index));
    return map;
  }, [items, getKey]);

  const distribute = useCallback(() => {
    const count = Math.max(1, columns);
    const next: string[][] = Array.from({ length: count }, () => []);
    const totals = new Array(count).fill(0);
    for (const item of items) {
      const key = getKey(item);
      let target = 0;
      for (let index = 1; index < count; index += 1) {
        if (totals[index] < totals[target] - 1) target = index;
      }
      next[target].push(key);
      totals[target] += heights.current.get(key) ?? 260;
    }
    return next;
  }, [items, getKey, columns]);

  useEffect(() => {
    setAssignment(distribute());
  }, [distribute]);

  const remeasure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    let changed = false;
    container.querySelectorAll<HTMLElement>("[data-masonry-key]").forEach((element) => {
      const key = element.dataset.masonryKey;
      if (!key) return;
      const height = element.offsetHeight;
      if (height > 0 && heights.current.get(key) !== height) {
        heights.current.set(key, height);
        changed = true;
      }
    });
    if (!changed) return;
    const next = distribute();
    setAssignment((current) => {
      const same = current.length === next.length && current.every((column, index) => column.length === next[index].length && column.every((key, position) => key === next[index][position]));
      return same ? current : next;
    });
  }, [distribute]);

  const signature = assignment.map((column) => column.join(",")).join("|");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(remeasure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    container.querySelectorAll<HTMLElement>("[data-masonry-key]").forEach((element) => observer.observe(element));
    window.addEventListener("resize", schedule);
    const timer = window.setTimeout(schedule, 420);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [remeasure, signature, items.length]);

  return <div
    ref={containerRef}
    className={`heika-masonry ${className}`.trim()}
    style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
  >
    {assignment.map((column, columnIndex) => <div className="heika-masonry-column" key={`masonry-${columnIndex}`}>
      {column.map((key) => {
        const index = indexByKey.get(key);
        if (index === undefined) return null;
        return <div className="heika-masonry-item" data-masonry-key={key} key={key}>{render(items[index], index)}</div>;
      })}
    </div>)}
  </div>;
}
