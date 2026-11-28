"use client";
import { useCallback, useEffect, useState } from "react";
import { Sparkles, Wand2, Clock, TrendingUp, ChevronRight, Loader2 } from "lucide-react";
import ProgressiveImage from "./ProgressiveImage";

interface BriefingItem {
  id: string;
  title: string;
  excerpt: string;
  cover: string | null;
  channel: string;
  kind: string;
  tag_id: number;
  author_id: string;
  created_at: string;
  hot_score: number;
}

interface BriefingSection {
  key: string;
  label: string;
  icon: string;
  items: BriefingItem[];
}

interface BriefingData {
  enabled: boolean;
  sections: BriefingSection[];
  rotate_hours: number;
  generated_at: string;
}

const iconMap: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="s-icon" size={14} />,
  Wand2: <Wand2 className="s-icon" size={14} />,
  Clock: <Clock className="s-icon" size={14} />,
  TrendingUp: <TrendingUp className="s-icon" size={14} />,
};

export default function BriefingPanel({ className = "" }: { className?: string }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/briefing", { cache: "no-store" });
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
      <div className={`briefing-panel ${className}`}>
        <div className="briefing-loading"><Loader2 size={18} className="spin" /></div>
      </div>
    );
  }

  if (!data?.enabled || !data.sections?.length) return null;

  return (
    <aside className={`briefing-panel ${className}`}>
      <div className="briefing-header">
        <Sparkles size={16} />
        <span>今日简报</span>
      </div>
      {data.sections.map((sec) => (
        <div key={sec.key} className="briefing-section">
          <div className="briefing-section-title">
            {iconMap[sec.icon] || <Sparkles size={14} />}
            <span>{sec.label}</span>
            {sec.items.length > 0 && <span className="briefing-count">{sec.items.length}</span>}
          </div>
          <div className="briefing-cards">
            {sec.items.slice(0, 3).map((item) => (
              <a key={item.id} href={`/posts/${item.id}`} className="briefing-card">
                <div className="briefing-card-cover">
                  {item.cover ? (
                    <ProgressiveImage src={item.cover} alt={item.title} width={60} height={60} />
                  ) : (
                    <div className="briefing-no-cover" />
                  )}
                </div>
                <div className="briefing-card-info">
                  <div className="briefing-card-title">{item.title}</div>
                  <div className="briefing-card-meta">{item.kind} · {item.channel}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
      <div className="briefing-footer">
        <span>每 {data.rotate_hours}h 刷新</span>
      </div>
    </aside>
  );
}
