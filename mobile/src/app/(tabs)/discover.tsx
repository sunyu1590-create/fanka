import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { useTheme } from "../../lib/theme";
import { api, useMobileSession } from "../../lib/mobile-api";
import { readCache, writeCache } from "../../lib/local-store";
import { mergePosts, normalizePosts, pairPosts, type NativePost } from "../../lib/native-posts";
import { NativeImage } from "../../components/NativeImage";
import { MotionPressable } from "../../components/MotionPressable";
import { NativeIcon } from "../../components/NativeIcon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomNavStyle } from "../../lib/navigation-preferences";

type FeedResponse = { items: unknown[]; total?: number | null; has_more?: boolean; next_cursor?: string | null };
type Topic = { id: number; name: string; is_featured?: boolean };
type FeedChannel = "community" | "ai";

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { style: navStyle } = useBottomNavStyle();
  const { session, loading: authLoading } = useMobileSession();
  const [posts, setPosts] = useState<NativePost[]>([]);
  const [channel, setChannel] = useState<FeedChannel>("community");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const cursor = useRef<string | null>(null);
  const requestLock = useRef(false);
  const generation = useRef(0);
  const aiPage = useRef(1);
  const pendingFirstPage = useRef<boolean | null>(null);
  const fetchFirstPageRef = useRef<(manual: boolean) => Promise<void>>(async () => undefined);
  const postsRef = useRef<NativePost[]>([]);
  const cacheKey = `feed:${session?.user.id || "guest"}:${channel}:${selectedTopic?.id || "all"}`;
  const rows = useMemo(() => pairPosts(posts), [posts]);
  const postIdKey = posts.map((post) => post.id).join(",");
  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => {
    if (posts.length) void writeCache(cacheKey, { items: posts, nextCursor: cursor.current, hasMore });
  }, [cacheKey, hasMore, posts]);

  const fetchFirstPage = useCallback(async (manual = false) => {
    if (requestLock.current) {
      pendingFirstPage.current = pendingFirstPage.current === true || manual;
      return;
    }
    requestLock.current = true;
    const currentGeneration = ++generation.current;
    setRefreshing(manual);
    setLoading(postsRef.current.length === 0);
    setError("");
    if (manual) { cursor.current = null; setHasMore(true); }
    try {
      const suffix = selectedTopic ? `&${channel === "ai" ? "category" : "tag"}=${selectedTopic.id}` : "";
      const response = await api<FeedResponse>(channel === "ai" ? `/api/v1/ai-space?page=1&limit=24&sort=latest${suffix}` : `/api/v1/posts?cursor_mode=1&limit=24${suffix}`, session);
      if (currentGeneration !== generation.current) return;
      const next = normalizePosts(response.items);
      setPosts(next);
      if (channel === "ai") {
        aiPage.current = 1;
        cursor.current = null;
        setHasMore(next.length < Number(response.total || 0));
      } else {
        cursor.current = response.next_cursor || null;
        setHasMore(Boolean(response.has_more));
      }
      await writeCache(cacheKey, { items: next, nextCursor: cursor.current, hasMore: channel === "ai" ? next.length < Number(response.total || 0) : Boolean(response.has_more) });
    } catch (cause) {
      if (currentGeneration !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "发现内容加载失败，请下拉重试。");
    } finally {
      requestLock.current = false;
      setLoading(false);
      setRefreshing(false);
      const pending = pendingFirstPage.current;
      pendingFirstPage.current = null;
      if (pending !== null) void fetchFirstPageRef.current(pending);
    }
  }, [cacheKey, channel, selectedTopic, session]);

  useEffect(() => { fetchFirstPageRef.current = fetchFirstPage; }, [fetchFirstPage]);

  const fetchMore = useCallback(async () => {
    if (requestLock.current || !hasMore || (channel === "community" && !cursor.current)) return;
    requestLock.current = true;
    const currentGeneration = generation.current;
    setLoadingMore(true);
    setError("");
    try {
      const suffix = selectedTopic ? `&${channel === "ai" ? "category" : "tag"}=${selectedTopic.id}` : "";
      const nextPage = aiPage.current + 1;
      const response = await api<FeedResponse>(channel === "ai" ? `/api/v1/ai-space?page=${nextPage}&limit=24&sort=latest${suffix}` : `/api/v1/posts?cursor_mode=1&limit=24&cursor=${encodeURIComponent(cursor.current || "")}${suffix}`, session);
      if (currentGeneration !== generation.current) return;
      const incoming = normalizePosts(response.items);
      setPosts((current) => mergePosts(current, incoming));
      if (channel === "ai") {
        aiPage.current = nextPage;
        setHasMore(nextPage * 24 < Number(response.total || 0));
      } else {
        cursor.current = response.next_cursor || null;
        setHasMore(Boolean(response.has_more));
      }
    } catch (cause) { if (currentGeneration === generation.current) setError(cause instanceof Error ? cause.message : "继续加载失败，稍后可以重试。"); }
    finally {
      requestLock.current = false; setLoadingMore(false);
      const pending = pendingFirstPage.current;
      pendingFirstPage.current = null;
      if (pending !== null) void fetchFirstPageRef.current(pending);
    }
  }, [channel, hasMore, selectedTopic, session]);

  useEffect(() => {
    let active = true;
    setPosts([]); cursor.current = null; setHasMore(true);
    void readCache<{ items: NativePost[]; nextCursor: string | null; hasMore: boolean }>(cacheKey, 8 * 60 * 1000).then((cached) => {
      if (!active || !cached) return;
      setPosts(normalizePosts(cached.items)); cursor.current = cached.nextCursor; setHasMore(cached.hasMore); setLoading(false);
    }).finally(() => { if (active) void fetchFirstPage(); });
    return () => { active = false; generation.current += 1; };
  }, [cacheKey, fetchFirstPage]);

  useEffect(() => {
    let active = true;
    void api<{ items: Topic[] }>(`/api/v1/categories?channel=${channel}&kind=${channel === "ai" ? "category" : "tag"}`, session)
      .then((data) => { if (active) setTopics((data.items || []).filter((topic) => topic.is_featured).slice(0, 10)); })
      .catch(() => { if (active) setTopics([]); });
    return () => { active = false; };
  }, [channel, session]);

  useEffect(() => {
    if (!session) { setLikedIds([]); return; }
    const ids = postIdKey.split(",").filter(Boolean);
    if (!ids.length) return;
    let active = true;
    const batches: string[][] = [];
    for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100));
    void Promise.all(batches.map((batch) => api<Record<string, { liked: boolean }>>(`/api/v1/me/interactions?ids=${batch.join(",")}`, session)))
      .then((results) => {
        if (!active) return;
        const states: Record<string, { liked: boolean }> = Object.assign({}, ...results);
        const visibleIds = new Set(ids.map(Number));
        setLikedIds((current) => [...current.filter((id) => !visibleIds.has(id)), ...Object.entries(states).filter(([, state]) => state.liked).map(([id]) => Number(id))]);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [postIdKey, session]);

  const toggleLike = async (post: NativePost) => {
    if (!session) { router.push("/account"); return; }
    const liked = likedIds.includes(post.id);
    setLikedIds((current) => liked ? current.filter((id) => id !== post.id) : [...current, post.id]);
    setPosts((current) => current.map((item) => item.cloudId === post.cloudId ? { ...item, likeCount: Math.max(0, item.likeCount + (liked ? -1 : 1)) } : item));
    try {
      await api("/api/v1/library-state", session, { method: "POST", body: JSON.stringify({ action: "like", id: post.id, value: !liked }) });
    } catch (cause) {
      setLikedIds((current) => liked ? [...current, post.id] : current.filter((id) => id !== post.id));
      setPosts((current) => current.map((item) => item.cloudId === post.cloudId ? { ...item, likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)) } : item));
      setError(cause instanceof Error ? cause.message : "点赞没有保存，请重试。");
    }
  };

  const openPost = (post: NativePost) => router.push({ pathname: "/post/[id]", params: { id: post.cloudId } } as never);
  const renderCard = (post: NativePost, index: number) => <View key={post.cloudId} style={{ flex: 1, minWidth: 0, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.line, shadowColor: "#000", shadowOpacity: .13, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
    <MotionPressable onPress={() => openPost(post)} style={{ overflow: "hidden" }}>
      <View style={{ position: "relative" }}>
        <NativeImage uri={post.image} label={post.title} resizeMode="cover" style={{ height: index % 3 === 1 ? 164 : 205, width: "100%", backgroundColor: colors.raised }} />
        <View style={{ position: "absolute", left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: `${colors.surface}E8`, borderWidth: 1, borderColor: `${colors.line}A0` }}><Text style={{ color: colors.ink, fontSize: 9, fontWeight: "700" }}>{channel === "ai" ? "AI 空间" : `#${post.tag}`}</Text></View>
        <View style={{ position: "absolute", right: 8, top: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: post.rarityTier === "SSS" ? `${colors.gold}E8` : `${colors.surface}E8`, borderWidth: 1, borderColor: post.rarityTier === "SSS" ? colors.gold : colors.line }}><Text style={{ color: post.rarityTier === "SSS" ? "#222018" : colors.ink, fontSize: 9, fontWeight: "700" }}>{post.rarityTier || "待评级"}</Text></View>
      </View>
      <View style={{ paddingHorizontal: 11, paddingTop: 10, paddingBottom: 8 }}>
        <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{post.title}</Text>
        <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5 }}>{post.body}</Text>
      </View>
    </MotionPressable>
    <View style={{ minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 11, paddingBottom: 7 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.subtle, fontSize: 10, marginRight: 6 }}>{post.author}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${likedIds.includes(post.id) ? "取消赞" : "点赞"}，${post.likeCount}`} hitSlop={10} onPress={() => void toggleLike(post)} style={{ minWidth: 48, minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
        <Text style={{ color: likedIds.includes(post.id) ? colors.danger : colors.muted, fontSize: 16 }}>{likedIds.includes(post.id) ? "♥" : "♡"}</Text>
        <Text style={{ color: likedIds.includes(post.id) ? colors.danger : colors.muted, fontSize: 11, fontVariant: ["tabular-nums"] }}>{post.likeCount}</Text>
      </Pressable>
    </View>
  </View>;

  return <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 0 }}>
    <View style={{ paddingHorizontal: 18, paddingTop: insets.top + 9, paddingBottom: 11, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ height: 29, flexDirection: "row", gap: 4, padding: 3, marginBottom: 10, alignSelf: "flex-start", backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, borderRadius: 18 }}>
        {([ ["community", "社区"], ["ai", "AI 空间"] ] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: channel === value }} onPress={() => { setChannel(value); setSelectedTopic(null); }} style={{ minWidth: 78, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: channel === value ? colors.surface : "transparent", shadowColor: "#000", shadowOpacity: channel === value ? .08 : 0, shadowRadius: 4, elevation: channel === value ? 1 : 0 }}><Text style={{ color: channel === value ? colors.ink : colors.muted, fontSize: 11, fontWeight: channel === value ? "700" : "500" }}>{label}</Text></Pressable>)}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View><Text style={{ color: colors.subtle, fontSize: 9, fontWeight: "800", letterSpacing: 1.7 }}>{channel === "ai" ? "LIBRARY / AI" : "DISCOVER / HEIKA"}</Text><Text style={{ color: colors.ink, fontSize: 25, fontWeight: "700", marginTop: 3 }}>{channel === "ai" ? "AI 空间" : "发现"}</Text></View>
        <View style={{ alignItems: "flex-end", gap: 6 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: session ? colors.action : colors.subtle }} /><Text style={{ color: colors.subtle, fontSize: 9 }}>{session ? "云端同步" : "访客探索"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="搜索内容和用户" onPress={() => router.push("/search")} style={{ width: 38, height: 38, borderWidth: 1, borderColor: colors.line, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised }}><NativeIcon name="search" color={colors.ink} size={19} /></Pressable></View>
      </View>
      {channel === "ai" ? <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>智能体、工具与实战经验，汇集成可复用的知识。</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
        <TopicChip title="全部" selected={!selectedTopic} onPress={() => setSelectedTopic(null)} />
        {topics.map((topic) => <TopicChip key={topic.id} title={topic.name} selected={selectedTopic?.id === topic.id} onPress={() => setSelectedTopic(topic)} />)}
      </ScrollView>
    </View>
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item, index }) => <Animated.View entering={FadeInDown.duration(200).delay(Math.min(index * 18, 100))} layout={LinearTransition.duration(180)} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 12 }}>{renderCard(item.left, index * 2)}{item.right ? renderCard(item.right, index * 2 + 1) : <View style={{ flex: 1 }} />}</Animated.View>}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: navStyle === "glass" ? Math.max(112, insets.bottom + 94) : Math.max(80, insets.bottom + 66), flexGrow: posts.length ? undefined : 1 }}
      onEndReached={() => void fetchMore()}
      onEndReachedThreshold={0.45}
      refreshing={refreshing}
      onRefresh={() => void fetchFirstPage(true)}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={5}
      removeClippedSubviews
      ListEmptyComponent={loading || authLoading ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}><ActivityIndicator color={colors.action} /><Text style={{ color: colors.muted, fontSize: 13 }}>正在整理今日灵感…</Text></View> : <EmptyState colors={colors} error={error} retry={() => void fetchFirstPage(true)} />}
      ListFooterComponent={<View style={{ padding: 16, alignItems: "center" }}>{loadingMore ? <ActivityIndicator color={colors.action} /> : error ? <Pressable onPress={() => void fetchMore()}><Text style={{ color: colors.action, fontSize: 12 }}>加载失败，点击重试</Text></Pressable> : hasMore && posts.length ? <Text style={{ color: colors.subtle, fontSize: 10 }}>继续向下，发现更多内容</Text> : posts.length ? <Text style={{ color: colors.subtle, fontSize: 10 }}>已经看到这里了</Text> : null}</View>}
    />
  </View>;
}

function TopicChip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 34, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: selected ? colors.action : colors.line, backgroundColor: selected ? colors.actionSoft : colors.surface }}><Text style={{ color: selected ? colors.action : colors.muted, fontSize: 11, fontWeight: selected ? "700" : "500" }}>{title}</Text></Pressable>;
}

function EmptyState({ colors, error, retry }: { colors: ReturnType<typeof useTheme>["colors"]; error: string; retry: () => void }) {
  return <View style={{ alignItems: "center", justifyContent: "center", padding: 32, gap: 10 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>{error ? "内容暂时没有加载出来" : "这里还没有内容"}</Text><Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 18 }}>{error || "稍后回来看看，新的灵感会继续出现。"}</Text><Pressable onPress={retry} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.actionSoft }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>重新加载</Text></Pressable></View>;
}
