"use client";
import { useCallback, useEffect, useState } from "react";
import { Flame, TrendingUp, ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import ProgressiveImage from "./ProgressiveImage";

interface TrendingItem {
  id: string;
  title: string;
  excerpt?: string;
  cover?: string;
  channel?: string;
  kind?: string;
  entity_type: "post" | "series";
  hot_score: number;
  reason?: string;
}

interface TrendingData {
  window_hours: number;
  items: TrendingItem[];
  generated_at: string;
  fallback?: boolean;
}

export default function TrendingPanel({ className = "", limit = 10 }: { className?: string; limit?: number }) {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/trending?kind=all`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // 静默降级
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className={`trending-panel ${className}`}>
        <div className="trending-loading"><Loader2 size={16} className="spin" /></div>
      </div>
    );
  }

  if (!data?.items?.length) return null;

  const items = data.items.slice(0, limit);

  return (
    <aside className={`trending-panel ${className}`}>
      <div className="trending-header">
        <Flame size={16} className="trending-fire" />
        <span>正在流行</span>
        {data.fallback && <span className="trending-badge">缓存</span>}
      </div>
      <ol className="trending-list">
        {items.map((item, idx) => (
          <li key={`${item.entity_type}-${item.id}`} className={`trending-item rank-${idx + 1}`}>
            <a href={item.entity_type === "series" ? `/series/${item.id}` : `/posts/${item.id}`} className="trending-link">
              <span className="trending-rank">{idx + 1}</span>
              {item.cover && (
                <div className="trending-thumb">
                  <ProgressiveImage src={item.cover} alt={item.title} width={36} height={36} />
                </div>
              )}
              <div className="trending-info">
                <div className="trending-title">{item.title}</div>
                <div className="trending-meta">
                  {item.entity_type === "series" && <Sparkles size={10} />}
                  <span>{item.entity_type === "series" ? "合集" : item.kind || "文章"}</span>
                  <span className="trending-score">🔥 {Math.round(item.hot_score)}</span>
                </div>
              </div>
              <ArrowUpRight size={12} className="trending-arrow" />
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}
