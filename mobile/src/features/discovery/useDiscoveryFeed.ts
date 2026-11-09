import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { readCache, writeDiscoveryCache } from "../../lib/local-store";
import { mergePosts, normalizePosts, type NativePost } from "../../lib/native-posts";
import {
  DISCOVERY_CACHE_MAX_AGE_MS,
  discoveryCacheKey,
  fetchDiscoveryPage,
  type DiscoveryChannel,
  type DiscoveryFilters,
  type DiscoveryPage,
} from "./DiscoveryRepository";

type FeedState = DiscoveryPage & {
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string;
};

const emptyPage: DiscoveryPage = { items: [], cursor: null, hasMore: true, page: 0, total: null };
const emptyState: FeedState = { ...emptyPage, loading: true, refreshing: false, loadingMore: false, error: "" };

function normalizeSnapshot(value: unknown): DiscoveryPage | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<DiscoveryPage>;
  if (!Array.isArray(snapshot.items) || typeof snapshot.hasMore !== "boolean" || typeof snapshot.page !== "number") return null;
  return {
    items: normalizePosts(snapshot.items).slice(0, 48),
    cursor: snapshot.cursor && typeof snapshot.cursor.createdAt === "string" && typeof snapshot.cursor.postId === "string" ? snapshot.cursor : null,
    hasMore: snapshot.hasMore,
    page: Math.max(1, snapshot.page),
    total: typeof snapshot.total === "number" ? snapshot.total : null,
  };
}

export function useDiscoveryFeed(channel: DiscoveryChannel, filters: DiscoveryFilters, session: Session | null, enabled: boolean) {
  const { categoryId, topicName, contentType, sort } = filters;
  const cacheKey = useMemo(() => discoveryCacheKey(session?.user.id, channel, { categoryId, topicName, contentType, sort }), [categoryId, channel, contentType, session?.user.id, sort, topicName]);
  const [state, setState] = useState<FeedState>(emptyState);
  const [stateKey, setStateKey] = useState(cacheKey);
  const stateRef = useRef(state);
  const activeKeyRef = useRef(cacheKey);
  const sequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const moreRequestActive = useRef(false);
  const loadedCacheKey = useRef("");

  const update = useCallback((change: (current: FeedState) => FeedState) => {
    setState((current) => {
      const next = change(current);
      stateRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    activeController.current?.abort();
    moreRequestActive.current = false;
    const controller = new AbortController();
    activeController.current = controller;
    const requestSequence = ++sequence.current;
    activeKeyRef.current = cacheKey;
    setStateKey(cacheKey);
    const isCurrent = () => sequence.current === requestSequence && !controller.signal.aborted;
    const sameCache = loadedCacheKey.current === cacheKey;
    loadedCacheKey.current = cacheKey;
    update((current) => sameCache
      ? { ...current, loading: current.items.length === 0, refreshing: current.items.length > 0, loadingMore: false, error: "" }
      : { ...emptyState, loading: true });

    void (async () => {
      try {
        const cached = normalizeSnapshot(await readCache<unknown>(`feed:discover:${cacheKey}`, DISCOVERY_CACHE_MAX_AGE_MS));
        if (cached && isCurrent()) update(() => ({ ...cached, loading: false, refreshing: true, loadingMore: false, error: "" }));
        const result = await fetchDiscoveryPage(channel, filters, session, null, 0, controller.signal);
        if (!isCurrent()) return;
        update(() => ({ ...result, loading: false, refreshing: false, loadingMore: false, error: "" }));
        void writeDiscoveryCache(cacheKey, result);
      } catch (cause) {
        if (!isCurrent()) return;
        const message = cause instanceof Error ? cause.message : "内容加载失败，请检查网络后重试。";
        update((current) => ({ ...current, loading: false, refreshing: false, loadingMore: false, error: message }));
      }
    })();

    return () => {
      controller.abort();
      if (activeController.current === controller) activeController.current = null;
      sequence.current += 1;
    };
  }, [cacheKey, channel, enabled, filters, session, update]);

  const refresh = useCallback(() => {
    if (!enabled || activeKeyRef.current !== cacheKey) return;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const requestSequence = ++sequence.current;
    moreRequestActive.current = false;
    update((current) => ({ ...current, loading: current.items.length === 0, refreshing: current.items.length > 0, loadingMore: false, error: "" }));
    void fetchDiscoveryPage(channel, filters, session, null, 0, controller.signal)
      .then((result) => {
        if (sequence.current !== requestSequence || controller.signal.aborted) return;
        update(() => ({ ...result, loading: false, refreshing: false, loadingMore: false, error: "" }));
        void writeDiscoveryCache(cacheKey, result);
      })
      .catch((cause: unknown) => {
        if (sequence.current !== requestSequence || controller.signal.aborted) return;
        update((current) => ({ ...current, loading: false, refreshing: false, loadingMore: false, error: cause instanceof Error ? cause.message : "刷新失败，请稍后重试。" }));
      });
  }, [cacheKey, channel, enabled, filters, session, update]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (!enabled || activeKeyRef.current !== cacheKey || !current.items.length || !current.hasMore || current.loading || current.loadingMore || moreRequestActive.current) return;
    moreRequestActive.current = true;
    const requestSequence = sequence.current;
    const controller = new AbortController();
    activeController.current?.abort();
    activeController.current = controller;
    update((value) => ({ ...value, loadingMore: true, error: "" }));
    void fetchDiscoveryPage(channel, filters, session, current.cursor, current.page, controller.signal)
      .then((result) => {
        if (sequence.current !== requestSequence || controller.signal.aborted) return;
        const next = { ...result, items: mergePosts(stateRef.current.items, result.items), loading: false, refreshing: false, loadingMore: false, error: "" };
        update(() => next);
      })
      .catch((cause: unknown) => {
        if (sequence.current !== requestSequence || controller.signal.aborted) return;
        update((value) => ({ ...value, loadingMore: false, error: cause instanceof Error ? cause.message : "继续加载失败，请稍后重试。" }));
      })
      .finally(() => {
        if (sequence.current === requestSequence) moreRequestActive.current = false;
      });
  }, [cacheKey, channel, enabled, filters, session, update]);

  const setPosts = useCallback((posts: NativePost[]) => update((current) => ({ ...current, items: posts })), [update]);
  const updatePost = useCallback((postId: number, change: (post: NativePost) => NativePost) => update((current) => ({
    ...current,
    items: current.items.map((post) => post.id === postId ? change(post) : post),
  })), [update]);
  return { ...(stateKey === cacheKey ? state : emptyState), refresh, loadMore, setPosts, updatePost };
}
