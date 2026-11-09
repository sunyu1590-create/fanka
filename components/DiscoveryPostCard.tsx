"use client";

import { useState } from "react";
import { ArrowRight, Heart, Star } from "lucide-react";
import { feedImageSource } from "@/lib/feed-images";
import type { Post } from "@/lib/content";

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
  const [imageRatio, setImageRatio] = useState<string | null>(null);
  const coverVideo = post.video || post.videos?.[0];
  const source = feedImageSource(post.thumbnailImages?.[0] || post.image || post.images?.[0]);
  const retrySource = source
    ? source.startsWith("data:")
      ? source
      : `${source}${source.includes("?") ? "&" : "?"}retry=${retryCount}`
    : undefined;

  return (
    <article className="post-card editorial-post discover-content-card heika-discovery-card" data-discover-id={post.id}>
      <div className={`discovery-cover${source && imageFailed ? " is-failed" : ""}${!source && !coverVideo ? " is-text-only" : ""}`} style={imageRatio ? { aspectRatio: imageRatio } : undefined}>
        <button
          type="button"
          className={`discovery-cover-open${!source ? " discovery-text-cover" : ""}`}
          aria-label={`阅读：${post.title}`}
          onPointerDown={(event) => onPointerDown?.(event.currentTarget)}
          onClick={(event) => onOpen(event.currentTarget)}
        >
          {source && (
            <img
              key={retryCount}
              src={retrySource}
              alt=""
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) setImageRatio(`${image.naturalWidth} / ${image.naturalHeight}`);
                setImageFailed(false);
              }}
              onError={() => setImageFailed(true)}
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
              <span>{post.body}</span>
            </span>
          )}
        </button>
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
          </button>
        ) : (
          <span className="discovery-author discovery-author-static">
            <span className="discovery-author-name">{post.author || "探索者"}</span>
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
            <Heart size={14} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          {typeof post.likeCount === "number" && <span className="discovery-like-count" aria-label={`${post.likeCount} 个赞`}>{post.likeCount}</span>}
          <button
            type="button"
            className="discovery-read"
            aria-label={`打开详情：${post.title}`}
            onClick={(event) => onOpen(event.currentTarget)}
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </span>
      </div>
    </article>
  );
}
