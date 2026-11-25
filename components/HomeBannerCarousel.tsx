"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { publicRequest } from "@/lib/cloud";

/**
 * 首页推荐位：沉浸式单媒体轮播（方案 A）。
 *
 * 一条时间线同时承载图片与视频：同一时刻只渲染一个媒体，
 * 只有一个计时器，只有当前项的视频处于播放状态。
 * 容器高度只由配置决定，绝不跟随媒体原始比例变化，避免下方卡池跳动。
 */

export type BannerSettings = {
  enabled: boolean;
  autoplay: boolean;
  imageDurationMs: number;
  transitionMs: number;
  videoAutoplay: boolean;
  videoMuted: boolean;
  allowUnmute: boolean;
  dataSaverFallback: boolean;
  videoMaxMs: number;
  sizeMode: "ratio" | "fixed";
  coverRatio: string;
  heights: { app: number; mobile: number; tablet: number; desktop: number };
  unifiedSize: boolean;
  fitMode: "cover" | "contain";
  focus: "center" | "top" | "bottom";
  radius: number;
  showIndicator: boolean;
  invalidTargetPolicy: "media" | "filter";
  version: number;
  updatedAt: string;
};

export type BannerItem = {
  id: string;
  mediaType: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  videoDurationMs: number | null;
  displayMs: number | null;
  targetType: "none" | "post" | "series";
  targetId: string | null;
  targetValid: boolean;
  focus: "center" | "top" | "bottom";
  alt: string;
};

type Payload = { settings: BannerSettings; items: BannerItem[]; version: string };

const CACHE_KEY = "heika.homeBanners.v1";
const SESSION_KEY = "heika.bannerSession.v1";
const MIN_SWIPE = 46;

function ratioValue(ratio: string) {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(ratio || "");
  if (!match) return 3;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : 3;
}

function sessionKey() {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
    const next = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `w-${Math.random().toString(36).slice(2, 14)}`;
  }
}

const track = (payload: { banner_id: string; event: string; duration_ms?: number }) => {
  try {
    const body = JSON.stringify({ ...payload, platform: "web", session: sessionKey() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/v1/home-banners/events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/v1/home-banners/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch {
    // 上报失败不影响浏览
  }
};

export default function HomeBannerCarousel({
  onOpenPost,
  onOpenSeries,
  className = "",
}: {
  onOpenPost?: (id: string) => void;
  onOpenSeries?: (id: string) => void;
  className?: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [drag, setDrag] = useState(0);
  const [width, setWidth] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [posterOnly, setPosterOnly] = useState(false);
  const [paused, setPaused] = useState(false);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; delta: number; active: boolean }>({ startX: 0, delta: 0, active: false });
  const reportedRef = useRef<Set<string>>(new Set());
  const reduceMotion = useRef(false);
  const saveData = useRef(false);

  const settings = payload?.settings;
  const items = payload?.items || [];
  const item = items[index] || null;

  // ---- 环境能力：减少动效 / 省流量，决定是否自动播放 ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion.current = motion.matches;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    saveData.current = Boolean(connection?.saveData);
    const onChange = () => { reduceMotion.current = motion.matches; };
    motion.addEventListener("change", onChange);
    return () => motion.removeEventListener("change", onChange);
  }, []);

  // ---- 首屏：先用本地缓存渲染，再拉最新配置比对版本 ----
  useEffect(() => {
    let alive = true;
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Payload & { cachedAt?: number };
        // 缓存只在 24 小时内作为兜底，超过就等网络结果。
        if (cached?.items && Date.now() - Number(cached.cachedAt || 0) < 86400000) setPayload({ settings: cached.settings, items: cached.items, version: cached.version });
      }
    } catch { /* 缓存损坏直接走网络 */ }

    publicRequest<Payload>("/api/v1/home-banners?platform=web")
      .then((next) => {
        if (!alive || !next) return;
        setPayload(next);
        try {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...next, cachedAt: Date.now() }));
        } catch { /* 存储已满不影响展示 */ }
      })
      .catch(() => { /* 网络异常时继续使用缓存 */ });
    return () => { alive = false; };
  }, []);

  // ---- 容器宽度：高度只跟随配置与容器宽度，不跟随媒体 ----
  useEffect(() => {
    const node = shellRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width || 0;
      setWidth(Math.round(next));
    });
    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [payload]);

  const height = useMemo(() => {
    if (!settings || !width) return 0;
    const device = width < 768 ? "mobile" : width < 1280 ? "tablet" : "desktop";
    if (settings.sizeMode === "fixed") return settings.heights[device];
    return Math.round(width / ratioValue(settings.coverRatio));
  }, [settings, width]);

  const next = useCallback((manual = false) => {
    setIndex((current) => (items.length ? (current + 1) % items.length : 0));
    if (manual) setPaused(false);
  }, [items.length]);

  // ---- 计时器：整个轮播只有这一个，切换内容或暂停时先清掉 ----
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!settings?.enabled || !item || items.length < 2 || !settings.autoplay || paused) return;
    if (reduceMotion.current) return;
    // 视频由播放结束/到达上限触发切换，不额外计时。
    if (item.mediaType === "video" && !posterOnly) return;
    const duration = Math.max(1500, item.displayMs || settings.imageDurationMs);
    timerRef.current = window.setTimeout(() => next(), duration);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [settings, item, items.length, paused, posterOnly, next, index]);

  // ---- 曝光：每次停留上报一次，服务端 30 秒窗口内自动去重 ----
  useEffect(() => {
    if (!item) return;
    const key = `${item.id}:${index}`;
    if (reportedRef.current.has(key)) return;
    reportedRef.current.add(key);
    track({ banner_id: item.id, event: "impression" });
  }, [item, index]);

  // ---- 视频生命周期：切走、离开视口、页面隐藏、组件销毁都必须停止 ----
  useEffect(() => {
    if (!item || item.mediaType !== "video" || posterOnly) return;
    if (!settings?.videoAutoplay || reduceMotion.current || (settings.dataSaverFallback && saveData.current)) {
      setPosterOnly(true);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    // 这里只设一次初始音量；后续切换静音由独立副作用处理，
    // 否则每次点静音都会重置进度并重复上报 video_start。
    video.muted = settings.videoMuted ? muted : false;
    video.currentTime = 0;
    setVideoProgress(0);
    const play = video.play();
    if (play?.catch) {
      play.catch(() => setPosterOnly(true));
    }
    track({ banner_id: item.id, event: "video_start" });

    const limitMs = Math.min(settings.videoMaxMs, item.videoDurationMs || settings.videoMaxMs);
    let stopped = false;
    const onTime = () => {
      if (!video.duration || !Number.isFinite(video.duration)) return;
      const elapsed = video.currentTime * 1000;
      setVideoProgress(Math.min(1, elapsed / limitMs));
      if (elapsed >= limitMs) {
        if (stopped) return;
        stopped = true;
        video.pause();
        track({ banner_id: item.id, event: "video_complete", duration_ms: Math.round(elapsed) });
        next();
      }
    };
    const onEnded = () => {
      if (stopped) return;
      stopped = true;
      track({ banner_id: item.id, event: "video_complete", duration_ms: Math.round((video.currentTime || 0) * 1000) });
      next();
    };
    const onError = () => setPosterOnly(true);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    return () => {
      stopped = true;
      video.pause();
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [item, posterOnly, settings, next]);

  // 静音切换：只改音量，不打断播放，也不重新计时。
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = settings?.videoMuted ? muted : false;
  }, [muted, settings?.videoMuted, index, posterOnly]);

  // 离开视口 / 标签页不可见 / 进入后台：暂停当前视频，回来再继续。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") video.pause();
      else if (!posterOnly && !paused) void video.play().catch(() => setPosterOnly(true));
    };
    const observer = typeof IntersectionObserver !== "undefined" && shellRef.current
      ? new IntersectionObserver((entries) => {
          const visible = entries[0]?.isIntersecting && (entries[0]?.intersectionRatio || 0) > 0.35;
          if (!visible) video.pause();
          else if (!posterOnly && !paused && document.visibilityState === "visible") void video.play().catch(() => setPosterOnly(true));
        }, { threshold: [0, 0.35, 0.7] })
      : null;
    observer?.observe(shellRef.current as Element);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [posterOnly, paused, index]);

  useEffect(() => {
    setPosterOnly(false);
    setVideoProgress(0);
  }, [index]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  // ---- 手势：跟手位移 + 松手吸附，循环时不出现空白帧 ----
  const suppressClick = useRef(false);
  const onPointerDown = (event: React.PointerEvent) => {
    if (items.length < 2) return;
    dragRef.current = { startX: event.clientX, delta: 0, active: true };
    setPaused(true);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const delta = event.clientX - dragRef.current.startX;
    dragRef.current.delta = delta;
    setDrag(delta);
  };
  const onPointerUp = () => {
    if (!dragRef.current.active) return;
    const delta = dragRef.current.delta;
    dragRef.current = { startX: 0, delta: 0, active: false };
    setDrag(0);
    if (Math.abs(delta) >= MIN_SWIPE) {
      // 滑动是一次翻页手势，不该同时被当成点击去跳转目标。
      suppressClick.current = true;
      setIndex((current) => {
        if (!items.length) return 0;
        const step = delta < 0 ? 1 : -1;
        return (current + step + items.length) % items.length;
      });
    }
    // 手动操作结束后重新开始计时，而不是沿用旧时刻。
    window.setTimeout(() => setPaused(false), 60);
  };

  const open = (target: BannerItem) => {
    if (!target.targetValid || target.targetType === "none" || !target.targetId) return;
    track({ banner_id: target.id, event: "click" });
    if (target.targetType === "post") onOpenPost?.(target.targetId);
    else onOpenSeries?.(target.targetId);
  };

  if (!settings?.enabled || !items.length) return null;

  const focusPosition = item?.focus || settings.focus;
  const objectPosition = focusPosition === "top" ? "center top" : focusPosition === "bottom" ? "center bottom" : "center center";
  const showVideo = item?.mediaType === "video" && Boolean(item.videoUrl) && !posterOnly;

  return (
    <div className={`hb-carousel ${className}`.trim()} ref={shellRef}>
      <div
        className={`hb-frame${item?.targetType !== "none" && item?.targetValid ? " is-link" : ""}`}
        style={{
          height: height ? `${height}px` : undefined,
          borderRadius: `${settings.radius}px`,
          // 高度没算出来前先占位，避免首帧塌陷导致卡池上跳。
          minHeight: height ? undefined : 120,
        }}
        role={item?.targetType !== "none" && item?.targetValid ? "button" : "group"}
        tabIndex={item?.targetType !== "none" && item?.targetValid ? 0 : -1}
        aria-label={item?.alt || "首页推荐"}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (item) open(item);
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && item) {
            event.preventDefault();
            open(item);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {items.map((entry, position) => {
          const active = position === index;
          const offset = position === index ? drag : 0;
          // 只渲染当前项与相邻项，其余不下载媒体。
          const near = active || Math.abs(position - index) === 1 || (index === 0 && position === items.length - 1) || (index === items.length - 1 && position === 0);
          if (!near) return null;
          const entryFocus = entry.focus || settings.focus;
          const entryPosition = entryFocus === "top" ? "center top" : entryFocus === "bottom" ? "center bottom" : "center center";
          return (
            <div
              key={entry.id}
              className={`hb-slide${active ? " is-active" : ""}`}
              style={{
                transform: `translate3d(calc(${active ? offset : 0}px + ${(position - index) * 100}%),0,0)`,
                transition: dragRef.current.active ? "none" : `transform ${settings.transitionMs}ms cubic-bezier(.22,.61,.36,1)`,
                opacity: active ? 1 : 0,
                pointerEvents: active ? "auto" : "none",
              }}
              aria-hidden={!active}
            >
              {entry.mediaType === "image" && entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt={entry.alt || ""}
                  loading={active ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  style={{ objectFit: settings.fitMode, objectPosition: entryPosition }}
                  onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                />
              ) : null}
              {entry.mediaType === "video" ? (
                <>
                  {entry.posterUrl ? (
                    <img
                      src={entry.posterUrl}
                      alt={entry.alt || ""}
                      className="hb-poster"
                      loading={active ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                      style={{ objectFit: settings.fitMode, objectPosition: entryPosition, opacity: active && showVideo ? 0 : 1 }}
                    />
                  ) : null}
                  {active ? (
                    <video
                      ref={videoRef}
                      className="hb-video"
                      src={entry.videoUrl || undefined}
                      poster={entry.posterUrl || undefined}
                      muted={settings.videoMuted ? muted : false}
                      playsInline
                      preload="metadata"
                      disablePictureInPicture
                      controls={false}
                      style={{ objectFit: settings.fitMode, objectPosition: entryPosition, opacity: showVideo ? 1 : 0 }}
                    />
                  ) : null}
                </>
              ) : null}
              {!entry.imageUrl && !entry.posterUrl && entry.mediaType === "image" ? (
                <div className="hb-fallback" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}

        {item?.mediaType === "video" && item.videoUrl && !posterOnly && settings.allowUnmute ? (
          <button
            type="button"
            className="hb-mute"
            aria-label={muted ? "取消静音" : "静音"}
            onClick={(event) => {
              event.stopPropagation();
              setMuted((value) => !value);
              if (videoRef.current) videoRef.current.muted = !muted;
            }}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        ) : null}

        {item?.mediaType === "video" && !posterOnly ? (
          <span className="hb-progress" aria-hidden="true"><i style={{ width: `${Math.round(videoProgress * 100)}%` }} /></span>
        ) : null}

        {item?.mediaType === "video" && posterOnly && item.targetValid ? (
          <span className="hb-play" aria-hidden="true">点击查看</span>
        ) : null}
      </div>

      {settings.showIndicator && items.length > 1 ? (
        <div className="hb-dots" role="tablist" aria-label="推荐位切换">
          {items.map((entry, position) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={position === index}
              aria-label={`第 ${position + 1} 项`}
              className={position === index ? "is-active" : ""}
              onClick={(event) => {
                event.stopPropagation();
                setIndex(position);
                setPaused(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
