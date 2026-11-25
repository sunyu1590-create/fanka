"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronRight, Flame, Layers, Sparkles } from "lucide-react";
import { publicRequest } from "@/lib/cloud";
import { trackImpression } from "@/lib/track";

type RankingItem = {
  type: "post" | "series"; id: string; clientId?: number; title: string; cover: string | null;
  channel: string; contentType?: string; tag?: string | null; author?: { name: string } | null;
  meta?: { chapters?: number; likes?: number; bookmarks?: number; reads?: number };
};
type SeriesCard = {
  id: string; title: string; description: string; coverUrl: string | null; kind: string; channel: string;
  author: { nickname: string } | null; chapters: number; followCount: number;
};
type RecommendItem = {
  type: "post" | "series"; id: string; title: string; excerpt: string; cover: string | null;
  kind: string; tag: string | null; authorName: string; pool: string; reason: string;
};

type Props = {
  onOpenPostById: (id: string) => void;
  onOpenSeries: (id: string) => void;
  onOpenSeriesChannel: () => void;
};

const KIND: Record<string, string> = { serial: "连载", tutorial: "教程", resource: "资源" };
const toneOf = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return `tone-${hash % 5}`;
};

function Cover({ id, title, cover, kind }: { id: string; title: string; cover: string | null; kind?: string }) {
  const [failed, setFailed] = useState(false);
  if (cover && !failed) return <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  return <span className={`series-cover-art ${toneOf(id)}`}>
    <em>{KIND[kind || ""] || "合集"}</em><strong>{title}</strong><i>HEIKA</i>
  </span>;
}

export default function AIHotSections({ onOpenPostById, onOpenSeries, onOpenSeriesChannel }: Props) {
  const [hot, setHot] = useState<RankingItem[]>([]);
  const [series, setSeries] = useState<SeriesCard[]>([]);
  const [picks, setPicks] = useState<RecommendItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.allSettled([
      publicRequest<{ rankings: Record<string, { items?: RankingItem[] } | null> }>("/api/v1/rankings?keys=ai"),
      publicRequest<{ all?: SeriesCard[] }>("/api/v1/series/discover?channel=ai&limit=6"),
      publicRequest<{ items?: RecommendItem[] }>("/api/v1/recommendations?surface=ai&limit=6"),
    ]).then(([rankResult, seriesResult, pickResult]) => {
      if (!alive) return;
      if (rankResult.status === "fulfilled") setHot(rankResult.value?.rankings?.ai?.items?.slice(0, 5) || []);
      if (seriesResult.status === "fulfilled") setSeries((seriesResult.value?.all || []).slice(0, 5));
      if (pickResult.status === "fulfilled") setPicks((pickResult.value?.items || []).slice(0, 4));
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const items = [
      ...hot.map((item) => ({ type: item.type, id: item.id })),
      ...picks.map((item) => ({ type: item.type, id: item.id })),
    ];
    void trackImpression(items.filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index), "ai");
  }, [loaded, hot, picks]);

  if (!loaded) return <div className="ai-hot-skeleton"><i /><i /><i /></div>;

  return <>
    <section className="ai-hot-section" aria-label="近期热门">
      <div className="ai-hot-head"><div><small>近 72 小时互动</small><h2><Flame size={15} /> 近期热门</h2></div><span>{hot.length ? `${hot.length} 条` : "等待互动"}</span></div>
      {hot.length ? <div className="ai-hot-list">
        {hot.map((item, index) => <button key={`${item.type}-${item.id}`} type="button" className="ai-hot-row" onClick={() => item.type === "series" ? onOpenSeries(item.id) : onOpenPostById(item.id)}>
          <i className={`ai-hot-rank${index < 3 ? " is-top" : ""}`}>{index + 1}</i>
          <span className="ai-hot-copy">
            <strong>{item.title}</strong>
            <small>{item.type === "series" ? `合集 · ${item.meta?.chapters || 0} 篇` : item.tag || "AI 资源"}{item.author?.name ? ` · ${item.author.name}` : ""}</small>
          </span>
          <span className={`ai-hot-badge${item.type === "series" ? " is-series" : ""}`}>{item.type === "series" ? <Layers size={11} /> : <Sparkles size={11} />}{item.type === "series" ? "合集" : "AI"}</span>
        </button>)}
      </div> : <p className="ai-hot-empty">还没有形成近期热榜，互动会随着阅读与收藏逐步累计。</p>}
    </section>

    {!!series.length && <section className="ai-hot-section" aria-label="热门 AI 合集">
      <div className="ai-hot-head"><div><h2><Layers size={15} /> 热门 AI 合集</h2></div><button type="button" onClick={onOpenSeriesChannel}>查看全部 <ChevronRight size={14} /></button></div>
      <div className="ai-series-shelf">
        {series.map((item) => <button key={item.id} type="button" className="ai-series-card" onClick={() => onOpenSeries(item.id)}>
          <span className="ai-series-cover"><Cover id={item.id} title={item.title} cover={item.coverUrl} kind={item.kind} /></span>
          <strong>{item.title}</strong>
          <small>{item.chapters} 篇 · {item.followCount} 收藏</small>
        </button>)}
      </div>
    </section>}

    {!!picks.length && <section className="ai-hot-section" aria-label="为你推荐">
      <div className="ai-hot-head"><div><small>按你的收藏与阅读</small><h2><Sparkles size={15} /> 为你推荐</h2></div><span>{picks[0]?.reason || "个性化"}</span></div>
      <div className="ai-pick-grid">
        {picks.map((item) => <button key={`${item.type}-${item.id}`} type="button" className="ai-pick-card" onClick={() => item.type === "series" ? onOpenSeries(item.id) : onOpenPostById(item.id)}>
          <span className="ai-pick-cover"><Cover id={item.id} title={item.title} cover={item.cover} kind={item.kind} /></span>
          <span className="ai-pick-copy"><strong>{item.title}</strong><small>{item.tag || item.authorName}</small></span>
          <ArrowUpRight size={14} />
        </button>)}
      </div>
    </section>}
  </>;
}
