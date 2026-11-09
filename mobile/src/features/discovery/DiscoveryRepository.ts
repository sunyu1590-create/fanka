import type { Session } from "@supabase/supabase-js";
import { API_BASE, api } from "../../lib/mobile-api";
import { normalizePosts, type NativePost } from "../../lib/native-posts";

export type DiscoveryChannel = "community" | "ai";
export type CommunitySort = "recommended" | "latest" | "rating" | "following";
export type AiSort = "latest" | "popular" | "featured";
export type DiscoveryFilters = {
  categoryId: number | null;
  topicName: string | null;
  contentType: string | null;
  sort: CommunitySort | AiSort;
};
export type DiscoveryCategory = {
  id: number;
  name: string;
  parentId: number | null;
  featured: boolean;
  description: string;
};
export type DiscoveryCursor = { createdAt: string; postId: string } | null;
export type DiscoveryPage = {
  items: NativePost[];
  cursor: DiscoveryCursor;
  hasMore: boolean;
  page: number;
  total: number | null;
};
export type DiscoveryInteraction = { liked: boolean; saved: boolean };

export const DISCOVERY_PAGE_SIZE = 24;
export const DISCOVERY_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

type CategoryResponse = { items?: unknown[] };
type CommunityResponse = {
  items?: unknown[];
  total?: number | null;
  hasMore?: boolean;
  cursor?: DiscoveryCursor;
};
type AiResponse = { items?: unknown[]; total?: number | null; page?: number };

export function discoveryCacheKey(userId: string | undefined, channel: DiscoveryChannel, filters: DiscoveryFilters) {
  const category = channel === "community" ? filters.topicName || "all" : String(filters.categoryId || "all");
  const contentType = channel === "ai" ? filters.contentType || "all" : "all";
  return [userId || "guest", channel, encodeURIComponent(category), filters.sort, contentType].join(":");
}

export async function fetchDiscoveryCategories(channel: DiscoveryChannel, session: Session | null, signal?: AbortSignal) {
  const kind = channel === "community" ? "tag" : "category";
  const response = await api<CategoryResponse>(`/api/v1/categories?channel=${channel}&kind=${kind}`, session, { signal, cache: "no-store" });
  return (response.items || []).flatMap((value): DiscoveryCategory[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = Number(row.id);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!Number.isSafeInteger(id) || id < 1 || !name) return [];
    return [{
      id,
      name,
      parentId: Number.isSafeInteger(Number(row.parent_id)) && row.parent_id !== null ? Number(row.parent_id) : null,
      featured: Boolean(row.is_featured),
      description: typeof row.description === "string" ? row.description : "",
    }];
  });
}

export async function fetchDiscoveryInteractions(ids: number[], session: Session, signal?: AbortSignal) {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100);
  if (!uniqueIds.length) return {};
  return api<Record<string, DiscoveryInteraction>>(`/api/v1/me/interactions?ids=${uniqueIds.join(",")}`, session, { signal, cache: "no-store" });
}

export async function setDiscoveryInteraction(session: Session, action: "like" | "bookmark", id: number, value: boolean) {
  await api("/api/v1/library-state", session, { method: "POST", body: JSON.stringify({ action, id, value }) });
}

export async function fetchDiscoveryPage(
  channel: DiscoveryChannel,
  filters: DiscoveryFilters,
  session: Session | null,
  cursor: DiscoveryCursor,
  page: number,
  signal?: AbortSignal,
): Promise<DiscoveryPage> {
  if (channel === "community") {
    const params = new URLSearchParams({ mode: "discover", limit: String(DISCOVERY_PAGE_SIZE) });
    if (filters.topicName) params.set("tag", filters.topicName);
    if (filters.sort === "following") params.set("following", "1");
    if (cursor) {
      params.set("cursorCreatedAt", cursor.createdAt);
      params.set("cursorPostId", cursor.postId);
    }
    const following = filters.sort === "following";
    const result = await api<CommunityResponse>(`/api/demo/cards?${params.toString()}`, following ? session : null, {
      signal,
      cache: following ? "no-store" : "default",
    });
    const items = normalizePosts(result.items);
    if (filters.sort === "rating") {
      items.sort((a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount || b.date.localeCompare(a.date) || b.id - a.id);
    }
    return { items, cursor: result.cursor || null, hasMore: Boolean(result.hasMore), page: cursor ? page + 1 : 1, total: typeof result.total === "number" ? result.total : null };
  }

  const nextPage = Math.max(1, page + 1);
  const params = new URLSearchParams({ feed: "1", sort: filters.sort, page: String(nextPage), limit: String(DISCOVERY_PAGE_SIZE) });
  if (filters.categoryId) params.set("category", String(filters.categoryId));
  if (filters.contentType) params.set("type", filters.contentType);
  const result = await api<AiResponse>(`/api/v1/ai-space?${params.toString()}`, session, { signal, cache: "no-store" });
  const total = typeof result.total === "number" ? result.total : null;
  const items = normalizePosts(result.items);
  return {
    items,
    cursor: null,
    hasMore: total === null ? items.length === DISCOVERY_PAGE_SIZE : nextPage * DISCOVERY_PAGE_SIZE < total,
    page: nextPage,
    total,
  };
}

export function getFeedImageSource(source?: string | null) {
  if (!source) return undefined;
  if (source.startsWith("data:") || source.startsWith("file:") || source.startsWith("content:")) return source;
  try {
    const url = new URL(source, API_BASE);
    if (url.protocol !== "https:" && !__DEV__) return undefined;
    const signedPostMedia = url.pathname.match(/\/storage\/v1\/object\/sign\/post-covers\/(.+)$/);
    if (signedPostMedia) {
      let storagePath = "";
      try { storagePath = decodeURIComponent(signedPostMedia[1]); } catch { return undefined; }
      const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
      if (new RegExp(`^${uuid}/${uuid}(?:-(?:480|960))?\\.(?:jpg|png|webp)$`, "i").test(storagePath)) {
        const stableUrl = new URL("/api/v1/media", API_BASE);
        stableUrl.searchParams.set("path", storagePath);
        stableUrl.searchParams.set("redirect", "1");
        stableUrl.searchParams.set("variant", "feed");
        return stableUrl.toString();
      }
    }
    if (url.origin === new URL(API_BASE).origin && url.pathname === "/api/v1/media" && url.searchParams.has("path")) {
      url.searchParams.set("redirect", "1");
      url.searchParams.set("variant", "feed");
    }
    if (url.hostname === "images.unsplash.com") {
      url.searchParams.set("auto", "format");
      url.searchParams.set("w", "640");
      url.searchParams.set("q", "76");
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
