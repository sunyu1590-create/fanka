"use client";

import { useCallback, useMemo } from "react";
import { ArrowRight, Heart, Star } from "lucide-react";
import type { Post } from "@/lib/content";
import { markdownToText } from "./MarkdownContent";
import { ProfileBadgeMarks } from "./ProfileBadgeList";
import CardCover from "./CardCover";

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
  const textExcerpt = useMemo(
    () => markdownToText(post.body || "").replace(/\s+/g, " ").trim().slice(0, 300),
    [post.body]
  );
  const detailHref = `/p/${post.id}`;
  const size = post.imageSizes?.[0];

  /** 精选专区严格保护：分类标签（左上）+ 评分标识（右上），通过 overlay 注入 CardCover */
  const featuredOverlay = (
    <span className="discovery-cover-labels" aria-hidden="true">
      <span
        className="discovery-glass-label discovery-category-label"
        title={post.tag}
      >
        {post.tag}
      </span>
      <span
        className="discovery-glass-label discovery-rating-label"
        title={
          rating?.count
            ? `社区评分 ${rating.average.toFixed(1)}，${rating.count} 人评分`
            : "待评级"
        }
      >
        <Star size={11} aria-hidden="true" />
        {rating?.count ? rating.average.toFixed(1) : "待评级"}
      </span>
    </span>
  );

  const handleOpen = useCallback(
    (source: HTMLElement) => {
      onOpen(source);
    },
    [onOpen]
  );

  return (
    <article
      className="post-card editorial-post discover-content-card heika-discovery-card"
      data-discover-id={post.id}
    >
      <CardCover
        image={post.image || post.images?.[0]}
        thumbnail={post.thumbnailImages?.[0]}
        video={post.video || post.videos?.[0]}
        imageWidth={size?.width ?? null}
        imageHeight={size?.height ?? null}
        title={post.title}
        excerpt={textExcerpt}
        overlay={featuredOverlay}
        href={detailHref}
        ariaLabel={`阅读：${post.title}`}
        onOpen={handleOpen}
        onPointerDown={onPointerDown}
        className="discovery-unified-card"
        coverClassName="discovery-unified-cover"
        borderRadius={9}
      >
        {/* 封面下方元信息与互动区域 */}
        <div className="discovery-post-meta">
          {post.authorId ? (
            <button
              type="button"
              className="discovery-author"
              onClick={() => onAuthorOpen(post.authorId!)}
              aria-label={`查看作者 ${post.author}`}
            >
              <span className="discovery-author-name">
                {post.author || "探索者"}
              </span>
              <ProfileBadgeMarks badges={post.authorBadges || []} compact />
            </button>
          ) : (
            <span className="discovery-author discovery-author-static">
              <span className="discovery-author-name">
                {post.author || "探索者"}
              </span>
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
              <Heart
                size={15}
                fill={liked ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </button>
            {typeof post.likeCount === "number" && (
              <span
                className="discovery-like-count"
                aria-label={`${post.likeCount} 个赞`}
              >
                {post.likeCount}
              </span>
            )}
            <a
              className="discovery-read"
              href={detailHref}
              aria-label={`打开详情：${post.title}`}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                )
                  return;
                event.preventDefault();
                onOpen(event.currentTarget);
              }}
            >
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </span>
        </div>
      </CardCover>
    </article>
  );
}
