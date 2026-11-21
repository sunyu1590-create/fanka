"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";
import { cloudRequest, publicRequest } from "@/lib/cloud";
import { SeriesSubscription } from "./InteractiveDiscovery";

type Chapter = { id: string; title: string; chapter: number; status: string };
type SeriesInfo = { title: string; chapters: Chapter[] };

type Props = {
  seriesId: string;
  postId: string;
  /** head：正文顶部的轻量合集卡；foot：正文末尾的上一章/下一章。 */
  slot?: "head" | "foot";
  accountId?: string | null;
  onLogin?: () => void;
  onNotice?: (message: string) => void;
  onOpen: (chapterId: string) => void;
  onOpenCollection: (seriesId: string) => void;
};

/** 同一篇正文会挂两个实例（顶部卡片与末尾切换），共用一次请求，避免重复拉目录。 */
const seriesCache = new Map<string, Promise<SeriesInfo | null>>();

function loadSeries(seriesId: string) {
  const cached = seriesCache.get(seriesId);
  if (cached) return cached;
  const task = publicRequest<{ title?: string; chapters?: Chapter[] }>(`/api/v1/series?id=${encodeURIComponent(seriesId)}`)
    .then((data) => ({ title: data?.title || "", chapters: Array.isArray(data?.chapters) ? data!.chapters! : [] }))
    .catch(() => null);
  seriesCache.set(seriesId, task);
  return task;
}

/**
 * 正文里的合集导航。
 * 顶部只留「合集名称 + 章节进度 + 目录 + 订阅」，上一章/下一章移到正文末尾；
 * 不存在的上一章或下一章直接不渲染，不用禁用按钮占位。
 */
export default function SeriesChapterNav({
  seriesId,
  postId,
  slot = "head",
  accountId = null,
  onLogin,
  onNotice,
  onOpen,
  onOpenCollection,
}: Props) {
  const [series, setSeries] = useState<SeriesInfo | null>(null);

  useEffect(() => {
    let active = true;
    void loadSeries(seriesId).then((data) => { if (active) setSeries(data); });
    return () => { active = false; };
  }, [seriesId]);

  if (!series || !series.chapters.length) return null;
  const chapters = series.chapters;
  const index = chapters.findIndex((chapter) => chapter.id === postId);
  if (index < 0) return null;
  const previous = chapters[index - 1];
  const next = chapters[index + 1];
  const progress = `第 ${index + 1} / ${chapters.length} 章`;

  const open = (chapter: Chapter) => {
    if (chapter.status !== "published") return;
    void cloudRequest("/api/v1/series", { action: "progress", id: seriesId, postId: chapter.id }).catch(() => {});
    onOpen(chapter.id);
  };

  if (slot === "head") {
    return <div className="detail-series-card" aria-label="所属合集">
      <div className="detail-series-copy">
        <small>{progress} · 合集</small>
        <strong>{series.title || "连载合集"}</strong>
      </div>
      <div className="detail-series-actions">
        <button type="button" className="detail-series-toc" onClick={() => onOpenCollection(seriesId)}>
          <ListOrdered size={13} aria-hidden="true" />目录
        </button>
        <SeriesSubscription
          seriesId={seriesId}
          accountId={accountId}
          onLogin={() => onLogin?.()}
          onNotice={(message) => onNotice?.(message)}
        />
      </div>
    </div>;
  }

  const canPrev = Boolean(previous && previous.status === "published");
  const canNext = Boolean(next && next.status === "published");
  if (!canPrev && !canNext) return null;

  return <div className="detail-series-steps" aria-label="章节切换">
    {canPrev && <button type="button" onClick={() => previous && open(previous)}>
      <ChevronLeft size={15} aria-hidden="true" />上一章
    </button>}
    <button type="button" className="detail-series-steps-toc" onClick={() => onOpenCollection(seriesId)}>
      <ListOrdered size={14} aria-hidden="true" />目录
    </button>
    {canNext && <button type="button" onClick={() => next && open(next)}>
      下一章<ChevronRight size={15} aria-hidden="true" />
    </button>}
  </div>;
}
