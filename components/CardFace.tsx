"use client";

import { useEffect, useState } from "react";
import type { Post } from "@/lib/content";
import type { CardRarityTier } from "@/lib/progression";

export type CardContentState = "loading" | "ready" | "error";

type Props = {
  post?: Post;
  /** 已翻开但内容还没就绪（缓存恢复、云端补拉） */
  state: CardContentState;
  rarityLabel?: string;
  rarityTier?: CardRarityTier | null;
  onRetry?: () => void;
};

function plainExcerpt(body: string | undefined, limit = 96) {
  const text = (body || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function ratingText(post: Post) {
  const count = Number(post.ratingCount || 0);
  const average = Number(post.ratingAverage || 0);
  if (!count || !Number.isFinite(average) || average <= 0) return "";
  return average.toFixed(1);
}

/**
 * 已翻开卡片的卡面。
 *
 * 视觉基准来自 APP 首页：图片铺满、标题压在图片上、分类在上、评分在左下，
 * 图片之外用一层从透明到深色的渐变保证文字可读。没有图片时改为文字卡，
 * 分类 / 标题 / 摘要 / 评分占满卡面，而不是留一块空白底色。
 *
 * 三种内容状态互不覆盖：内容未就绪显示骨架，失败可重试，就绪才渲染正文。
 */
export default function CardBackFace({ post, state, rarityLabel, rarityTier, onRetry }: Props) {
  const [imageState, setImageState] = useState<"loading" | "ready" | "failed">("loading");
  const image = post?.image;
  useEffect(() => { setImageState(image ? "loading" : "failed"); }, [image]);

  if (state !== "ready" || !post) {
    return (
      <span className={`card-flip-face card-flip-back is-placeholder${state === "error" ? " is-error" : ""}`}>
        <span className="card-back-placeholder" role={state === "error" ? "alert" : "status"}>
          {state === "error" ? (
            <>
              <span className="card-back-placeholder-title">卡片内容暂时无法恢复</span>
              <span className="card-back-placeholder-note">已翻开的记录还在，内容没有丢</span>
              {onRetry && (
                <span
                  className="card-back-retry"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => { event.stopPropagation(); onRetry(); }}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onRetry(); } }}
                >
                  重新加载
                </span>
              )}
            </>
          ) : (
            <>
              <span className="card-back-skeleton is-line w-40" />
              <span className="card-back-skeleton is-line w-80" />
              <span className="card-back-skeleton is-line w-64" />
              <span className="card-back-skeleton is-line w-24" />
              <span className="card-back-placeholder-note">正在恢复卡片内容…</span>
            </>
          )}
        </span>
      </span>
    );
  }

  const hasImage = Boolean(image) && imageState !== "failed";
  const excerpt = plainExcerpt(post.body);
  const rating = ratingText(post);
  return (
    <span className={`card-flip-face card-flip-back${hasImage ? " has-image" : " is-text"}`}>
      {hasImage && (
        <span className="card-back-media">
          <img
            key={image}
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            data-state={imageState}
            onLoad={() => setImageState("ready")}
            onError={() => setImageState("failed")}
          />
          {imageState === "loading" && <span className="card-back-skeleton is-media" aria-hidden="true" />}
          <span className="card-back-scrim" aria-hidden="true" />
        </span>
      )}
      {rarityLabel && <i className={`candidate-rarity-chip rarity-tier-${rarityTier}`} aria-label={`${rarityLabel}稀有卡`}>{rarityLabel}</i>}
      <span className="card-back-body">
        <span className="card-back-meta">
          <small>{post.tag || "黑卡内容"}</small>
          {post.contentType && post.contentType !== "community_post" && <small className="card-back-kind">AI</small>}
        </span>
        <strong className="card-back-title">{post.title || "未命名内容"}</strong>
        {!hasImage && excerpt && <span className="card-back-excerpt">{excerpt}</span>}
        <span className="card-back-foot">
          {rating ? (
            <span className="card-back-rating" aria-label={`评分 ${rating}`}>
              <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4 4.2 13.4l.7-4.3-3.1-3 4.3-.6z" /></svg>
              {rating}
            </span>
          ) : (
            <span className="card-back-rating is-pending">待评级</span>
          )}
          <span className="card-back-cta">阅读 ↗</span>
        </span>
      </span>
    </span>
  );
}
