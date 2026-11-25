"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, Layers } from "lucide-react";
import { publicRequest } from "@/lib/cloud";

type Card = {
  id: string; title: string; cover: string | null; channel: string; contentType: string;
  tag: string | null; author: string | null; date: string;
};
type Related = {
  series: { id: string; title: string; chapters: number; position: number; prev: { id: string; title: string } | null; next: { id: string; title: string } | null } | null;
  sameTag: Card[];
  authorPosts: Card[];
  aiResources: Card[];
  topics: { id: number; name: string }[];
  position: { current: number; total: number } | null;
};

type Props = {
  postId: string;
  onOpenPost: (id: string) => void;
  onOpenSeries: (id: string) => void;
  onOpenTopic: (name: string) => void;
};

const toneOf = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return `tone-${hash % 5}`;
};

function Cover({ item }: { item: Card }) {
  const [failed, setFailed] = useState(false);
  if (item.cover && !failed) return <img src={item.cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  return <span className={`series-cover-art ${toneOf(item.id)}`}><em>{item.channel === "ai" ? "AI" : "作品"}</em><strong>{item.title}</strong><i>HEIKA</i></span>;
}

function Strip({ title, hint, items, onOpen }: { title: string; hint?: string; items: Card[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return <div className="related-group">
    <div className="related-group-head"><strong>{title}</strong>{hint && <small>{hint}</small>}</div>
    <div className="related-strip">
      {items.map((item) => <button key={item.id} type="button" className="related-card" onClick={() => onOpen(item.id)}>
        <span className="related-card-cover"><Cover item={item} /></span>
        <strong>{item.title}</strong>
        <small>{item.tag || (item.channel === "ai" ? "AI 资源" : "作品")}{item.author ? ` · ${item.author}` : ""}</small>
      </button>)}
    </div>
  </div>;
}

export default function RelatedContent({ postId, onOpenPost, onOpenSeries, onOpenTopic }: Props) {
  const [data, setData] = useState<Related | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    void publicRequest<Related>(`/api/v1/posts/${encodeURIComponent(postId)}/related`)
      .then((result) => { if (alive) setData(result); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [postId]);

  if (!data) return null;
  const nothing = !data.series && !data.sameTag.length && !data.authorPosts.length && !data.aiResources.length && !data.topics.length;
  if (nothing) return null;

  return <section className="related-block" aria-label="关联内容">
    {data.series && <div className="related-group">
      <div className="related-group-head"><strong>所属合集</strong><small>第 {data.position?.current || data.series.position} / {data.position?.total || data.series.chapters} 篇</small></div>
      <button type="button" className="related-series" onClick={() => onOpenSeries(data.series!.id)}>
        <span className="related-series-cover"><Cover item={{ id: data.series.id, title: data.series.title, cover: null, channel: "community", contentType: "series", tag: null, author: null, date: "" }} /></span>
        <span className="related-series-copy"><strong>{data.series.title}</strong><small>{data.series.chapters} 篇 · 按顺序连续阅读</small></span>
        <Layers size={16} />
        <ChevronRight size={16} />
      </button>
    </div>}
    <Strip title="同主题作品" hint={data.sameTag[0]?.tag || ""} items={data.sameTag} onOpen={onOpenPost} />
    <Strip title={`${data.authorPosts[0]?.author || "作者"}的其他作品`} items={data.authorPosts} onOpen={onOpenPost} />
    <Strip title="相关 AI 资源" hint="按兴趣方向延伸" items={data.aiResources} onOpen={onOpenPost} />
    {!!data.topics.length && <div className="related-group">
      <div className="related-group-head"><strong>相关话题</strong><span><BookOpen size={12} /></span></div>
      <div className="related-topics">{data.topics.map((topic) => <button key={topic.id} type="button" onClick={() => onOpenTopic(topic.name)}>#{topic.name}</button>)}</div>
    </div>}
  </section>;
}
