"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import ProgressiveImage from "./ProgressiveImage";
import { feedImageSource } from "@/lib/feed-images";

export type CardCoverProps = {
  /** 原始封面图片 URL（完整尺寸，会经 feedImageSource 转换为缩略图） */
  image?: string | null;
  /** 缩略图 URL（已处理的低清版，用于 ProgressiveImage lowSrc） */
  thumbnail?: string | null;
  /** 视频封面 */
  video?: string | null;
  /** 封面预设宽度（已知时跳过 onLoad 测量） */
  imageWidth?: number | null;
  /** 封面预设高度 */
  imageHeight?: number | null;
  /** 无图时的标题（纯文字卡片） */
  title?: string;
  /** 无图时的摘要 */
  excerpt?: string;
  /** 封面上的表层元素（分类标签、评分等），随图片容器定位 */
  overlay?: React.ReactNode;
  /** 封面下方的信息区域 */
  children?: React.ReactNode;
  /** 链接地址 */
  href?: string;
  /** aria-label */
  ariaLabel?: string;
  /** 点击打开回调 */
  onOpen?: (source: HTMLElement) => void;
  /** 指针按下回调（手势预留） */
  onPointerDown?: (source: HTMLElement) => void;
  /** 容器 className */
  className?: string;
  /** 封面容器 className */
  coverClassName?: string;
  /** 封面圆角 */
  borderRadius?: number;
  /** 封面圆角 */
  /** 最小封面高度 */
  minHeight?: number;
};

/** 统一封面组件：真实宽高比例计算、渐进式加载、无图纯文字、错误重试。 */
export default function CardCover({
  image,
  thumbnail,
  video,
  imageWidth,
  imageHeight,
  title,
  excerpt,
  overlay,
  children,
  href,
  ariaLabel,
  onOpen,
  onPointerDown,
  className = "",
  coverClassName = "",
  borderRadius = 7,
  minHeight = 108,
}: CardCoverProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(
    imageWidth && imageHeight ? imageWidth / imageHeight : null
  );
  const [layoutReady, setLayoutReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const source = feedImageSource(image || undefined, true);
  const lowSrc = feedImageSource(thumbnail || image || undefined);
  const retrySource = source
    ? source.startsWith("data:")
      ? source
      : `${source}${source.includes("?") ? "&" : "?"}retry=${retryAttempt}`
    : undefined;
  const textOnly = !source && !video;
  const hasVisual = !!source || !!video;

  // 图片加载完成后获取真实宽高比
  const onImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNaturalRatio(img.naturalWidth / img.naturalHeight);
      }
      setImgFailed(false);
      setLayoutReady(true);
    },
    []
  );

  const onImageError = useCallback(() => {
    setImgFailed(true);
    setLayoutReady(true);
  }, []);

  const onHighReady = useCallback(() => {
    setImgFailed(false);
    setLayoutReady(true);
  }, []);

  const onHighError = useCallback(() => {
    setImgFailed(true);
  }, []);

  const retryImage = useCallback(() => {
    setImgFailed(false);
    setRetryAttempt((v) => v + 1);
  }, []);

  // 封面容器样式：优先真实比例，否则使用预设或回退值
  const coverStyle: CSSProperties = {};
  if (hasVisual && naturalRatio) {
    coverStyle.aspectRatio = String(Math.max(0.4, Math.min(naturalRatio, 2.5)));
  } else if (hasVisual && !naturalRatio) {
    // 加载中：使用估算比例作为占位，防止布局抖动
    coverStyle.aspectRatio = "4/3";
    coverStyle.minHeight = minHeight;
  }
  if (!layoutReady && hasVisual) {
    coverStyle.minHeight = minHeight;
  }

  const openDetail = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpen?.(event.currentTarget);
  };

  return (
    <div
      ref={containerRef}
      className={`unified-card ${className}`.trim()}
      style={{ borderRadius }}
    >
      {/* 封面区域 */}
      <div
        className={`unified-cover${textOnly ? " is-text-only" : ""}${imgFailed ? " is-failed" : ""} ${coverClassName}`.trim()}
        style={coverStyle}
      >
        {href ? (
          <a
            className="unified-cover-link"
            href={href}
            aria-label={ariaLabel}
            onPointerDown={(e) => onPointerDown?.(e.currentTarget)}
            onClick={openDetail}
          >
            {hasVisual && !imgFailed && (
              <ProgressiveImage
                key={retryAttempt}
                src={retrySource || source || ""}
                lowSrc={lowSrc}
                alt=""
                fallbackRatio={naturalRatio || 4 / 3}
                priority={false}
                onHighReady={onHighReady}
                onHighError={onHighError}
              />
            )}
            {!source && video && (
              <video src={video} muted playsInline preload="metadata" aria-label="视频作品封面" />
            )}
            {imgFailed && hasVisual && (
              <span className="unified-cover-error">图片暂时无法加载</span>
            )}
            {/* 封面表层元素：分类标签、评分等，绝对定位跟随图片容器 */}
            {overlay}
            {/* 无图：纯文字内容 */}
            {textOnly && title && (
              <span className="unified-text-copy">
                <strong>{title}</strong>
                {excerpt && <span>{excerpt}</span>}
              </span>
            )}
          </a>
        ) : (
          <>
            {hasVisual && !imgFailed && (
              <ProgressiveImage
                key={retryAttempt}
                src={retrySource || source || ""}
                lowSrc={lowSrc}
                alt=""
                fallbackRatio={naturalRatio || 4 / 3}
                priority={false}
                onHighReady={onHighReady}
                onHighError={onHighError}
              />
            )}
            {!source && video && (
              <video src={video} muted playsInline preload="metadata" aria-label="视频作品封面" />
            )}
            {imgFailed && hasVisual && (
              <span className="unified-cover-error">图片暂时无法加载</span>
            )}
            {overlay}
            {textOnly && title && (
              <span className="unified-text-copy">
                <strong>{title}</strong>
                {excerpt && <span>{excerpt}</span>}
              </span>
            )}
          </>
        )}
        {imgFailed && hasVisual && (
          <button type="button" className="unified-cover-retry" onClick={retryImage}>
            重试
          </button>
        )}
      </div>
      {/* 封面下方信息区域 */}
      {children}
    </div>
  );
}
