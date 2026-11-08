const APP_ORIGIN = "https://heika.invalid";

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

export function stableCardMediaSource(source: string) {
  const url = mediaUrl(source);
  if (!url) return source;
  url.searchParams.set("redirect", "1");
  url.searchParams.set("variant", "card");
  return `${url.pathname}${url.search}`;
}

function isExpiringStorageUrl(source: string) {
  try {
    const url = new URL(source);
    return url.pathname.includes("/storage/v1/object/sign/post-covers/") && url.searchParams.has("token");
  } catch {
    return false;
  }
}

function isTemporaryUrl(source: string) {
  return /^(blob|file|content):/i.test(source);
}

export function cachedPostNeedsRefresh(value: unknown) {
  if (!value || typeof value !== "object") return true;
  const post = value as { title?: unknown; body?: unknown; image?: unknown; images?: unknown };
  if (typeof post.title !== "string" || !post.title || typeof post.body !== "string") return true;
  const sources = [post.image, ...(Array.isArray(post.images) ? post.images : [])];
  return sources.some((source) => typeof source === "string" && (isExpiringStorageUrl(source) || isTemporaryUrl(source)));
}

/** Repairs snapshots written before card images had stable, cacheable media URLs. */
export function normalizeCachedPost<T extends { image?: string; images?: string[] }>(post: T): T {
  const images = (post.images || []).filter((source) => !isExpiringStorageUrl(source) && !isTemporaryUrl(source));
  const stable = (post.images || []).find((source) => mediaUrl(source));
  const normalizedImages = images.map(stableCardMediaSource);
  if (stable && !normalizedImages.includes(stableCardMediaSource(stable))) {
    normalizedImages.unshift(stableCardMediaSource(stable));
  }
  const image = isExpiringStorageUrl(post.image || "") || isTemporaryUrl(post.image || "")
    ? stableCardMediaSource(stable || normalizedImages[0] || "") || undefined
    : post.image
      ? stableCardMediaSource(post.image)
      : normalizedImages[0];
  const safeImages = [...new Set(normalizedImages)];
  return {
    ...post,
    image: image || undefined,
    images: safeImages.length ? safeImages : post.images?.length ? undefined : post.images,
  };
}
