import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../../components/MobileUi";
import { NativeImage } from "../../components/NativeImage";
import { api, getDb, useMobileSession } from "../../lib/mobile-api";
import type { NativePost } from "../../lib/native-posts";
import { useTheme } from "../../lib/theme";

type Detail = { attribute: string; value: string; is_public: boolean };
type PublicProfile = { profile: { id: string; nickname: string | null; bio: string | null; avatar_url: string | null; show_bookmarks: boolean }; details: Detail[]; posts: NativePost[]; bookmarks: NativePost[] };

export default function PublicProfileScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useMobileSession();
  const [data, setData] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError("");
    try { setData(await api<PublicProfile>(`/api/v1/profiles/${encodeURIComponent(id)}`, session)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "个人主页暂时无法打开。"); }
    finally { setLoading(false); }
  }, [id, session]);
  useEffect(() => { void load(); }, [load]);

  const message = async () => {
    if (!session) { router.push("/account"); return; }
    if (!data?.profile.id || busy || data.profile.id === session.user.id) return;
    setBusy(true); setError("");
    try {
      const client = await getDb();
      const { data: conversationId, error: rpcError } = await client.rpc("open_dm", { peer: data.profile.id });
      if (rpcError) throw rpcError;
      router.push({ pathname: "/chat/[id]", params: { id: String(conversationId), nickname: data.profile.nickname || "探索者" } } as never);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法发起私聊。"); }
    finally { setBusy(false); }
  };

  const details = (data?.details || []).flatMap((item) => {
    const label = ({ gender: "性别", mbti: "MBTI", birthday: "生日", hobbies: "爱好" } as Record<string, string>)[item.attribute];
    if (!label || !item.value) return [];
    let value = item.value;
    if (item.attribute === "gender") value = ({ female: "女", male: "男", nonbinary: "非二元", undisclosed: "不愿透露" } as Record<string, string>)[value] || "";
    if (item.attribute === "hobbies") { try { value = (JSON.parse(value) as string[]).join("、"); } catch { value = ""; } }
    return value ? [{ label, value }] : [];
  });
  const openPost = (post: NativePost) => router.push({ pathname: "/post/[id]", params: { id: post.cloudId } } as never);

  return <PageFrame title="个人主页" eyebrow="PUBLIC / PROFILE" refreshing={loading} onRefresh={() => void load()}>
    <Notice>{error}</Notice>
    {loading && !data ? <ActivityIndicator color={colors.action} /> : null}
    {data ? <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line }}>
        <View style={{ width: 68, height: 68, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{data.profile.avatar_url ? <NativeImage uri={data.profile.avatar_url} label="用户头像" style={{ width: 68, height: 68 }} /> : <Text style={{ color: colors.action, fontSize: 22, fontWeight: "700" }}>{(data.profile.nickname || "探").slice(0, 1)}</Text>}</View>
        <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 21, fontWeight: "700" }}>{data.profile.nickname || "探索者"}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{data.profile.bio || "还没有填写简介。"}</Text></View>
      </View>
      {details.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>{details.map((item) => <View key={item.label} style={{ paddingVertical: 6, paddingHorizontal: 9, backgroundColor: colors.raised }}><Text style={{ color: colors.muted, fontSize: 10 }}>{item.label}　<Text style={{ color: colors.ink, fontWeight: "600" }}>{item.value}</Text></Text></View>)}</View> : null}
      {session?.user.id !== data.profile.id ? <Action title={busy ? "正在打开…" : "发起私聊"} disabled={busy} onPress={() => void message()} /> : null}
      <Section title="公开内容" count={data.posts.length} colors={colors} />
      {!data.posts.length ? <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 12 }}>还没有公开作品。</Text> : data.posts.map((post, index) => <PostRow key={post.cloudId} post={post} onPress={() => openPost(post)} index={index} colors={colors} />)}
      {data.profile.show_bookmarks ? <><Section title="公开收藏" count={data.bookmarks.length} colors={colors} />{!data.bookmarks.length ? <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 12 }}>暂时没有公开收藏。</Text> : data.bookmarks.map((post, index) => <PostRow key={`saved-${post.cloudId}`} post={post} onPress={() => openPost(post)} index={index} colors={colors} />)}</> : null}
    </> : !loading ? <View style={{ paddingVertical: 24 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>主页暂时无法显示</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>{error || "请检查网络后重试。"}</Text><Pressable onPress={() => void load()} style={{ paddingVertical: 13 }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>重新加载　›</Text></Pressable></View> : null}
  </PageFrame>;
}

function Section({ title, count, colors }: { title: string; count: number; colors: ReturnType<typeof useTheme>["colors"] }) { return <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>{title}</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>{count} 篇</Text></View>; }
function PostRow({ post, onPress, index, colors }: { post: NativePost; onPress: () => void; index: number; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <Animated.View entering={FadeInDown.duration(180).delay(Math.min(index * 15, 100))}><Pressable onPress={onPress} style={{ flexDirection: "row", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.line }}><NativeImage uri={post.image} label={post.title} resizeMode="cover" style={{ width: 76, height: 86, backgroundColor: colors.raised }} /><View style={{ flex: 1, justifyContent: "center" }}><Text numberOfLines={1} style={{ color: colors.action, fontSize: 10, fontWeight: "700" }}>#{post.tag}</Text><Text numberOfLines={2} style={{ color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 5 }}>{post.title}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>{post.body}</Text><Text style={{ color: colors.subtle, fontSize: 10, marginTop: 5 }}>♡ {post.likeCount}　·　{post.date}</Text></View></Pressable></Animated.View>;
}
