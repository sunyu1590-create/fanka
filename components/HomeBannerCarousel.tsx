"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { cloudFetch } from "@/lib/cloud";
import {
  networkProfile,
  preloadMedia,
  readBannerSession,
  readBannerSnapshot,
  readCachedMediaUrl,
  saveBannerSession,
  saveBannerSnapshot,
  type BannerCachePayload,
} from "@/lib/home-banner-cache";

/**
 * 首页推荐位：图片与视频混合轮播。
 *
 * 一条时间线同时承载图片与视频：同一时刻只渲染一个媒体、只有一个计时器、
 * 只有当前项的视频处于播放状态；容器高度只由配置决定，绝不跟随媒体原始比例变化。
 *
 * 缓存：先内存 / 本地快照渲染，再后台校验版本局部替换；媒体按版本 URL 命中
 * 浏览器 HTTP 缓存，封面等小图额外落 IndexedDB，弱网与离线仍可展示。
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
  videoPlayMode: "full" | "timed";
  videoLoop: boolean;
  preloadMode: "off" | "next" | "adjacent";
  showText: boolean;
  cacheTtlHours: number;
  videoMaxMb: number;
  videoMaxCount: number;
  videoMaxWidth: number;
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
  targetType: "none" | "post" | "series" | "external";
  targetId: string | null;
  targetUrl: string | null;
  targetValid: boolean;
  focus: "center" | "top" | "bottom";
  alt: string;
  title: string;
  subtitle: string;
  description: string;
  showText: boolean;
  fitMode: "cover" | "contain" | null;
  posterFit: "cover" | "contain";
  updatedAt: string;
};

type Payload = Omit<BannerCachePayload, "settings" | "items"> & {
  settings: BannerSettings;
  items: BannerItem[];
  version: string;
};

const SESSION_KEY = "heika.bannerSession.v1";
const MIN_SWIPE = 46;
const VERSION_CHECK_MS = 60_000;

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

function focusStyle(value: "center" | "top" | "bottom") {
  return value === "top" ? "center top" : value === "bottom" ? "center bottom" : "center center";
}

export default function HomeBannerCarousel({
  onOpenPost,
  onOpenSeries,
  className = "",
  accountId = "",
}: {
  onOpenPost?: (id: string) => void;
  onOpenSeries?: (id: string) => void;
  className?: string;
  /** 用于隔离不同账号的本地缓存；为空按游客处理 */
  accountId?: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [drag, setDrag] = useState(0);
  const [width, setWidth] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [posterOnly, setPosterOnly] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState({ saveData: false, wifi: true, slow: false });

  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; delta: number; active: boolean }>({ startX: 0, delta: 0, active: false });
  const reportedRef = useRef<Set<string>>(new Set());
  const reduceMotion = useRef(false);
  const resumeRef = useRef<{ bannerId: string; positionMs: number } | null>(null);
  const positionRef = useRef(0);
  const mutedRef = useRef(true);
  const payloadRef = useRef<Payload | null>(null);
  const indexRef = useRef(0);
  const lastCheckRef = useRef(0);
  const restoredRef = useRef(false);
  const suppressClick = useRef(false);
  const noticeTimer = useRef<number | null>(null);

  const settings = payload?.settings;
  const items = payload?.items || [];
  const item = items[index] || null;

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2600);
  }, []);

  useEffect(() => { payloadRef.current = payload; }, [payload]);
  useEffect(() => { indexRef.current = index; }, [index]);

  // ---- 环境能力：减少动效 / 省流量 / 网络类型 ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion.current = motion.matches;
    setProfile(networkProfile());
    const onChange = () => { reduceMotion.current = motion.matches; };
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    motion.addEventListener("change", onChange);
    connection?.addEventListener?.("change", () => setProfile(networkProfile()));
    return () => motion.removeEventListener("change", onChange);
  }, []);

  const applyPayload = useCallback((next: Payload) => {
    const previous = payloadRef.current;
    const currentId = previous ? previous.items[indexRef.current]?.id : null;
    payloadRef.current = next;
    setPayload(next);
    if (!next.items.length) return;
    if (currentId) {
      const found = next.items.findIndex((entry) => entry.id === currentId);
      setIndex(found >= 0 ? found : Math.min(indexRef.current, next.items.length - 1));
    }
  }, []);

  // ---- 首屏：内存 / 本地快照先出内容，再后台校验版本 ----
  useEffect(() => {
    let alive = true;
    const abort = new AbortController();
    restoredRef.current = false;
    (async () => {
      const cached = await readBannerSnapshot<Payload>("web", accountId);
      // 离线兜底也要守有效期：超过服务端下发的 ttl 就不再展示旧配置。
      const ttlMs = Number(cached?.payload?.ttlSeconds || 0) * 1000;
      const expired = Boolean(ttlMs) && Boolean(cached) && Date.now() - Number(cached?.savedAt || 0) > ttlMs;
      if (alive && cached?.payload?.items?.length && !expired) {
        applyPayload(cached.payload);
        setFromCache(true);
      }
      try {
        const response = await cloudFetch("/api/v1/home-banners?platform=web", { signal: abort.signal, cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        const next = result?.data as Payload | undefined;
        if (!alive || !next?.items) return;
        applyPayload(next);
        setFromCache(false);
        saveBannerSnapshot("web", accountId, next);
      } catch {
        // 网络异常时继续使用本地快照，界面不清空、不重放加载动画。
      }
    })();
    return () => { alive = false; abort.abort(); };
  }, [accountId, applyPayload]);

  // ---- 恢复上次停留的轮播位置与视频进度 ----
  useEffect(() => {
    if (!payload?.items.length || restoredRef.current) return;
    restoredRef.current = true;
    const session = readBannerSession();
    if (!session) return;
    const target = payload.items.findIndex((entry) => entry.id === session.bannerId);
    if (target < 0) return;
    setIndex(target);
    if (session.positionMs > 0) resumeRef.current = { bannerId: session.bannerId, positionMs: session.positionMs };
  }, [payload]);

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
    if (manual) setUserPaused(false);
  }, [items.length]);

  const goTo = useCallback((position: number) => {
    setIndex((current) => {
      if (!items.length) return 0;
      const step = position > current ? 1 : -1;
      return (current + step + items.length) % items.length;
    });
  }, [items.length]);

  // 视频上限：完整播放模式取视频时长，定时模式取条目/全局设定，二者都不超过全局上限。
  const playLimitMs = useMemo(() => {
    if (!item || !settings) return 0;
    const byItem = item.displayMs || settings.videoMaxMs;
    if (settings.videoPlayMode === "timed") return Math.max(1200, Math.min(byItem, settings.videoMaxMs));
    return Math.max(1200, Math.min(item.videoDurationMs || settings.videoMaxMs, settings.videoMaxMs));
  }, [item, settings]);

  const autoAdvance = Boolean(settings?.enabled && settings.autoplay && items.length > 1 && !userPaused && !hovered && !dragging && !reduceMotion.current);

  // ---- 统一时间线：图片走定时器，视频由播放事件与看门狗驱动 ----
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!settings?.enabled || !item || !autoAdvance) return;
    const blockedVideo = item.mediaType === "video" && !posterOnly && !failed[item.id];
    if (blockedVideo) {
      // 视频：兜底看门狗，防止个别浏览器不触发 ended 导致卡住。
      timerRef.current = window.setTimeout(() => next(), playLimitMs + 2500);
    } else {
      const duration = Math.max(1500, item.displayMs || settings.imageDurationMs);
      timerRef.current = window.setTimeout(() => next(), duration);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [settings, item, autoAdvance, posterOnly, failed, next, index, playLimitMs]);

  // ---- 曝光：每次停留上报一次，服务端 30 秒窗口内自动去重 ----
  useEffect(() => {
    if (!item) return;
    const key = `${item.id}:${index}`;
    if (reportedRef.current.has(key)) return;
    reportedRef.current.add(key);
    track({ banner_id: item.id, event: "impression" });
  }, [item, index]);

  // ---- 媒体解析：命中本地缓存时直接用 Blob URL，未命中先用网络 URL ----
  useEffect(() => {
    if (!item) return;
    let alive = true;
    const urls = [item.imageUrl, item.posterUrl].filter((value): value is string => Boolean(value));
    if (!urls.length) return;
    void Promise.all(urls.map(async (url) => [url, await readCachedMediaUrl(url)] as const)).then((pairs) => {
      if (!alive) return;
      setMediaUrls((current) => {
        const nextMap = { ...current };
        for (const [url, objectUrl] of pairs) if (objectUrl) nextMap[url] = objectUrl;
        return nextMap;
      });
    });
    return () => { alive = false; };
  }, [item]);

  // ---- 智能预加载：当前项优先，按策略预取后续项；离开首页立即取消 ----
  useEffect(() => {
    if (!settings?.enabled || !items.length) return;
    const abort = new AbortController();
    const push = (entry: BannerItem | undefined) => {
      if (!entry) return;
      const tasks: { url: string; kind: "image" | "video" }[] = [];
      if (entry.imageUrl) tasks.push({ url: entry.imageUrl, kind: "image" });
      if (entry.posterUrl) tasks.push({ url: entry.posterUrl, kind: "image" });
      return tasks;
    };
    const queue = [...(push(item) || [])];
    if (settings.preloadMode !== "off") queue.push(...(push(items[(index + 1) % items.length]) || []));
    if (settings.preloadMode === "adjacent") queue.push(...(push(items[(index + 2) % items.length]) || []));
    // 视频本体只预取「下一条」，且仅在 Wi-Fi、非省流、非弱网时进行：
    // 下载完成后切到该条即为本地播放，不会与播放器重复请求。
    const allowVideo = profile.wifi && !profile.saveData && !profile.slow && !settings.dataSaverFallback;
    const nextItem = items[(index + 1) % items.length];
    if (settings.preloadMode !== "off" && allowVideo && nextItem?.mediaType === "video" && nextItem.videoUrl) {
      queue.push({ url: nextItem.videoUrl, kind: "video" });
    }
    void preloadMedia(queue, { allowVideo: allowVideo && !profile.saveData, signal: abort.signal, concurrency: 3 }).then(async () => {
      if (abort.signal.aborted) return;
      const urls = queue.map((task) => task.url);
      const pairs = await Promise.all(urls.map(async (url) => [url, await readCachedMediaUrl(url)] as const));
      setMediaUrls((current) => {
        const nextMap = { ...current };
        for (const [url, objectUrl] of pairs) if (objectUrl) nextMap[url] = objectUrl;
        return nextMap;
      });
    });
    return () => abort.abort();
  }, [settings, items, index, item, profile]);

  // ---- 视频生命周期 ----
  useEffect(() => {
    if (!item || item.mediaType !== "video" || posterOnly || failed[item.id]) return;
    if (!settings?.videoAutoplay || reduceMotion.current || (settings.dataSaverFallback && profile.saveData)) {
      setPosterOnly(true);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.muted = settings.videoMuted ? mutedRef.current : false;
    video.loop = Boolean(settings.videoLoop) && settings.videoPlayMode === "full";
    const resume = resumeRef.current;
    if (resume && resume.bannerId === item.id && resume.positionMs > 1200) {
      const target = resume.positionMs / 1000;
      if (!item.videoDurationMs || target < item.videoDurationMs / 1000 - 0.6) {
        try { video.currentTime = target; } catch { /* 元数据未就绪时忽略，loadedmetadata 会再试一次 */ }
      }
    } else {
      try { video.currentTime = 0; } catch { /* 同上 */ }
    }
    setVideoProgress(0);
    positionRef.current = video.currentTime * 1000;
    if (!userPaused) {
      const play = video.play();
      if (play?.catch) play.catch(() => setPosterOnly(true));
      track({ banner_id: item.id, event: "video_start" });
    } else {
      video.pause();
    }

    let stopped = false;
    const onLoaded = () => {
      const pending = resumeRef.current;
      if (pending && pending.bannerId === item.id && pending.positionMs > 1200) {
        try { video.currentTime = pending.positionMs / 1000; } catch { /* 忽略 */ }
        resumeRef.current = null;
      }
    };
    const onTime = () => {
      if (!video.duration || !Number.isFinite(video.duration)) return;
      const elapsed = video.currentTime * 1000;
      positionRef.current = elapsed;
      setVideoProgress(Math.min(1, elapsed / Math.max(1, playLimitMs)));
      if (elapsed < playLimitMs) return;
      if (stopped) return;
      if (settings.videoLoop && settings.videoPlayMode === "full" && !video.loop) {
        // 循环模式下由 video.loop 处理，不在这里切换。
        return;
      }
      stopped = true;
      video.pause();
      track({ banner_id: item.id, event: "video_complete", duration_ms: Math.round(elapsed) });
      next();
    };
    const onEnded = () => {
      if (stopped) return;
      stopped = true;
      track({ banner_id: item.id, event: "video_complete", duration_ms: Math.round((video.currentTime || 0) * 1000) });
      next();
    };
    const onError = () => setPosterOnly(true);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    return () => {
      stopped = true;
      video.pause();
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [item, posterOnly, failed, settings, next, playLimitMs, profile.saveData, userPaused]);

  // 静音切换：只改音量，不打断播放，也不重新计时。
  useEffect(() => {
    mutedRef.current = muted;
    const video = videoRef.current;
    if (video) video.muted = settings?.videoMuted ? muted : false;
  }, [muted, settings?.videoMuted, index, posterOnly]);

  // 离开视口 / 标签页不可见 / 进入后台：暂停当前视频，回来再继续。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const resume = () => {
      if (posterOnly || userPaused || document.visibilityState !== "visible") return;
      void video.play().catch(() => setPosterOnly(true));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        video.pause();
        saveBannerSession({ bannerId: item?.id || "", index: indexRef.current, positionMs: Math.round(positionRef.current) });
      } else resume();
    };
    const observer = typeof IntersectionObserver !== "undefined" && shellRef.current
      ? new IntersectionObserver((entries) => {
          const visible = entries[0]?.isIntersecting && (entries[0]?.intersectionRatio || 0) > 0.35;
          if (!visible) video.pause();
          else resume();
        }, { threshold: [0, 0.35, 0.7] })
      : null;
    observer?.observe(shellRef.current as Element);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [posterOnly, userPaused, index, item?.id]);

  // 明确暂停：立即停表并给出可见状态，而不是"看起来卡住"。
  useEffect(() => {
    const video = videoRef.current;
    if (userPaused) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      video?.pause();
    } else if (video && !posterOnly && document.visibilityState === "visible") {
      void video.play().catch(() => undefined);
    }
  }, [userPaused, posterOnly]);

  useEffect(() => {
    setPosterOnly(false);
    setVideoProgress(0);
    positionRef.current = 0;
  }, [index]);

  // 全屏状态跟随浏览器，退出全屏时恢复原布局。
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 版本校验：回到前台或页面常驻时低频比对，命中差异立即换新配置。
  useEffect(() => {
    if (!payload?.version) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckRef.current < VERSION_CHECK_MS) return;
      lastCheckRef.current = Date.now();
      try {
        const response = await fetch("/api/v1/home-banners/version", { cache: "no-store" });
        const result = await response.json();
        // 服务端 RPC 返回的是 +00:00 时间串，本地是 toISOString 的 Z 串，
        // 直接比字符串永远不相等；统一转成毫秒再比，允许 1.5 秒的格式/时区误差。
        const nextStamp = Date.parse(String(result?.data?.updatedAt || ""));
        const currentStamp = Date.parse(String(payloadRef.current?.updatedAt || ""));
        if (!alive || !Number.isFinite(nextStamp) || !Number.isFinite(currentStamp)) return;
        if (Math.abs(nextStamp - currentStamp) < 1500) return;
        const fresh = await cloudFetch("/api/v1/home-banners?platform=web", { cache: "no-store" });
        if (!fresh.ok) return;
        const body = await fresh.json();
        const nextPayload = body?.data as Payload | undefined;
        if (!alive || !nextPayload?.items) return;
        applyPayload(nextPayload);
        saveBannerSnapshot("web", accountId, nextPayload);
        flash("轮播内容已更新");
      } catch {
        // 校验失败保持现有内容，不打扰用户。
      }
    };
    const onVisible = () => { void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(onVisible, VERSION_CHECK_MS * 2);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
  }, [payload?.version, accountId, applyPayload, flash]);

  // 退出首页 / 关闭页面时保存位置，下次回来继续。
  useEffect(() => {
    const save = () => {
      const current = payloadRef.current?.items[indexRef.current];
      if (!current) return;
      saveBannerSession({ bannerId: current.id, index: indexRef.current, positionMs: Math.round(positionRef.current) });
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  // ---- 手势：跟手位移 + 松手吸附，循环时不出现空白帧 ----
  const onPointerDown = (event: React.PointerEvent) => {
    if (items.length < 2) return;
    // 控件与重试按钮是独立交互目标：一旦在这里捕获指针，浏览器会把后续 click 改派给容器，
    // 按钮就再也收不到点击（触屏上尤其明显）。
    if ((event.target as HTMLElement).closest(".hb-controls, .hb-retry")) return;
    dragRef.current = { startX: event.clientX, delta: 0, active: true };
    setDragging(true);
    setDrag(0);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    setDrag(event.clientX - dragRef.current.startX);
  };
  const onPointerUp = () => {
    if (!dragRef.current.active) return;
    const delta = dragRef.current.delta;
    dragRef.current = { startX: 0, delta: 0, active: false };
    setDragging(false);
    setDrag(0);
    if (Math.abs(delta) >= MIN_SWIPE) {
      suppressClick.current = true;
      setIndex((current) => {
        if (!items.length) return 0;
        const step = delta < 0 ? 1 : -1;
        return (current + step + items.length) % items.length;
      });
    }
  };

  const open = (target: BannerItem) => {
    if (!target.targetValid || target.targetType === "none") return;
    if (target.targetType === "external") {
      const url = target.targetUrl || "";
      if (!url) return;
      track({ banner_id: target.id, event: "click" });
      // 站内路径用同页跳转，外部地址新开标签页并断开 opener，避免钓鱼页反向控制。
      if (url.startsWith("/")) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!target.targetId) return;
    track({ banner_id: target.id, event: "click" });
    if (target.targetType === "post") onOpenPost?.(target.targetId);
    else onOpenSeries?.(target.targetId);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen?.();
    } catch {
      flash("当前浏览器不支持全屏");
    }
  };

  const retry = () => {
    if (!item) return;
    setFailed((current) => ({ ...current, [item.id]: false }));
    setPosterOnly(false);
    setMediaUrls((current) => {
      const nextMap = { ...current };
      if (item.videoUrl) delete nextMap[item.videoUrl];
      if (item.posterUrl) delete nextMap[item.posterUrl];
      if (item.imageUrl) delete nextMap[item.imageUrl];
      return nextMap;
    });
    flash("正在重试");
  };

  // 当前项的媒体地址在条目切换时锁定，避免缓存回填时更换 src 造成闪烁。
  const frozenSrc = useMemo(() => {
    if (!item) return { image: null as string | null, video: null as string | null, poster: null as string | null };
    return {
      image: item.imageUrl ? mediaUrls[item.imageUrl] || item.imageUrl : null,
      video: item.videoUrl ? mediaUrls[item.videoUrl] || item.videoUrl : null,
      poster: item.posterUrl ? mediaUrls[item.posterUrl] || item.posterUrl : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!settings?.enabled || !items.length) return null;

  const isLink = Boolean(item?.targetType !== "none" && item?.targetValid);
  const fit = item?.fitMode || settings.fitMode;
  const position = focusStyle(item?.focus || settings.focus);
  const showVideo = item?.mediaType === "video" && Boolean(item.videoUrl) && !posterOnly && !failed[item.id];
  const duration = Math.max(1500, item?.displayMs || settings.imageDurationMs);
  const copyVisible = Boolean(settings.showText && item?.showText && (item.title || item.subtitle || item.description));
  const paused = userPaused || hovered || dragging;

  return (
    <div className={`hb-carousel ${className}`.trim()} ref={shellRef}>
      <div
        className={`hb-frame${isLink ? " is-link" : ""}${fullscreen ? " is-fullscreen" : ""}${paused ? " is-paused" : ""}`}
        style={{
          height: height ? `${height}px` : undefined,
          borderRadius: fullscreen ? 0 : `${settings.radius}px`,
          minHeight: height ? undefined : 120,
        }}
        role={isLink ? "button" : "group"}
        tabIndex={isLink ? 0 : -1}
        aria-label={item?.alt || item?.title || "首页推荐"}
        aria-roledescription="carousel"
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (item) open(item);
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && item) {
            event.preventDefault();
            open(item);
          }
          if (event.key === "ArrowRight") goTo(index + 1);
          if (event.key === "ArrowLeft") goTo(index - 1);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {items.map((entry, position2) => {
          const active = position2 === index;
          const offset = active ? drag : 0;
          const near = active || Math.abs(position2 - index) === 1 || (index === 0 && position2 === items.length - 1) || (index === items.length - 1 && position2 === 0);
          if (!near) return null;
          const entryFit = entry.fitMode || settings.fitMode;
          const entryPosition = focusStyle(entry.focus || settings.focus);
          const entryFailed = Boolean(failed[entry.id]);
          const entryImage = active ? frozenSrc.image : entry.imageUrl;
          const entryPoster = active ? frozenSrc.poster : entry.posterUrl;
          const entryVideo = active ? frozenSrc.video : entry.videoUrl;
          return (
            <div
              key={entry.id}
              className={`hb-slide${active ? " is-active" : ""}`}
              style={{
                transform: `translate3d(calc(${active ? offset : 0}px + ${(position2 - index) * 100}%),0,0)`,
                transition: dragRef.current.active ? "none" : `transform ${settings.transitionMs}ms cubic-bezier(.22,.61,.36,1), opacity ${Math.max(200, settings.transitionMs)}ms ease`,
                opacity: active ? 1 : 0,
                pointerEvents: active ? "auto" : "none",
              }}
              aria-hidden={!active}
            >
              {entry.mediaType === "image" && entryImage && !entryFailed ? (
                <img
                  src={entryImage}
                  alt={entry.alt || entry.title || ""}
                  loading={active ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  style={{ objectFit: entryFit, objectPosition: entryPosition }}
                  onError={() => setFailed((current) => ({ ...current, [entry.id]: true }))}
                />
              ) : null}
              {entry.mediaType === "video" && entryPoster ? (
                <img
                  src={entryPoster}
                  alt={entry.alt || entry.title || ""}
                  className="hb-poster"
                  loading={active ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  style={{ objectFit: entry.posterFit, objectPosition: entryPosition, opacity: active && showVideo ? 0 : 1 }}
                />
              ) : null}
              {active && entry.mediaType === "video" && entryVideo && !entryFailed ? (
                <video
                  ref={videoRef}
                  className="hb-video"
                  src={entryVideo}
                  poster={entryPoster || undefined}
                  muted={settings.videoMuted ? muted : false}
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  controls={false}
                  style={{ objectFit: entryFit, objectPosition: entryPosition, opacity: showVideo ? 1 : 0 }}
                  onError={() => setPosterOnly(true)}
                />
              ) : null}
              {!entryImage && !entryPoster ? <div className="hb-fallback" aria-hidden="true" /> : null}
              {active && copyVisible ? (
                <div className="hb-copy" onClick={(event) => event.stopPropagation()}>
                  {item?.title ? <strong>{item.title}</strong> : null}
                  {item?.subtitle ? <span className="hb-copy__sub">{item.subtitle}</span> : null}
                  {item?.description ? <p>{item.description}</p> : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {item?.mediaType === "video" && !showVideo ? (
          <span className="hb-play" aria-hidden="true">{failed[item.id] ? "加载失败" : "点击查看"}</span>
        ) : null}

        {failed[item.id] ? (
          <button type="button" className="hb-retry" onClick={(event) => { event.stopPropagation(); retry(); }}>
            <RefreshCw size={12} /> 重试
          </button>
        ) : null}

        <div className="hb-controls" onClick={(event) => event.stopPropagation()}>
          {item?.mediaType === "video" && showVideo && settings.allowUnmute ? (
            <button
              type="button"
              className="hb-mute"
              aria-label={muted ? "取消静音" : "静音"}
              onClick={() => {
                setMuted((value) => !value);
                if (videoRef.current) videoRef.current.muted = !muted;
              }}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          ) : null}
          {settings.autoplay && items.length > 1 ? (
            <button
              type="button"
              className="hb-mute"
              aria-label={userPaused ? "继续自动轮播" : "暂停自动轮播"}
              onClick={() => {
                setUserPaused((value) => {
                  if (!value) flash("已暂停自动轮播");
                  else flash("已继续自动轮播");
                  return !value;
                });
              }}
            >
              {userPaused ? <Play size={13} /> : <Pause size={13} />}
            </button>
          ) : null}
          <button type="button" className="hb-mute" aria-label={fullscreen ? "退出全屏" : "全屏查看"} onClick={() => void toggleFullscreen()}>
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>

        {item?.mediaType === "video" && showVideo ? (
          <span className="hb-progress" aria-hidden="true"><i style={{ width: `${Math.round(videoProgress * 100)}%` }} /></span>
        ) : settings.autoplay && items.length > 1 ? (
          <span className={`hb-progress hb-progress--auto${paused ? " is-paused" : ""}`} aria-hidden="true" key={`${item?.id}-${index}`}>
            <i style={{ ["--hb-duration" as string]: `${duration}ms` }} />
          </span>
        ) : null}

        {userPaused ? <span className="hb-badge">已暂停</span> : null}
        {notice ? <span className="hb-badge hb-badge--notice" role="status">{notice}</span> : null}
        {fromCache ? <span className="hb-badge hb-badge--cache">本地缓存 · 正在校验</span> : null}
      </div>

      {settings.showIndicator && items.length > 1 ? (
        <div className="hb-dots" role="tablist" aria-label="推荐位切换">
          {items.map((entry, position2) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={position2 === index}
              aria-label={`第 ${position2 + 1} 项${entry.title ? `：${entry.title}` : ""}`}
              className={position2 === index ? "is-active" : ""}
              onClick={(event) => { event.stopPropagation(); setIndex(position2); setUserPaused(false); }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
