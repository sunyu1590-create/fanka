/**
 * 首页轮播的三级缓存与智能预加载。
 *
 * L1 内存：本次会话内已解析的配置与媒体 Blob URL，切页返回零等待。
 * L2 本地：IndexedDB 保存配置快照 + 图片/封面/适量视频本体，关掉浏览器重开仍可秒开。
 * L3 服务端：最新配置与媒体文件，用版本指纹与资源 URL 版本号做增量校验。
 *
 * 设计约束：
 * - 不存放任何凭据；个性化数据按账号隔离（key 带 accountId）。
 * - 媒体优先走 HTTP 缓存（浏览器自身负责 Range/206），只在需要离线可用时才落 IndexedDB。
 * - 图片、视频各自独立预算，视频更严格；LRU 优先淘汰长期未访问、已失效的条目。
 * - 正在播放的资源由调用方通过 keepUrls 保护，不会被清理。
 */
import { readPublicCache, schedulePublicCacheWrite, removePublicCache } from "./public-content-cache";

export type BannerCachePayload = {
  settings: unknown;
  items: unknown[];
  version: string;
  revision?: string;
  ttlSeconds?: number;
  platform?: string;
  /** 最近更新时间：服务端用于版本比对，客户端据此判断是否需要重新拉取 */
  updatedAt?: string;
  count?: number;
};

export type BannerCacheRead<T = BannerCachePayload> = {
  payload: T;
  savedAt: number;
  stale: boolean;
};

export type MediaKind = "image" | "video";

type MediaRecord = {
  url: string;
  kind: MediaKind;
  blob: Blob;
  bytes: number;
  savedAt: number;
  accessedAt: number;
};

export type BannerCacheStats = {
  supported: boolean;
  entries: number;
  bytes: number;
  imageBytes: number;
  videoBytes: number;
  imageCount: number;
  videoCount: number;
  quotaBytes: number | null;
  usageBytes: number | null;
};

const MEDIA_DATABASE = "heika-home-media-v1";
const MEDIA_STORE = "assets";
const MEDIA_SCHEMA = 1;

/** 独立预算：图片（含封面）与视频分开计算，避免几段视频把封面挤掉。 */
const IMAGE_BUDGET = 64 * 1024 * 1024;
const VIDEO_BUDGET = 96 * 1024 * 1024;
const TOTAL_BUDGET = IMAGE_BUDGET + VIDEO_BUDGET;
/** 单文件上限：超过的视频交给浏览器 HTTP 缓存，不占 IndexedDB 预算。 */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
/** 媒体过期：超过 14 天未访问的条目在清理时优先淘汰。 */
const MEDIA_STALE_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_KEY = "heika.bannerSession.v2";

let databasePromise: Promise<IDBDatabase | null> | undefined;
const memoryUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let pruneTimer: number | null = null;

function openMediaDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(MEDIA_DATABASE, MEDIA_SCHEMA);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        const store = database.createObjectStore(MEDIA_STORE, { keyPath: "url" });
        store.createIndex("accessedAt", "accessedAt");
        store.createIndex("kind", "kind");
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openMediaDatabase().then((database) => {
    if (!database) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = database.transaction(MEDIA_STORE, mode);
        const request = run(tx.objectStore(MEDIA_STORE));
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
        request.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

/* ---------------- L1/L2：配置快照 ---------------- */

function snapshotKey(platform: string, account: string) {
  // 未登录用 guest，登录用户各自独立，切换账号不会看到上一个账号的个性化配置。
  return `home-banners:v2:${platform}:${account || "guest"}`;
}

export function bannerSnapshotKey(platform: string, account: string) {
  return snapshotKey(platform, account);
}

export async function readBannerSnapshot<T = BannerCachePayload>(platform: string, account: string) {
  return (await readPublicCache<T>(snapshotKey(platform, account), 6 * 60 * 60 * 1000)) as BannerCacheRead<T> | null;
}

export function saveBannerSnapshot(platform: string, account: string, payload: BannerCachePayload) {
  schedulePublicCacheWrite(snapshotKey(platform, account), payload);
}

export async function dropBannerSnapshot(platform: string, account: string) {
  await removePublicCache(snapshotKey(platform, account));
}

/* ---------------- L2：媒体本体 ---------------- */

function remember(url: string, blob: Blob) {
  const existing = memoryUrls.get(url);
  if (existing) URL.revokeObjectURL(existing);
  const objectUrl = URL.createObjectURL(blob);
  memoryUrls.set(url, objectUrl);
  return objectUrl;
}

/** 只读命中：返回可直接用于 src 的 Blob URL；未命中返回 null（调用方继续用网络 URL）。 */
export async function readCachedMediaUrl(url: string): Promise<string | null> {
  if (!url) return null;
  const memory = memoryUrls.get(url);
  if (memory) return memory;
  const record = await transaction<MediaRecord>("readwrite", (store) => {
    const request = store.get(url);
    request.onsuccess = () => {
      const found = request.result;
      if (found) {
        found.accessedAt = Date.now();
        store.put(found);
      }
    };
    return request;
  });
  if (!record?.blob?.size) return null;
  return remember(url, record.blob);
}

export type CacheMediaOptions = {
  kind: MediaKind;
  signal?: AbortSignal;
  /** 省流量或移动网络时不允许写入视频 */
  allowVideo?: boolean;
};

/** 下载并写入 L2。命中已有条目时直接返回，不重复下载。 */
export async function cacheMedia(url: string, options: CacheMediaOptions): Promise<string | null> {
  if (!url) return null;
  const memory = memoryUrls.get(url);
  if (memory) return memory;
  const existing = inflight.get(url);
  if (existing) return existing;

  const limit = options.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (options.kind === "video" && options.allowVideo === false) return null;

  const task = (async () => {
    const cached = await readCachedMediaUrl(url);
    if (cached) return cached;
    try {
      const response = await fetch(url, {
        signal: options.signal,
        credentials: "omit",
        // 允许浏览器 HTTP 缓存直接命中，避免重复走网络。
        cache: "default",
      });
      if (!response.ok) return null;
      const length = Number(response.headers.get("content-length") || 0);
      if (length && length > limit) return null;
      const blob = await response.blob();
      if (!blob.size || blob.size > limit) return null;
      const saved = await transaction<IDBValidKey>("readwrite", (store) => store.put({
        url,
        kind: options.kind,
        blob,
        bytes: blob.size,
        savedAt: Date.now(),
        accessedAt: Date.now(),
      } satisfies MediaRecord));
      if (saved === null) return null;
      schedulePrune();
      return remember(url, blob);
    } catch {
      return null;
    }
  })().finally(() => {
    inflight.delete(url);
  });

  inflight.set(url, task);
  return task;
}

export function forgetMemoryMedia(url?: string) {
  if (url) {
    const existing = memoryUrls.get(url);
    if (existing) URL.revokeObjectURL(existing);
    memoryUrls.delete(url);
    return;
  }
  for (const objectUrl of memoryUrls.values()) URL.revokeObjectURL(objectUrl);
  memoryUrls.clear();
}

function schedulePrune() {
  if (typeof window === "undefined" || pruneTimer !== null) return;
  pruneTimer = window.setTimeout(() => {
    pruneTimer = null;
    void pruneMediaCache();
  }, 4_000);
}

/** LRU 淘汰：先清过期，再按最后访问时间从旧到新淘汰，直到回到预算内。 */
export async function pruneMediaCache(keepUrls: string[] = []) {
  const database = await openMediaDatabase();
  if (!database) return;
  const keep = new Set(keepUrls.filter(Boolean));
  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(MEDIA_STORE, "readwrite");
      const store = tx.objectStore(MEDIA_STORE);
      const request = store.getAll() as IDBRequest<MediaRecord[]>;
      request.onsuccess = () => {
        const records = (request.result || []).filter((record) => record?.url);
        const now = Date.now();
        let imageBytes = 0;
        let videoBytes = 0;
        const alive: MediaRecord[] = [];
        for (const record of records) {
          const expired = now - (record.accessedAt || record.savedAt || 0) > MEDIA_STALE_MS;
          if (expired && !keep.has(record.url)) {
            store.delete(record.url);
            const objectUrl = memoryUrls.get(record.url);
            if (objectUrl) { URL.revokeObjectURL(objectUrl); memoryUrls.delete(record.url); }
            continue;
          }
          alive.push(record);
          if (record.kind === "video") videoBytes += record.bytes;
          else imageBytes += record.bytes;
        }
        alive.sort((left, right) => (left.accessedAt || 0) - (right.accessedAt || 0));
        for (const record of alive) {
          if (keep.has(record.url)) continue;
          const overImage = imageBytes > IMAGE_BUDGET && record.kind !== "video";
          const overVideo = videoBytes > VIDEO_BUDGET && record.kind === "video";
          const overTotal = imageBytes + videoBytes > TOTAL_BUDGET;
          if (!overImage && !overVideo && !overTotal) continue;
          store.delete(record.url);
          if (record.kind === "video") videoBytes -= record.bytes; else imageBytes -= record.bytes;
          const objectUrl = memoryUrls.get(record.url);
          if (objectUrl) { URL.revokeObjectURL(objectUrl); memoryUrls.delete(record.url); }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function bannerCacheStats(): Promise<BannerCacheStats> {
  const empty: BannerCacheStats = {
    supported: false, entries: 0, bytes: 0, imageBytes: 0, videoBytes: 0,
    imageCount: 0, videoCount: 0, quotaBytes: null, usageBytes: null,
  };
  if (typeof indexedDB === "undefined") return empty;
  const records = await transaction<MediaRecord[]>("readonly", (store) => store.getAll() as IDBRequest<MediaRecord[]>);
  const list = (records || []).filter((record) => record?.bytes);
  let imageBytes = 0;
  let videoBytes = 0;
  let imageCount = 0;
  let videoCount = 0;
  for (const record of list) {
    if (record.kind === "video") { videoBytes += record.bytes; videoCount += 1; }
    else { imageBytes += record.bytes; imageCount += 1; }
  }
  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota ?? null;
      usageBytes = estimate.usage ?? null;
    }
  } catch { /* 浏览器不支持配额查询时只展示已知字节数 */ }
  return {
    supported: true,
    entries: list.length,
    bytes: imageBytes + videoBytes,
    imageBytes,
    videoBytes,
    imageCount,
    videoCount,
    quotaBytes,
    usageBytes,
  };
}

export async function clearBannerMediaCache() {
  forgetMemoryMedia();
  const database = await openMediaDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(MEDIA_STORE, "readwrite");
      tx.objectStore(MEDIA_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* ---------------- 预加载调度 ---------------- */

export type PreloadTask = { url: string; kind: MediaKind };

/**
 * 预加载一批资源：并发受限、去重、可整体取消。
 * 视频只取元数据与封面，本体是否下载由调用方根据网络类型决定。
 */
export function preloadMedia(tasks: PreloadTask[], options: { allowVideo: boolean; signal?: AbortSignal; concurrency?: number }) {
  const limit = options.concurrency || 3;
  const queue = tasks.filter((task) => task.url && (task.kind === "image" || options.allowVideo));
  let cursor = 0;
  const run = async () => {
    while (cursor < queue.length) {
      const current = queue[cursor++];
      if (options.signal?.aborted) return;
      await cacheMedia(current.url, { kind: current.kind, signal: options.signal, allowVideo: options.allowVideo });
    }
  };
  return Promise.all(Array.from({ length: Math.min(limit, queue.length) }, run)).then(() => undefined);
}

/** 弱网判定：用于决定是否值得预下载视频。 */
export function networkProfile() {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string; downlink?: number; type?: string };
  }).connection;
  const saveData = Boolean(connection?.saveData);
  const effectiveType = String(connection?.effectiveType || "");
  const wifi = connection?.type === "wifi" || effectiveType === "4g" && !saveData;
  const slow = effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";
  return { saveData, wifi, slow };
}

/* ---------------- 轮播位置会话状态 ---------------- */

export type BannerSessionState = {
  bannerId: string;
  index: number;
  /** 视频播放进度（毫秒），仅用于切回首页时恢复 */
  positionMs: number;
  savedAt: number;
};

export function readBannerSession(): BannerSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY) || window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BannerSessionState;
    if (!parsed || typeof parsed.bannerId !== "string") return null;
    // 超过 30 分钟的进度不再恢复，避免回到一个早已过期的位置。
    if (Date.now() - Number(parsed.savedAt || 0) > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBannerSession(state: Omit<BannerSessionState, "savedAt">) {
  if (typeof window === "undefined") return;
  const record: BannerSessionState = { ...state, savedAt: Date.now() };
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(record));
  } catch { /* 隐私模式写不进去就退化为不恢复 */ }
}

export function clearBannerSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem("heika.homeBanners.v1");
  } catch { /* 忽略 */ }
}

if (typeof window !== "undefined") {
  window.addEventListener("heika-clear-home-banners", () => {
    void clearBannerMediaCache();
    clearBannerSession();
  });
}
