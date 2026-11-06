import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { MotionPressable } from "../components/MotionPressable";
import { NativeImage } from "../components/NativeImage";
import { api } from "../lib/mobile-api";
import { normalizePosts, type NativePost } from "../lib/native-posts";
import { useTheme } from "../lib/theme";

type Person = { id: string; nickname: string | null; bio: string | null; avatar_url?: string | null };
type SearchResponse<T> = { items: T[]; total: number | null; has_more: boolean; next_cursor: string | null };
type SearchKind = "content" | "people";

export default function SearchScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ q?: string; kind?: string }>();
  const [query, setQuery] = useState(typeof params.q === "string" ? params.q : "");
  const [kind, setKind] = useState<SearchKind>(params.kind === "people" ? "people" : "content");
  const [posts, setPosts] = useState<NativePost[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const cursor = useRef<string | null>(null);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = query.trim();
    if (!term) { setPosts([]); setPeople([]); setError(""); setLoading(false); return; }
    const current = ++sequence.current;
    timer.current = setTimeout(() => { void runSearch(term, kind, current); }, 240);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [kind, query]);

  const runSearch = async (term: string, searchKind: SearchKind, current = ++sequence.current) => {
    setLoading(true); setError(""); cursor.current = null; setMore(false);
    try {
      if (searchKind === "people") {
        const result = await api<SearchResponse<Person>>(`/api/v1/search?kind=people&q=${encodeURIComponent(term)}&limit=24`);
        if (current !== sequence.current) return;
        setPeople(result.items || []); setPosts([]);
      } else {
        const result = await api<SearchResponse<unknown>>(`/api/v1/search?kind=content&q=${encodeURIComponent(term)}&limit=24`);
        if (current !== sequence.current) return;
        setPosts(normalizePosts(result.items)); setPeople([]); cursor.current = result.next_cursor; setMore(result.has_more);
      }
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : "搜索暂时不可用，请稍后重试。"); }
    finally { if (current === sequence.current) setLoading(false); }
  };

  const loadMore = async () => {
    const term = query.trim();
    if (kind !== "content" || !cursor.current || loading) return;
    setLoading(true); setError("");
    try {
      const result = await api<SearchResponse<unknown>>(`/api/v1/search?kind=content&q=${encodeURIComponent(term)}&limit=24&cursor=${encodeURIComponent(cursor.current)}`);
      setPosts((current) => { const ids = new Set(current.map((post) => post.cloudId)); return [...current, ...normalizePosts(result.items).filter((post) => !ids.has(post.cloudId))]; });
      cursor.current = result.next_cursor; setMore(result.has_more);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "更多结果暂时无法加载。"); }
    finally { setLoading(false); }
  };

  return <PageFrame title="搜索" eyebrow="SEARCH / HEIKA">
    <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="搜索内容、昵称或简介" placeholderTextColor={colors.subtle} returnKeyType="search" onSubmitEditing={() => void runSearch(query.trim(), kind)} style={{ minHeight: 48, paddingHorizontal: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 14 }} />
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: colors.line, marginTop: 2 }}>
      {([ ["content", "内容"], ["people", "用户"] ] as const).map(([value, title]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: kind === value }} onPress={() => setKind(value)} style={{ minHeight: 43, paddingHorizontal: 18, justifyContent: "center", borderBottomWidth: 2, borderColor: kind === value ? colors.action : "transparent" }}><Text style={{ color: kind === value ? colors.action : colors.muted, fontSize: 13, fontWeight: kind === value ? "700" : "500" }}>{title}</Text></Pressable>)}
    </View>
    <Notice>{error}</Notice>
    {!query.trim() ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>输入关键词，按内容或用户查找。结果会在独立页面展示。</Text> : null}
    {loading && !posts.length && !people.length ? <ActivityIndicator color={colors.action} style={{ marginTop: 26 }} /> : null}
    {kind === "people" ? people.map((person, index) => <Animated.View key={person.id} entering={FadeInDown.duration(180).delay(Math.min(index * 14, 90))} layout={LinearTransition.duration(160)}>
      <Pressable onPress={() => router.push({ pathname: "/profile/[id]", params: { id: person.id } } as never)} style={{ minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 9 }}>
        <View style={{ width: 46, height: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{person.avatar_url ? <NativeImage uri={person.avatar_url} label="用户头像" style={{ width: 46, height: 46 }} /> : <Text style={{ color: colors.action, fontSize: 16, fontWeight: "700" }}>{(person.nickname || "探").slice(0, 1)}</Text>}</View>
        <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>{person.nickname || "探索者"}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>{person.bio || "还没有填写简介"}</Text></View><Text style={{ color: colors.subtle, fontSize: 18 }}>›</Text>
      </Pressable>
    </Animated.View>) : posts.map((post, index) => <Animated.View key={post.cloudId} entering={FadeInDown.duration(190).delay(Math.min(index * 12, 90))} layout={LinearTransition.duration(160)}>
      <MotionPressable onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.cloudId } } as never)} style={{ flexDirection: "row", gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.line }}>
        <NativeImage uri={post.image} label={post.title} resizeMode="cover" style={{ width: 88, height: 100, backgroundColor: colors.raised }} />
        <View style={{ flex: 1, justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 10, fontWeight: "700" }}>#{post.tag}</Text><Text numberOfLines={2} style={{ color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "700", marginTop: 5 }}>{post.title}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>{post.body}</Text><Text style={{ color: colors.subtle, fontSize: 10, marginTop: 6 }}>{post.author}　·　♡ {post.likeCount}</Text></View>
      </MotionPressable>
    </Animated.View>)}
    {query.trim() && !loading && !error && kind === "people" && !people.length ? <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16 }}>没有找到匹配的用户。</Text> : null}
    {query.trim() && !loading && !error && kind === "content" && !posts.length ? <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16 }}>没有找到匹配的内容。</Text> : null}
    {more ? <Action title={loading ? "正在加载…" : "加载更多结果"} disabled={loading} subtle onPress={() => void loadMore()} /> : null}
    {loading && (posts.length > 0 || people.length > 0) ? <ActivityIndicator color={colors.action} /> : null}
  </PageFrame>;
}
