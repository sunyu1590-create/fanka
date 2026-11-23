"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ImageIcon, RotateCw } from "lucide-react";

/**
 * 详情页图片三级加载：固定占位 → 低清预览 → 高清叠化。
 *
 * 布局稳定优先于视觉取巧：
 * 1. 容器用 aspect-ratio 在请求发出前就把高度定死，图片到达不会推动正文；
 * 2. 低清用的是真实 480px WebP 缩略图，不是把原图加 CSS 模糊；
 * 3. 高清必须 onLoad 且 decode() 成功才淡入，避免解码期间的白闪与主线程卡顿；
 * 4. 失败有次数上限与退避，低清成功时保留低清并允许手动重试高清。
 */
type Props = {
  lowSrc?: string;
  src: string;
  alt: string;
  /** 原图像素宽高：用于计算占位比例。缺省时退回 fallbackRatio。 */
  width?: number | null;
  height?: number | null;
  /** 没有尺寸元数据时的统一临时比例（宽 / 高）。 */
  fallbackRatio?: number;
  /** 首屏图用 eager + 高优先级，其余交给浏览器懒加载。 */
  priority?: boolean;
  onHighReady?: () => void;
  onHighError?: () => void;
  className?: string;
};

const RETRY_DELAYS = [600, 1400, 3000];

/** 给地址加一个重试标记：命中浏览器缓存时也能重新发起请求。 */
function withRetry(src: string, attempt: number) {
  if (!src || !attempt) return src;
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}retry=${attempt}`;
}

export default function ProgressiveImage({
  lowSrc,
  src,
  alt,
  width,
  height,
  fallbackRatio = 4 / 5,
  priority = true,
  onHighReady,
  onHighError,
  className,
}: Props) {
  const [lowReady, setLowReady] = useState(false);
  const [highReady, setHighReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const retryTimer = useRef<number | null>(null);
  const alive = useRef(true);

  // 没有独立缩略图时不要拿原图冒充低清：那会绕过高清的重试与失败提示，
  // 一旦原图 500，占位会永远停在「正在加载」。此时直接走高清单级路径。
  const lowSource = useMemo(() => (lowSrc && lowSrc !== src ? withRetry(lowSrc, 0) : ""), [lowSrc, src]);
  const ratio = width && height && width > 0 && height > 0 ? width / height : fallbackRatio;
  const highSource = useMemo(() => withRetry(src, attempt), [src, attempt]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, []);

  // 地址换了就是另一张图：占位与失败态必须重置，否则会闪上一张的结论。
  useEffect(() => {
    setHighReady(false);
    setFailed(false);
    setWaiting(false);
    setAttempt(0);
  }, [src, lowSrc]);

  const handleHighLoad = useCallback(async (element: HTMLImageElement) => {
    try {
      // decode() 成功代表位图已可绘制，这时才淡入，避免换帧时掉帧或闪白。
      await element.decode();
    } catch {
      /* Safari 旧版对已缓存图片可能 reject，按已就绪处理即可。 */
    }
    if (!alive.current) return;
    setHighReady(true);
    setFailed(false);
    onHighReady?.();
  }, [onHighReady]);

  const handleHighError = useCallback(() => {
    if (!alive.current) return;
    if (attempt < RETRY_DELAYS.length) {
      setWaiting(true);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => {
        if (!alive.current) return;
        setAttempt((value) => value + 1);
        setWaiting(false);
      }, RETRY_DELAYS[attempt]);
      return;
    }
    setWaiting(false);
    setFailed(true);
    onHighError?.();
  }, [attempt, onHighError]);

  const retryManually = useCallback(() => {
    setFailed(false);
    setWaiting(false);
    setAttempt((value) => value + 1);
  }, []);

  const showPlaceholder = !lowReady && !highReady && !failed;
  const style = { "--progressive-ratio": String(ratio) } as CSSProperties;

  return (
    <div
      className={`progressive-image-stack${className ? ` ${className}` : ""}`}
      style={style}
      data-phase={highReady ? "high" : lowReady ? "low" : failed ? "failed" : "placeholder"}
    >
      {showPlaceholder && (
        <div className="progressive-image-placeholder" role="status" aria-live="polite" aria-label="正在加载图片">
          <span className="progressive-image-glyph" aria-hidden="true"><ImageIcon size={22} strokeWidth={1.5} /></span>
          <span className="progressive-image-hint">正在加载…</span>
        </div>
      )}

      {lowSource && (
        <img
          className={`progressive-image-low${lowReady ? " is-ready" : ""}`}
          src={lowSource}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          onLoad={() => { if (alive.current) setLowReady(true); }}
          onError={() => {
            // 低清失败不阻塞高清：占位保持到高清就绪或最终失败。
            if (alive.current) setLowReady(false);
          }}
        />
      )}

      <img
        className={`progressive-image-high${highReady ? " is-ready" : ""}`}
        src={highSource}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={(event) => { void handleHighLoad(event.currentTarget); }}
        onError={handleHighError}
      />

      {failed && (
        <div className="progressive-image-failed" role="alert">
          {lowReady ? (
            <>
              <span>高清图暂时加载失败，当前为预览画质</span>
              <button type="button" onClick={retryManually} aria-label="重新加载高清图片"><RotateCw size={13} /> 重新加载</button>
            </>
          ) : (
            <>
              <span>图片加载失败</span>
              <button type="button" onClick={retryManually} aria-label="重新加载图片"><RotateCw size={13} /> 重新加载</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
