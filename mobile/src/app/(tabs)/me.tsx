import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../../components/MobileUi";
import { NativeImage } from "../../components/NativeImage";
import { MotionPressable } from "../../components/MotionPressable";
import { api, useMobileSession } from "../../lib/mobile-api";
import { readCache, writeCache } from "../../lib/local-store";
import { pairPosts, type NativePost } from "../../lib/native-posts";
import { useTheme } from "../../lib/theme";
import { NativeIcon } from "../../components/NativeIcon";

type Profile = { id: string; nickname: string | null; bio: string | null; avatar_url: string | null; show_bookmarks: boolean; role?: string; membership_tier?: string };
type LibraryKind = "own" | "bookmarks" | "liked" | "recent";
type LibraryResponse = { items: NativePost[]; has_more: boolean; next_page: number | null };
type Experience = { total: number; membershipTier?: "free" | "plus" | "pro" };
const sections: Array<{ key: LibraryKind; label: string }> = [
  { key: "own", label: "我的作品" }, { key: "bookmarks", label: "我的收藏" }, { key: "liked", label: "我的点赞" }, { key: "recent", label: "最近浏览" },
];

export default function MeScreen() {
  const { colors } = useTheme();
  const { session, loading: authLoading } = useMobileSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
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
  useEffect(() => {
    if (!session) { setExperience(null); return; }
    let active = true;
    void api<Experience>("/api/v1/progression", session).then((result) => { if (active) setExperience(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [session]);

  const openPost = (post: NativePost) => {
    if (post.status === "draft" || post.status === "pending_review") {
      router.push({ pathname: "/publish", params: { editId: post.cloudId } } as never);
      return;
    }
    router.push({ pathname: "/post/[id]", params: { id: post.cloudId } } as never);
  };
  const tier = (experience?.membershipTier || profile?.membership_tier) === "pro" ? "PRO" : (experience?.membershipTier || profile?.membership_tier) === "plus" ? "PLUS" : "免费版";
  const libraryRows = pairPosts(items);

  if (authLoading) return <PageFrame title="我的" eyebrow="PROFILE / HEIKA" back={false}><ActivityIndicator color={colors.action} /></PageFrame>;
  if (!session) return <PageFrame title="我的" eyebrow="PROFILE / HEIKA" back={false}><View style={{ paddingVertical: 22, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 25, fontWeight: "700" }}>登录黑卡</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7 }}>同步翻卡经验、收藏、作品和私聊记录。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></View><Pressable onPress={() => router.push("/settings")} style={{ paddingVertical: 16 }}><Text style={{ color: colors.ink, fontSize: 14 }}>应用设置　›</Text></Pressable></PageFrame>;

  return <PageFrame title="我的" eyebrow="PROFILE / HEIKA" back={false} refreshing={loading} onRefresh={() => { void loadProfile(); void loadLibrary(kind); }}>
    <Notice>{settingsError}</Notice>
    <View style={{ padding: 15, marginTop: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 15, shadowColor: "#000", shadowOpacity: .09, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
        <View style={{ width: 66, height: 66, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, borderRadius: 33, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>{profile?.avatar_url ? <NativeImage uri={profile.avatar_url} label="我的头像" style={{ width: 66, height: 66, borderRadius: 33 }} /> : <Text style={{ color: colors.action, fontSize: 22, fontWeight: "700" }}>{(profile?.nickname || "探").slice(0, 1)}</Text>}</View>
        <Pressable onPress={() => router.push("/profile-edit")} style={{ flex: 1, paddingVertical: 8 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: "800", flexShrink: 1 }}>{profile?.nickname || "探索者"}</Text><Text style={{ color: colors.gold, fontSize: 9, fontWeight: "800", borderWidth: 1, borderColor: `${colors.gold}75`, borderRadius: 9, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 3 }}>{tier}</Text></View><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }}>{profile?.bio || "收藏那些值得再读的瞬间"}</Text><Text style={{ color: colors.subtle, fontSize: 9, letterSpacing: 1, marginTop: 5 }}>HEIKA ID · {session.user.id.slice(0, 8).toUpperCase()}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="编辑个人资料" onPress={() => router.push("/profile-edit")} hitSlop={10} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.raised }}><NativeIcon name="edit" color={colors.muted} size={17} /></Pressable>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderColor: colors.line }}>
        {[ [String(experience?.total || 0), "累计经验"], [tier, "会员权益"], [profile?.show_bookmarks ? "公开" : "私密", "收藏可见性"] ].map(([value, label], index) => <View key={label} style={{ flex: 1, alignItems: "center", borderRightWidth: index === 2 ? 0 : 1, borderColor: colors.line }}><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: "800" }}>{value}</Text><Text style={{ color: colors.subtle, fontSize: 9, marginTop: 3 }}>{label}</Text></View>)}
      </View>
    </View>
    <Pressable onPress={() => router.push("/experience")} style={{ minHeight: 80, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13 }}>
      <View style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.actionSoft, borderRadius: 12 }}><Text style={{ color: colors.action, fontSize: 16, fontWeight: "800" }}>LV</Text></View>
      <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>探索等级与经验</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>{tier}　·　经验与奖励同步网页端</Text><View style={{ height: 3, backgroundColor: colors.line, marginTop: 8, overflow: "hidden", borderRadius: 2 }}><View style={{ width: `${Math.min(100, (experience?.total || 0) % 100)}%`, height: 3, backgroundColor: colors.action, borderRadius: 2 }} /></View></View><NativeIcon name="chevron-right" color={colors.muted} size={16} />
    </Pressable>
    <View style={{ flexDirection: "row", gap: 8, marginTop: 1 }}>
      {[ ["sparkles", "创作者中心", "/creator"], ["bell", "消息通知", "/notifications"], ["settings", "设置", "/settings"] ].map(([icon, label, path]) => <Pressable key={path} onPress={() => router.push(path as never)} style={{ flex: 1, minHeight: 58, gap: 5, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 11 }}><NativeIcon name={icon as "sparkles" | "bell" | "settings"} color={colors.action} size={17} /><Text style={{ color: colors.ink, fontSize: 10, fontWeight: "600" }}>{label}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: "row", gap: 0, marginTop: 5, borderBottomWidth: 1, borderColor: colors.line }}>
      {sections.map((section) => <Pressable key={section.key} accessibilityRole="tab" accessibilityState={{ selected: kind === section.key }} onPress={() => setKind(section.key)} style={{ flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderBottomWidth: 2, borderColor: kind === section.key ? colors.action : "transparent" }}><Text style={{ color: kind === section.key ? colors.action : colors.muted, fontSize: 10, fontWeight: kind === section.key ? "700" : "500" }}>{section.label}</Text></Pressable>)}
    </View>
    <Notice>{error}</Notice>
    {loading && !items.length ? <ActivityIndicator color={colors.action} style={{ marginTop: 20 }} /> : null}
    {!loading && !error && !items.length ? <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16 }}>{kind === "own" ? "还没有发布的作品。" : kind === "bookmarks" ? "还没有收藏内容。" : kind === "liked" ? "还没有点赞内容。" : "最近浏览的内容会显示在这里。"}</Text> : null}
    {libraryRows.map((row, rowIndex) => <View key={row.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      {[row.left, row.right].filter((post): post is NativePost => Boolean(post)).map((post, index) => <Animated.View key={post.cloudId} entering={FadeInDown.duration(210).delay(Math.min((rowIndex * 2 + index) * 14, 120))} style={{ flex: 1, minWidth: 0 }}>
        <MotionPressable onPress={() => openPost(post)} style={{ marginBottom: 12, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }}>
          <View style={{ position: "relative" }}><NativeImage uri={post.image} label={post.title} resizeMode="cover" style={{ width: "100%", height: rowIndex % 3 === 1 ? 132 : 162 }} />{post.channel === "ai" ? <View style={{ position: "absolute", top: 7, left: 7, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: `${colors.surface}E8` }}><Text style={{ color: colors.action, fontSize: 9, fontWeight: "700" }}>AI 空间</Text></View> : null}</View>
          <View style={{ padding: 9 }}><Text numberOfLines={1} style={{ color: colors.action, fontSize: 9, fontWeight: "700" }}>#{post.tag}　·　{post.status === "draft" ? "草稿" : post.status === "pending_review" ? "审核中" : post.date}</Text><Text numberOfLines={2} style={{ color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 5 }}>{post.title}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }}>{post.body}</Text><Text style={{ color: colors.subtle, fontSize: 9, marginTop: 7 }}>♡ {post.likeCount}　·　{post.author}</Text></View>
        </MotionPressable>
      </Animated.View>)}
      {row.right ? null : <View style={{ flex: 1 }} />}
    </View>)}
    {hasMore ? <Pressable onPress={() => void loadLibrary(kind, page + 1)} disabled={loadingMore} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>{loadingMore ? "正在加载…" : "继续加载"}</Text></Pressable> : items.length ? <Text style={{ color: colors.subtle, fontSize: 10, textAlign: "center", paddingVertical: 14 }}>已显示全部内容</Text> : null}
  </PageFrame>;
}
