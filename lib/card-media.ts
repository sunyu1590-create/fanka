const APP_ORIGIN = "https://heika.invalid";

/** 站内媒体路由（/api/v1/media?path=…）的解析结果。 */
function mediaUrl(source: string) {
  try {
    const url = new URL(source, APP_ORIGIN);
    return url.origin === APP_ORIGIN && url.pathname === "/api/v1/media" && url.searchParams.has("path")
      ? url
      : null;
  } catch {
    return null;
  }
}

function isTemporaryUrl(source: string) {
  return /^(blob|file|content):/i.test(source);
}

/**
 * 从 Supabase 存储地址里取出对象路径。
 * 签名地址带 token、几天后必然失效；公开地址是稳定的。
 * 两者都能还原成对象路径，再交给站内 /api/v1/media 统一签名，
 * 这样缓存里存的永远是「不会过期的标识」，而不是一次性的签名地址。
 */
function objectPathFromStorageUrl(source: string): string | null {
  try {
    const url = new URL(source);
    const markers = [
      "/storage/v1/object/sign/post-covers/",
      "/storage/v1/object/public/post-covers/",
    ];
    for (const marker of markers) {
      const index = url.pathname.indexOf(marker);
      if (index >= 0) {
        const path = decodeURIComponent(url.pathname.slice(index + marker.length));
        if (path && !path.includes("..")) return path;
      }
    }
  } catch {
    /* 非 URL 或无法解析：按原值返回 */
  }
  return null;
}

/**
 * 把任意卡片图片地址转成可长期缓存的稳定地址。
 * - 站内媒体路由：补齐 redirect/variant，去掉可能存在的签名参数；
 * - Supabase 签名 / 公开地址：还原对象路径后改走站内媒体路由；
 * - blob:/file:/content:：临时地址，返回 undefined（不能写进缓存）；
 * - 外链：原样保留。
 */
export function stableCardMediaUrl(source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  if (isTemporaryUrl(source)) return undefined;
  const direct = mediaUrl(source);
  if (direct) {
    // feed 缩略图是刻意加的轻量变体，保留它；其余一律按卡片原图处理。
    const keepFeed = direct.searchParams.get("variant") === "feed";
    direct.searchParams.set("redirect", "1");
    direct.searchParams.set("variant", keepFeed ? "feed" : "card");
    return `${direct.pathname}${direct.search}`;
  }
  const objectPath = objectPathFromStorageUrl(source);
  if (objectPath) {
    return `/api/v1/media?path=${encodeURIComponent(objectPath)}&redirect=1&variant=card`;
  }
  return source;
}

/** 兼容旧调用点：语义等同 stableCardMediaUrl，但保留字符串签名。 */
export function stableCardMediaSource(source: string) {
  return stableCardMediaUrl(source) || source;
}

export function cachedPostNeedsRefresh(value: unknown) {
  if (!value || typeof value !== "object") return true;
  const post = value as { title?: unknown; body?: unknown; image?: unknown; images?: unknown };
  if (typeof post.title !== "string" || !post.title || typeof post.body !== "string") return true;
  const sources = [post.image, ...(Array.isArray(post.images) ? post.images : [])];
  return sources.some((source) => typeof source === "string" && isTemporaryUrl(source));
}

/**
 * 修复历史缓存快照：把签名地址换成稳定路由，图片字段缺失时用 images 回填。
 * 必须在「读缓存」之后、渲染之前执行；旧版本把签名地址直接置空，
 * 一旦后台刷新失败，卡片就会变成没有图片、甚至整块空白。
 */
export function normalizeCachedPost<T extends { image?: string; images?: string[]; thumbnailImages?: string[]; retinaImages?: (string | undefined)[] }>(post: T): T {
  const rawImages = [...(post.images || [])];
  const normalizedImages = rawImages.map((source) => stableCardMediaUrl(source)).filter((source): source is string => Boolean(source));
  const image = stableCardMediaUrl(post.image) || normalizedImages[0];
  const safeImages = [...new Set(normalizedImages)];
  const thumbnailImages = (post.thumbnailImages || [])
    .map((source) => stableCardMediaUrl(source))
    .filter((source): source is string => Boolean(source));
  const retinaImages = (post.retinaImages || []).map((source) => stableCardMediaUrl(source));
  return {
    ...post,
    image,
    images: safeImages.length ? safeImages : post.images,
    ...(post.thumbnailImages ? { thumbnailImages: thumbnailImages.length ? thumbnailImages : post.thumbnailImages } : {}),
    ...(post.retinaImages ? { retinaImages } : {}),
  };
}

/** 批量归一化已翻开卡片的快照（缓存恢复 / 云端恢复共用）。 */
export function normalizeRevealedSnapshots<T extends { image?: string; images?: string[] }>(revealed: Record<number, T> | null | undefined): Record<number, T> {
  if (!revealed) return {};
  return Object.fromEntries(
    Object.entries(revealed).map(([id, post]) => [id, post && typeof post === "object" ? normalizeCachedPost(post) : post]),
  ) as Record<number, T>;
}
