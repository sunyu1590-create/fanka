import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../../components/MobileUi";
import { NativeImage } from "../../components/NativeImage";
import { MotionPressable } from "../../components/MotionPressable";
import { api, useMobileSession } from "../../lib/mobile-api";
import { readCache, writeCache } from "../../lib/local-store";
import type { NativePost } from "../../lib/native-posts";
import { useTheme } from "../../lib/theme";

type Profile = { id: string; nickname: string | null; bio: string | null; avatar_url: string | null; show_bookmarks: boolean; role?: string; membership_tier?: string };
type LibraryKind = "own" | "bookmarks" | "liked" | "recent";
type LibraryResponse = { items: NativePost[]; has_more: boolean; next_page: number | null };
const sections: Array<{ key: LibraryKind; label: string }> = [
  { key: "own", label: "我的作品" }, { key: "bookmarks", label: "我的收藏" }, { key: "liked", label: "我的点赞" }, { key: "recent", label: "最近浏览" },
];

export default function MeScreen() {
  const { colors } = useTheme();
  const { session, loading: authLoading } = useMobileSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [kind, setKind] = useState<LibraryKind>("bookmarks");
  const [items, setItems] = useState<NativePost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [settingsError, setSettingsError] = useState("");

  const loadProfile = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    const key = `my-profile:${session.user.id}`;
    const cached = await readCache<Profile>(key, 8 * 60 * 1000);
    if (cached) setProfile(cached);
    try {
      const result = await api<{ profile: Profile }>("/api/v1/me", session);
      setProfile(result.profile); void writeCache(key, result.profile);
    } catch (cause) { setSettingsError(cause instanceof Error ? cause.message : "个人资料暂时无法加载。"); }
  }, [session]);

  const loadLibrary = useCallback(async (nextKind: LibraryKind, nextPage = 1) => {
    if (!session) { setLoading(false); return; }
    const key = `my-library:${session.user.id}:${nextKind}:${nextPage}`;
    setError("");
    if (nextPage === 1) {
      setLoading(true);
      const cached = await readCache<LibraryResponse>(key, 5 * 60 * 1000);
      if (cached) { setItems(cached.items); setHasMore(cached.has_more); setPage(1); setLoading(false); }
    } else setLoadingMore(true);
    try {
      const result = await api<LibraryResponse>(`/api/v1/me/library?kind=${nextKind}&page=${nextPage}&limit=24`, session);
      setItems((current) => {
        const base = nextPage === 1 ? [] : current;
        const seen = new Set(base.map((item) => item.cloudId));
        return [...base, ...(result.items || []).filter((item) => !seen.has(item.cloudId))];
      });
      setHasMore(result.has_more); setPage(nextPage); void writeCache(key, result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "内容列表暂时无法加载。"); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [session]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);
  useEffect(() => { void loadLibrary(kind, 1); }, [kind, loadLibrary]);

  const openPost = (post: NativePost) => {
    if (post.status === "draft" || post.status === "pending_review") {
      router.push({ pathname: "/publish", params: { editId: post.cloudId } } as never);
      return;
    }
    router.push({ pathname: "/post/[id]", params: { id: post.cloudId } } as never);
  };
  const tier = profile?.membership_tier === "pro" ? "PRO" : profile?.membership_tier === "plus" ? "PLUS" : "免费版";

  if (authLoading) return <PageFrame title="我的" eyebrow="PROFILE / HEIKA" back={false}><ActivityIndicator color={colors.action} /></PageFrame>;
  if (!session) return <PageFrame title="我的" eyebrow="PROFILE / HEIKA" back={false}><View style={{ paddingVertical: 22, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 25, fontWeight: "700" }}>登录黑卡</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7 }}>同步翻卡经验、收藏、作品和私聊记录。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></View><Pressable onPress={() => router.push("/settings")} style={{ paddingVertical: 16 }}><Text style={{ color: colors.ink, fontSize: 14 }}>应用设置　›</Text></Pressable></PageFrame>;

  return <PageFrame title="我的" eyebrow="PROFILE / HEIKA" back={false} refreshing={loading} onRefresh={() => { void loadProfile(); void loadLibrary(kind); }}>
    <Notice>{settingsError}</Notice>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.line }}>
      <View style={{ width: 62, height: 62, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{profile?.avatar_url ? <NativeImage uri={profile.avatar_url} label="我的头像" style={{ width: 62, height: 62 }} /> : <Text style={{ color: colors.action, fontSize: 20, fontWeight: "700" }}>{(profile?.nickname || "探").slice(0, 1)}</Text>}</View>
      <Pressable onPress={() => router.push("/profile-edit")} style={{ flex: 1, paddingVertical: 8 }}><Text style={{ color: colors.ink, fontSize: 18, fontWeight: "700" }}>{profile?.nickname || "探索者"}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{profile?.bio || "收藏那些值得再读的瞬间"}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="编辑个人资料" onPress={() => router.push("/profile-edit")} hitSlop={10}><Text style={{ color: colors.action, fontSize: 18 }}>✎</Text></Pressable>
    </View>
    <Pressable onPress={() => router.push("/experience")} style={{ minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderColor: colors.line }}>
      <View style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.action }}><Text style={{ color: colors.surface, fontSize: 13, fontWeight: "800" }}>LV</Text></View>
      <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>探索等级与经验</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{tier}　·　经验与奖励同步网页端</Text></View><Text style={{ color: colors.action, fontSize: 17 }}>›</Text>
    </Pressable>
    <View style={{ flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>
      {[ ["创作者中心", "/creator"], ["消息通知", "/notifications"], ["设置", "/settings"] ].map(([label, path]) => <Pressable key={path} onPress={() => router.push(path as never)} style={{ flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center", borderRightWidth: path === "/settings" ? 0 : 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 11, fontWeight: "600" }}>{label}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: "row", gap: 0, marginTop: 5, borderBottomWidth: 1, borderColor: colors.line }}>
      {sections.map((section) => <Pressable key={section.key} accessibilityRole="tab" accessibilityState={{ selected: kind === section.key }} onPress={() => setKind(section.key)} style={{ flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderBottomWidth: 2, borderColor: kind === section.key ? colors.action : "transparent" }}><Text style={{ color: kind === section.key ? colors.action : colors.muted, fontSize: 10, fontWeight: kind === section.key ? "700" : "500" }}>{section.label}</Text></Pressable>)}
    </View>
    <Notice>{error}</Notice>
    {loading && !items.length ? <ActivityIndicator color={colors.action} style={{ marginTop: 20 }} /> : null}
    {!loading && !error && !items.length ? <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16 }}>{kind === "own" ? "还没有发布的作品。" : kind === "bookmarks" ? "还没有收藏内容。" : kind === "liked" ? "还没有点赞内容。" : "最近浏览的内容会显示在这里。"}</Text> : null}
    {items.map((post, index) => <Animated.View key={post.cloudId} entering={FadeInDown.duration(180).delay(Math.min(index * 12, 96))}>
      <MotionPressable onPress={() => openPost(post)} style={{ flexDirection: "row", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.line }}>
        <NativeImage uri={post.image} label={post.title} resizeMode="cover" style={{ width: 74, height: 86, backgroundColor: colors.raised }} />
        <View style={{ flex: 1, justifyContent: "center" }}><Text numberOfLines={1} style={{ color: colors.action, fontSize: 10, fontWeight: "700" }}>#{post.tag}　·　{post.status === "draft" ? "草稿" : post.status === "pending_review" ? "审核中" : post.date}</Text><Text numberOfLines={2} style={{ color: colors.ink, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 5 }}>{post.title}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>{post.body}</Text><Text style={{ color: colors.subtle, fontSize: 10, marginTop: 5 }}>♡ {post.likeCount}　·　{post.author}</Text></View>
      </MotionPressable>
    </Animated.View>)}
    {hasMore ? <Pressable onPress={() => void loadLibrary(kind, page + 1)} disabled={loadingMore} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>{loadingMore ? "正在加载…" : "继续加载"}</Text></Pressable> : items.length ? <Text style={{ color: colors.subtle, fontSize: 10, textAlign: "center", paddingVertical: 14 }}>已显示全部内容</Text> : null}
  </PageFrame>;
}
