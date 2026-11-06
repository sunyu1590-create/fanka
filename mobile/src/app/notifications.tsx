import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { NativeImage } from "../components/NativeImage";
import { api, useMobileSession } from "../lib/mobile-api";
import { readCache, writeCache } from "../lib/local-store";
import { useTheme } from "../lib/theme";

type NotificationItem = { id: string; notification_type: string; title: string; created_at: string; read_at: string | null; actor?: { id?: string; nickname?: string | null; avatar_url?: string | null } | null; post?: { cloudId?: string; title?: string } | null };
type Result = { items: NotificationItem[]; unread: number; total: number };
const messages: Record<string, string> = {
  creator_post: "发布了创作者内容",
  topic_post: "发布了话题共创内容",
  series_post: "更新了作品系列",
  comment: "评论了你的作品",
  reply: "回复了你的评论",
  moderation: "有一条内容审核通知",
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { session, loading: authLoading } = useMobileSession();
  const [data, setData] = useState<Result>({ items: [], unread: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const itemsCount = useRef(0);
  useEffect(() => { itemsCount.current = data.items.length; }, [data.items.length]);

  const load = useCallback(async (refresh = false) => {
    if (!session) { setLoading(false); return; }
    if (refresh) setRefreshing(true); else if (!itemsCount.current) setLoading(true);
    setError("");
    try {
      const result = await api<Result>("/api/v1/notifications?limit=30", session);
      setData(result); void writeCache(`notifications:${session.user.id}`, result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通知加载失败，请稍后重试。"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  useEffect(() => {
    if (!session) { setData({ items: [], unread: 0, total: 0 }); setLoading(false); return; }
    let active = true;
    void readCache<Result>(`notifications:${session.user.id}`, 2 * 60 * 1000).then((cached) => { if (active && cached) { setData(cached); setLoading(false); } }).finally(() => { if (active) void load(); });
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void load(true); });
    return () => { active = false; subscription.remove(); };
  }, [load, session]);

  const markAll = async () => {
    if (!session || !data.unread) return;
    const previous = data;
    setData((current) => ({ ...current, unread: 0, items: current.items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })) }));
    try { await api("/api/v1/notifications", session, { method: "POST", body: JSON.stringify({ action: "read_all" }) }); }
    catch (cause) { setData(previous); setError(cause instanceof Error ? cause.message : "已读状态更新失败。"); }
  };
  const open = async (item: NotificationItem) => {
    if (session && !item.read_at) {
      const readAt = new Date().toISOString();
      setData((current) => ({ ...current, unread: Math.max(0, current.unread - 1), items: current.items.map((row) => row.id === item.id ? { ...row, read_at: readAt } : row) }));
      try { await api("/api/v1/notifications", session, { method: "POST", body: JSON.stringify({ action: "read", id: item.id }) }); }
      catch { void load(); }
    }
    if (item.post?.cloudId) router.push({ pathname: "/post/[id]", params: { id: item.post.cloudId } } as never);
    else if (item.actor?.id) router.push({ pathname: "/profile/[id]", params: { id: item.actor.id } } as never);
  };

  if (authLoading) return <PageFrame title="通知" eyebrow="ACTIVITY / HEIKA"><ActivityIndicator color={colors.action} /></PageFrame>;
  if (!session) return <PageFrame title="通知" eyebrow="ACTIVITY / HEIKA"><Text style={{ color: colors.muted, fontSize: 13 }}>登录后查看与你相关的评论、回复和内容动态。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;
  return <PageFrame title="通知" eyebrow="ACTIVITY / HEIKA" refreshing={refreshing} onRefresh={() => void load(true)}>
    <View style={{ minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.muted, fontSize: 11 }}>{data.unread ? `${data.unread} 条未读` : "已全部读完"}</Text><Pressable disabled={!data.unread} onPress={() => void markAll()}><Text style={{ color: data.unread ? colors.action : colors.subtle, fontSize: 11, fontWeight: "700" }}>全部已读</Text></Pressable></View>
    <Notice>{error}</Notice>
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 5, paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>最近动态</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>{data.total}</Text></View>
    {loading && !data.items.length ? <ActivityIndicator color={colors.action} style={{ marginTop: 24 }} /> : null}
    {!loading && !data.items.length ? <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 16 }}>暂时没有新通知。</Text> : null}
    {data.items.map((item, index) => <Animated.View key={item.id} entering={FadeInDown.duration(170).delay(Math.min(index * 11, 88))} layout={LinearTransition.duration(150)}>
      <Pressable onPress={() => void open(item)} style={{ minHeight: 76, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 13, backgroundColor: item.read_at ? "transparent" : colors.raised, borderBottomWidth: 1, borderColor: colors.line }}>
        <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, overflow: "hidden" }}>{item.actor?.avatar_url ? <NativeImage uri={item.actor.avatar_url} label="通知用户头像" style={{ width: 36, height: 36 }} /> : <Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>{(item.actor?.nickname || "黑").slice(0, 1)}</Text>}</View>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}><Text style={{ fontWeight: "700" }}>{item.actor?.nickname || "黑卡 HEIKA"}</Text><Text style={{ color: colors.muted }}>　{messages[item.notification_type] || item.title || "有一条新动态"}</Text></Text><Text numberOfLines={2} style={{ color: colors.ink, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{item.post?.title || item.title || "打开查看动态"}</Text><Text style={{ color: colors.subtle, fontSize: 10, marginTop: 5 }}>{new Date(item.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text></View>
        <View style={{ width: 6, height: 6, marginTop: 5, backgroundColor: item.read_at ? "transparent" : colors.gold }} />
      </Pressable>
    </Animated.View>)}
    {data.items.length >= 30 ? <Text style={{ color: colors.subtle, fontSize: 10, textAlign: "center", paddingVertical: 13 }}>目前展示最近 30 条通知</Text> : null}
  </PageFrame>;
}
