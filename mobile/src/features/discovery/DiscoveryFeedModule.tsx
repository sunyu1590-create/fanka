import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import type { Session } from "@supabase/supabase-js";
import { useTheme } from "../../lib/theme";
import type { NativePost } from "../../lib/native-posts";
import type { AiSort, CommunitySort, DiscoveryCategory, DiscoveryChannel, DiscoveryFilters } from "./DiscoveryRepository";
import { fetchDiscoveryCategories, fetchDiscoveryInteractions, setDiscoveryInteraction } from "./DiscoveryRepository";
import { useDiscoveryFeed } from "./useDiscoveryFeed";
import { DiscoveryCard } from "./DiscoveryCard";

type Preferences = { categoryId: number | null; contentType: string | null; sort: CommunitySort | AiSort };
type InteractionMap = Record<number, boolean>;

const communitySorts: Array<{ value: CommunitySort; label: string }> = [
  { value: "recommended", label: "推荐" },
  { value: "latest", label: "最新" },
  { value: "rating", label: "高评分" },
  { value: "following", label: "关注" },
];
const aiSorts: Array<{ value: AiSort; label: string }> = [
  { value: "latest", label: "最新" },
  { value: "popular", label: "热门" },
  { value: "featured", label: "精选" },
];
const aiTypes = [
  { value: null, label: "全部资源" },
  { value: "knowledge_article", label: "AI 知识" },
  { value: "agent", label: "Agent" },
  { value: "skill", label: "Skill" },
  { value: "prompt", label: "Prompt" },
  { value: "ai_tool", label: "AI 工具" },
  { value: "tutorial", label: "实战教程" },
] as const;
const initialPreferences = (channel: DiscoveryChannel): Preferences => ({ categoryId: null, contentType: null, sort: channel === "community" ? "recommended" : "latest" });

function parsePreferences(value: string | null, channel: DiscoveryChannel): Preferences {
  const defaults = initialPreferences(channel);
  if (!value) return defaults;
  try {
    const parsed = JSON.parse(value) as Partial<Preferences>;
    const allowedSorts = channel === "community" ? communitySorts.map((item) => item.value) : aiSorts.map((item) => item.value);
    const validTypes = aiTypes.map((item) => item.value);
    return {
      categoryId: typeof parsed.categoryId === "number" && Number.isSafeInteger(parsed.categoryId) ? parsed.categoryId : null,
      contentType: channel === "ai" && typeof parsed.contentType === "string" && validTypes.includes(parsed.contentType as (typeof validTypes)[number]) ? parsed.contentType : null,
      sort: allowedSorts.some((sort) => sort === parsed.sort) ? parsed.sort as Preferences["sort"] : defaults.sort,
    };
  } catch { return defaults; }
}

export function DiscoveryFeedModule({ channel, active, authLoading, session }: { channel: DiscoveryChannel; active: boolean; authLoading: boolean; session: Session | null }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const visibility = useSharedValue(active ? 1 : 0);
  const visibilityStyle = useAnimatedStyle(() => ({ opacity: visibility.value }));
  const userId = session?.user.id || "guest";
  const preferenceKey = `heika:preferences:discovery:v1:${userId}:${channel}`;
  const [preferences, setPreferences] = useState<Preferences>(() => initialPreferences(channel));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [likedIds, setLikedIds] = useState<InteractionMap>({});
  const [savedIds, setSavedIds] = useState<InteractionMap>({});
  const [likeBusyIds, setLikeBusyIds] = useState<InteractionMap>({});
  const [saveBusyIds, setSaveBusyIds] = useState<InteractionMap>({});
  const [actionError, setActionError] = useState("");
  const likedIdsRef = useRef<InteractionMap>({});
  const savedIdsRef = useRef<InteractionMap>({});
  const requestedInteractionIds = useRef(new Set<number>());
  const interactionControllers = useRef(new Set<AbortController>());
  const busyLikeIds = useRef(new Set<number>());
  const busySaveIds = useRef(new Set<number>());
  const interactionGeneration = useRef(0);
  const listRef = useRef<FlashListRef<NativePost>>(null);
  const previousFilterKey = useRef("");

  useEffect(() => {
    visibility.value = reduceMotion ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: 170 });
  }, [active, reduceMotion, visibility]);

  useEffect(() => {
    let current = true;
    setPreferencesReady(false);
    setPreferences(initialPreferences(channel));
    void AsyncStorage.getItem(preferenceKey)
      .then((stored) => { if (current) setPreferences(parsePreferences(stored, channel)); })
      .catch(() => { if (current) setPreferences(initialPreferences(channel)); })
      .finally(() => { if (current) setPreferencesReady(true); });
    return () => { current = false; };
  }, [channel, preferenceKey]);

  useEffect(() => {
    if (preferencesReady) void AsyncStorage.setItem(preferenceKey, JSON.stringify(preferences)).catch(() => undefined);
  }, [preferenceKey, preferences, preferencesReady]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let current = true;
    setCategoriesLoading(true);
    setCategoriesError("");
    void fetchDiscoveryCategories(channel, null, controller.signal)
      .then((items) => { if (current) setCategories(items); })
      .catch((cause: unknown) => { if (current && !controller.signal.aborted) setCategoriesError(cause instanceof Error ? cause.message : "分类暂时无法加载"); })
      .finally(() => { if (current) { setCategoriesLoading(false); setCategoriesLoaded(true); } });
    return () => { current = false; controller.abort(); };
  }, [active, categoryRetry, channel]);

  useEffect(() => {
    if (!categoriesLoaded || !preferences.categoryId) return;
    if (categoriesError) { setPreferences((current) => ({ ...current, categoryId: null })); return; }
    if (!categories.some((item) => item.id === preferences.categoryId)) setPreferences((current) => ({ ...current, categoryId: null }));
  }, [categories, categoriesError, categoriesLoaded, preferences.categoryId]);

  const selectedCategory = categories.find((item) => item.id === preferences.categoryId) || null;
  const filters = useMemo<DiscoveryFilters>(() => ({
    categoryId: preferences.categoryId,
    topicName: channel === "community" ? selectedCategory?.name || null : null,
    contentType: channel === "ai" ? preferences.contentType : null,
    sort: preferences.sort,
  }), [channel, preferences.categoryId, preferences.contentType, preferences.sort, selectedCategory?.name]);
  const filterKey = JSON.stringify([filters.categoryId, filters.topicName, filters.contentType, filters.sort]);
  const categoryReady = !preferences.categoryId || (categoriesLoaded && !categoriesError);
  const feed = useDiscoveryFeed(channel, filters, session, active && preferencesReady && categoryReady);

  useEffect(() => {
    if (previousFilterKey.current && previousFilterKey.current !== filterKey && active) listRef.current?.scrollToOffset({ offset: 0, animated: false });
    previousFilterKey.current = filterKey;
  }, [active, filterKey]);

  useEffect(() => {
    requestedInteractionIds.current.clear();
    interactionGeneration.current += 1;
    interactionControllers.current.forEach((controller) => controller.abort());
    interactionControllers.current.clear();
    setLikedIds({});
    setSavedIds({});
    likedIdsRef.current = {};
    savedIdsRef.current = {};
    busyLikeIds.current.clear();
    busySaveIds.current.clear();
    setLikeBusyIds({});
    setSaveBusyIds({});
  }, [userId]);

  useEffect(() => () => {
    interactionGeneration.current += 1;
    interactionControllers.current.forEach((controller) => controller.abort());
    interactionControllers.current.clear();
  }, []);

  const itemIdKey = useMemo(() => feed.items.map((post) => post.id).join(","), [feed.items]);
  useEffect(() => {
    if (!session) return;
    const ids = itemIdKey.split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0 && !requestedInteractionIds.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => requestedInteractionIds.current.add(id));
    const generation = interactionGeneration.current;
    const controller = new AbortController();
    interactionControllers.current.add(controller);
    void fetchDiscoveryInteractions(ids, session, controller.signal)
      .then((result) => {
        if (generation !== interactionGeneration.current) return;
        const nextLikes = Object.fromEntries(Object.entries(result).map(([id, value]) => [Number(id), value.liked]));
        const nextSaved = Object.fromEntries(Object.entries(result).map(([id, value]) => [Number(id), value.saved]));
        likedIdsRef.current = { ...likedIdsRef.current, ...nextLikes };
        savedIdsRef.current = { ...savedIdsRef.current, ...nextSaved };
        setLikedIds((current) => ({ ...current, ...nextLikes }));
        setSavedIds((current) => ({ ...current, ...nextSaved }));
      })
      .catch(() => { if (generation === interactionGeneration.current) ids.forEach((id) => requestedInteractionIds.current.delete(id)); })
      .finally(() => { interactionControllers.current.delete(controller); controller.abort(); });
  }, [itemIdKey, session, session?.access_token, session?.user.id]);

  const updateFeedPost = feed.updatePost;

  const toggleLike = useCallback(async (post: NativePost) => {
    if (!session) { router.push("/account"); return; }
    if (busyLikeIds.current.has(post.id)) return;
    const generation = interactionGeneration.current;
    busyLikeIds.current.add(post.id);
    const previous = Boolean(likedIdsRef.current[post.id]);
    likedIdsRef.current = { ...likedIdsRef.current, [post.id]: !previous };
    setLikeBusyIds((current) => ({ ...current, [post.id]: true }));
    setLikedIds((current) => ({ ...current, [post.id]: !previous }));
    updateFeedPost(post.id, (item) => ({ ...item, likeCount: Math.max(0, item.likeCount + (previous ? -1 : 1)) }));
    setActionError("");
    try {
      await setDiscoveryInteraction(session, "like", post.id, !previous);
    } catch (cause) {
      if (generation !== interactionGeneration.current) return;
      likedIdsRef.current = { ...likedIdsRef.current, [post.id]: previous };
      setLikedIds((current) => ({ ...current, [post.id]: previous }));
      updateFeedPost(post.id, (item) => ({ ...item, likeCount: Math.max(0, item.likeCount + (previous ? 1 : -1)) }));
      setActionError(cause instanceof Error ? cause.message : "点赞没有保存，请重试。");
    } finally {
      if (generation === interactionGeneration.current) {
        busyLikeIds.current.delete(post.id);
        setLikeBusyIds((current) => ({ ...current, [post.id]: false }));
      }
    }
  }, [session, updateFeedPost]);

  const toggleSaved = useCallback(async (post: NativePost) => {
    if (!session) { router.push("/account"); return; }
    if (busySaveIds.current.has(post.id)) return;
    const generation = interactionGeneration.current;
    busySaveIds.current.add(post.id);
    const previous = savedIdsRef.current[post.id] ?? post.saved;
    savedIdsRef.current = { ...savedIdsRef.current, [post.id]: !previous };
    setSaveBusyIds((current) => ({ ...current, [post.id]: true }));
    setSavedIds((current) => ({ ...current, [post.id]: !previous }));
    setActionError("");
    try {
      await setDiscoveryInteraction(session, "bookmark", post.id, !previous);
    } catch (cause) {
      if (generation !== interactionGeneration.current) return;
      savedIdsRef.current = { ...savedIdsRef.current, [post.id]: previous };
      setSavedIds((current) => ({ ...current, [post.id]: previous }));
      setActionError(cause instanceof Error ? cause.message : "收藏没有保存，请重试。");
    } finally {
      if (generation === interactionGeneration.current) {
        busySaveIds.current.delete(post.id);
        setSaveBusyIds((current) => ({ ...current, [post.id]: false }));
      }
    }
  }, [session]);

  const selectCategory = (categoryId: number | null) => setPreferences((current) => ({ ...current, categoryId }));
  const visiblePosts = useMemo(() => {
    if (channel !== "community" || filters.sort === "latest" || filters.sort === "recommended" || filters.sort === "following") return feed.items;
    return [...feed.items].sort((a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount || b.date.localeCompare(a.date) || b.id - a.id);
  }, [channel, feed.items, filters.sort]);
  const sortOptions = channel === "community" ? communitySorts : aiSorts;
  const onOpen = useCallback((post: NativePost) => router.push({ pathname: "/post/[id]", params: { id: post.cloudId } } as never), []);
  const onOpenAuthor = useCallback((authorId?: string) => { if (authorId) router.push({ pathname: "/profile/[id]", params: { id: authorId } } as never); }, []);

  const renderPost = useCallback(({ item, index }: { item: NativePost; index: number }) => <Animated.View
    entering={reduceMotion ? undefined : FadeInDown.duration(200).delay(Math.min(index * 18, 100))}
    layout={reduceMotion ? undefined : LinearTransition.duration(180)}
    style={{ flex: 1, minWidth: 0 }}
  >
    <DiscoveryCard
      post={item}
      channel={channel}
      liked={Boolean(likedIds[item.id])}
      saved={savedIds[item.id] ?? item.saved}
      likeBusy={Boolean(likeBusyIds[item.id])}
      saveBusy={Boolean(saveBusyIds[item.id])}
      onOpen={onOpen}
      onOpenAuthor={onOpenAuthor}
      onLike={toggleLike}
      onSave={toggleSaved}
    />
  </Animated.View>, [channel, likeBusyIds, likedIds, onOpen, onOpenAuthor, reduceMotion, saveBusyIds, savedIds, toggleLike, toggleSaved]);

  const followingRequiresLogin = channel === "community" && filters.sort === "following" && !session;
  const empty = feed.loading || authLoading || (preferencesReady && !categoryReady)
    ? <View style={{ minHeight: 240, alignItems: "center", justifyContent: "center", gap: 10 }}><ActivityIndicator color={colors.action} /><Text style={{ color: colors.muted, fontSize: 12 }}>正在整理发现内容…</Text></View>
    : <View style={{ minHeight: 240, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 9 }}>
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>{followingRequiresLogin ? "登录后查看关注动态" : feed.error ? "内容暂时无法加载" : "这里还没有相关内容"}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center" }}>{followingRequiresLogin ? "登录后会显示你关注的创作者发布的内容。" : feed.error || (channel === "ai" ? "换个分类或稍后再来看看。" : "稍后回来看看，新的内容会继续出现。")}</Text>
      {followingRequiresLogin ? <Pressable onPress={() => router.push("/account")} style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.actionSoft, borderRadius: 16 }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>去登录</Text></Pressable> : feed.error ? <Pressable onPress={feed.refresh} style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.actionSoft, borderRadius: 16 }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>重新加载</Text></Pressable> : null}
    </View>;

  const footer = <View style={{ minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
    {feed.loadingMore ? <ActivityIndicator color={colors.action} /> : feed.error && feed.items.length ? <Pressable accessibilityRole="button" onPress={feed.refresh}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>加载失败，点此重试</Text></Pressable> : feed.hasMore && feed.items.length ? <Text style={{ color: colors.subtle, fontSize: 10 }}>继续向下，发现更多内容</Text> : feed.items.length ? <Text style={{ color: colors.subtle, fontSize: 10 }}>已经看到这里了</Text> : null}
  </View>;

  return <Animated.View pointerEvents={active ? "auto" : "none"} style={[{ flex: 1, display: active ? "flex" : "none", backgroundColor: colors.bg }, visibilityStyle]}>
    <View style={{ paddingTop: 5, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 7, alignItems: "center" }}>
        <FilterChip label="全部" selected={preferences.categoryId === null} onPress={() => selectCategory(null)} />
        {categories.map((category) => <FilterChip key={category.id} label={channel === "ai" && category.parentId ? `› ${category.name}` : category.name} selected={preferences.categoryId === category.id} onPress={() => selectCategory(category.id)} />)}
        {categoriesLoading && !categories.length ? <ActivityIndicator size="small" color={colors.action} /> : null}
        {categoriesError ? <Pressable accessibilityRole="button" onPress={() => setCategoryRetry((value) => value + 1)}><Text style={{ color: colors.danger, fontSize: 10 }}>分类加载失败 · 重试</Text></Pressable> : null}
      </ScrollView>
      {channel === "ai" ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, gap: 7, alignItems: "center" }}>
        {aiTypes.map((type) => <FilterChip key={type.value || "all-types"} label={type.label} selected={(preferences.contentType || null) === type.value} onPress={() => setPreferences((current) => ({ ...current, contentType: type.value }))} />)}
      </ScrollView> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, gap: 7, alignItems: "center" }}>
        <Text style={{ color: colors.subtle, fontSize: 9, marginRight: 1 }}>排序</Text>
        {sortOptions.map((option) => <FilterChip key={option.value} label={option.label} selected={filters.sort === option.value} onPress={() => setPreferences((current) => ({ ...current, sort: option.value }))} />)}
      </ScrollView>
      {actionError ? <Text accessibilityRole="alert" numberOfLines={2} style={{ color: colors.danger, fontSize: 10, paddingHorizontal: 13, paddingTop: 6 }}>{actionError}</Text> : null}
    </View>
    <FlashList
      ref={listRef}
      data={visiblePosts}
      renderItem={renderPost}
      keyExtractor={(item) => item.cloudId}
      masonry
      numColumns={2}
      optimizeItemArrangement={false}
      maxItemsInRecyclePool={18}
      contentContainerStyle={{ paddingHorizontal: 7, paddingTop: 10, paddingBottom: 112, backgroundColor: colors.bg }}
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.45}
      refreshing={feed.refreshing}
      onRefresh={feed.refresh}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  </Animated.View>;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, isDark } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${label}${selected ? "，已选中" : ""}`} onPress={onPress} style={{ minHeight: 30, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: selected ? colors.action : colors.line, borderRadius: 16, backgroundColor: selected ? colors.actionSoft : colors.surface }}>
    <Text numberOfLines={1} style={{ color: selected ? (isDark ? colors.ink : colors.action) : colors.muted, fontSize: 10, fontWeight: selected ? "700" : "500" }}>{label}</Text>
  </Pressable>;
}
