"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";
import { cloudRequest, publicRequest } from "@/lib/cloud";

type Chapter = { id: string; title: string; chapter: number; status: string };

type Props = {
  seriesId: string;
  postId: string;
  onOpen: (chapterId: string) => void;
  onOpenCollection: (seriesId: string) => void;
};

/**
 * 正文里的章节导航：只补充「第 N 章 / 上一章 / 下一章 / 目录」，
 * 不复制正文，也不替代合集详情页。目录拉取失败时整块不渲染，避免留下空壳。
 */
export default function SeriesChapterNav({ seriesId, postId, onOpen, onOpenCollection }: Props) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);

  useEffect(() => {
    let active = true;
    setChapters(null);
    publicRequest<{ chapters?: Chapter[] }>(`/api/v1/series?id=${encodeURIComponent(seriesId)}`)
      .then((data) => {
        if (!active) return;
        const items = data?.chapters;
        setChapters(Array.isArray(items) ? items : []);
      })
      .catch(() => { if (active) setChapters([]); });
    return () => { active = false; };
  }, [seriesId]);

  if (!chapters || !chapters.length) return null;
  const index = chapters.findIndex((chapter) => chapter.id === postId);
  if (index < 0) return null;
  const previous = chapters[index - 1];
  const next = chapters[index + 1];

  const open = (chapter: Chapter) => {
    if (chapter.status !== "published") return;
    void cloudRequest("/api/v1/series", { action: "progress", id: seriesId, postId: chapter.id }).catch(() => {});
    onOpen(chapter.id);
  };

  return <div className="detail-chapter-nav" aria-label="合集章节导航">
    <button type="button" className="detail-chapter-toc" onClick={() => onOpenCollection(seriesId)}>
      <ListOrdered size={14} />
      <span>第 {index + 1} / {chapters.length} 章</span>
      <small>目录</small>
    </button>
    <div className="detail-chapter-steps">
      <button type="button" disabled={!previous || previous.status !== "published"} onClick={() => previous && open(previous)}>
        <ChevronLeft size={14} />上一章
      </button>
      <button type="button" disabled={!next || next.status !== "published"} onClick={() => next && open(next)}>
        下一章<ChevronRight size={14} />
      </button>
    </div>
  </div>;
}
