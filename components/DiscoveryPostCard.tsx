"use client";

import { useState } from "react";
import { ArrowRight, Heart, Star } from "lucide-react";
import { feedImageSource } from "@/lib/feed-images";
import type { Post } from "@/lib/content";
import { markdownToText } from "./MarkdownContent";
import { ProfileBadgeMarks } from "./ProfileBadgeList";
import ProgressiveImage from "./ProgressiveImage";

type DiscoveryPostCardProps = {
  post: Post;
  rating?: { average: number; count: number };
  liked: boolean;
  likeBusy: boolean;
  onLike: () => void;
  onOpen: (sourceElement: Element) => void;
  onAuthorOpen: (authorId: string) => void;
  onPointerDown?: (sourceElement: HTMLElement) => void;
};

export default function DiscoveryPostCard({
  post,
  rating,
  liked,
  likeBusy,
  onLike,
  onOpen,
  onAuthorOpen,
  onPointerDown,
}: DiscoveryPostCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const coverVideo = post.video || post.videos?.[0];
  // 封面比例在渲染前就定好，取三档错落值，由 id 稳定散列决定。
  // 之前是等图片 onLoad 再写 aspectRatio，瀑布流会在每张图加载完成时整体重排一次，
  // 这正是探索页滚动时"跳一下"和掉帧的来源。
  const coverRatio = (() => {
    const key = String(post.id);
    let seed = 0;
    for (let index = 0; index < key.length; index += 1) {
      seed = (seed * 31 + key.charCodeAt(index)) % 9973;
    }
    return [0.78, 0.88, 1.02][seed % 3];
  })();
  const source = feedImageSource(post.thumbnailImages?.[0] || post.image || post.images?.[0], true);
  const retrySource = source
    ? source.startsWith("data:")
      ? source
      : `${source}${source.includes("?") ? "&" : "?"}retry=${retryCount}`
    : undefined;
  const textExcerpt = markdownToText(post.body || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const detailHref = `/p/${post.id}`;
  // 修饰键 / 中键交给浏览器开新标签页；普通左键走站内切换，避免整页刷新。
  const openDetail = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(event.currentTarget);
  };

  return (
    <article className="post-card editorial-post discover-content-card heika-discovery-card" data-discover-id={post.id}>
      <div
        className={`discovery-cover${source && imageFailed ? " is-failed" : ""}${!source && !coverVideo ? " is-text-only" : ""}`}
        style={source || coverVideo ? { aspectRatio: String(coverRatio) } : undefined}
      >
        <a
          className={`discovery-cover-open${!source ? " discovery-text-cover" : ""}`}
          href={detailHref}
          aria-label={`阅读：${post.title}`}
          onPointerDown={(event) => onPointerDown?.(event.currentTarget)}
          onClick={openDetail}
        >
          {source && (
            <ProgressiveImage
              key={retryCount}
              src={retrySource || source || ""}
              lowSrc={feedImageSource(post.thumbnailImages?.[0] || post.image || post.images?.[0])}
              alt=""
              fallbackRatio={coverRatio}
              priority={false}
              onHighReady={() => setImageFailed(false)}
              onHighError={() => setImageFailed(true)}
            />
          )}
          {!source && coverVideo && <video src={coverVideo} muted playsInline preload="metadata" aria-label="视频作品封面" />}
          {source && imageFailed && (
            <span className="discovery-image-error" aria-hidden="true">
              图片暂时无法加载
            </span>
          )}
          <span className="discovery-cover-labels" aria-hidden="true">
            <span className="discovery-glass-label discovery-category-label" title={post.tag}>
              {post.tag}
            </span>
            <span className="discovery-glass-label discovery-rating-label" title={rating?.count ? `社区评分 ${rating.average.toFixed(1)}，${rating.count} 人评分` : "待评级"}>
              <Star size={11} aria-hidden="true" />
              {rating?.count ? rating.average.toFixed(1) : "待评级"}
            </span>
          </span>
          {source || coverVideo ? (
            <span className="discovery-cover-title">{post.title}</span>
          ) : (
            <span className="discovery-text-copy">
              <strong>{post.title}</strong>
              <span>{textExcerpt}</span>
            </span>
          )}
        </a>
        {source && imageFailed && (
          <button
            type="button"
            className="discovery-image-retry"
            onClick={() => {
              setImageFailed(false);
              setRetryCount((count) => count + 1);
            }}
          >
            重试
          </button>
        )}
      </div>

      <div className="discovery-post-meta">
        {post.authorId ? (
          <button
            type="button"
            className="discovery-author"
            onClick={() => onAuthorOpen(post.authorId!)}
            aria-label={`查看作者 ${post.author}`}
          >
            <span className="discovery-author-name">{post.author || "探索者"}</span>
            <ProfileBadgeMarks badges={post.authorBadges || []} compact />
          </button>
        ) : (
          <span className="discovery-author discovery-author-static">
            <span className="discovery-author-name">{post.author || "探索者"}</span>
            <ProfileBadgeMarks badges={post.authorBadges || []} compact />
          </span>
        )}
        <span className="discovery-post-actions">
          <button
            type="button"
            className={`discovery-like${liked ? " is-liked" : ""}`}
            aria-label={liked ? "取消点赞" : "点赞"}
            aria-pressed={liked}
            disabled={likeBusy}
            onClick={onLike}
          >
            <Heart size={15} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          {typeof post.likeCount === "number" && <span className="discovery-like-count" aria-label={`${post.likeCount} 个赞`}>{post.likeCount}</span>}
          <a
            className="discovery-read"
            href={detailHref}
            aria-label={`打开详情：${post.title}`}
            onClick={openDetail}
          >
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        </span>
      </div>
    </article>
  );
}
