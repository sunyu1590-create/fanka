"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Hash, User, Flame, Compass, Users, Star, Loader2, ChevronRight } from "lucide-react";
import ProgressiveImage from "./ProgressiveImage";

interface RecItem {
  id: string;
  title: string;
  excerpt?: string;
  cover?: string;
  channel?: string;
  kind?: string;
  reason?: string;
  tag_id?: number;
  author_id?: string;
  created_at?: string;
  hot_score?: number;
}

interface ModuleData {
  post_id: string;
  modules: Record<string, RecItem[]>;
  generated_at: string;
}

const moduleMeta: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  sameSeries: { label: "同系列作品", icon: <BookOpen size={14} />, color: "#6366f1" },
  sameTag: { label: "同主题热门", icon: <Hash size={14} />, color: "#f59e0b" },
  sameAuthor: { label: "同作者作品", icon: <User size={14} />, color: "#10b981" },
  hotInTag: { label: "此标签热门", icon: <Flame size={14} />, color: "#ef4444" },
  exploreTag: { label: "探索发现", icon: <Compass size={14} />, color: "#8b5cf6" },
  simUsers: { label: "同好也在看", icon: <Users size={14} />, color: "#06b6d4" },
  editorPick: { label: "编辑精选", icon: <Star size={14} />, color: "#ec4899" },
};

export default function DetailRecommendPanel({ postId, className = "" }: { postId: string; className?: string }) {
  const [data, setData] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!postId) return;
    try {
      const session = localStorage.getItem("heika-session") || Math.random().toString(36).slice(2);
      const res = await fetch(`/api/v1/posts/${postId}/detail-recommend?session=${session}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // 静默降级
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (loading) {
    return <div className={`detail-recommend-panel ${className}`}><Loader2 size={20} className="spin" /></div>;
  }

  if (!data?.modules || Object.keys(data.modules).length === 0) return null;

  return (
    <div className={`detail-recommend-panel ${className}`}>
      <h3 className="drp-title">更多推荐</h3>
      {Object.entries(data.modules).map(([key, items]) => {
        const meta = moduleMeta[key] || { label: key, icon: <Star size={14} />, color: "#888" };
        const isExpanded = expanded.has(key) || items.length <= 3;
        const visible = isExpanded ? items : items.slice(0, 3);

        return (
          <div key={key} className="drp-module">
            <div className="drp-module-header" onClick={() => toggleExpand(key)}>
              <span className="drp-module-icon" style={{ color: meta.color }}>{meta.icon}</span>
              <span className="drp-module-label">{meta.label}</span>
              <span className="drp-module-count">{items.length}</span>
              {items.length > 3 && (
                <ChevronRight size={14} className={`drp-chevron ${isExpanded ? "open" : ""}`} />
              )}
            </div>
            <div className="drp-cards">
              {visible.map((item) => (
                <a key={item.id} href={`/posts/${item.id}`} className="drp-card">
                  <div className="drp-card-cover">
                    {item.cover ? (
                      <ProgressiveImage src={item.cover} alt={item.title} width={80} height={60} />
                    ) : (
                      <div className="drp-no-cover" />
                    )}
                  </div>
                  <div className="drp-card-body">
                    <div className="drp-card-title">{item.title}</div>
                    {item.reason && <div className="drp-card-reason">{item.reason}</div>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
