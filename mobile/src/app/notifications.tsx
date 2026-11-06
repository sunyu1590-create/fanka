import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Action, Notice, PageFrame, SectionTitle, palette, ui } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";

type Notification = { id: string; notification_type: string; title: string; created_at: string; read_at: string | null; actor?: { nickname?: string | null } | null; post?: { cloudId?: string; title?: string } | null };
type Result = { items: Notification[]; unread: number; total: number };

const kindText: Record<string, string> = { like: "赞了你的作品", comment: "评论了你的作品", reply: "回复了你的评论", follow: "关注了你", mention: "提到了你", system: "黑卡通知" };

export default function NotificationsScreen() {
  const { session, loading: authLoading } = useMobileSession();
  const [data, setData] = useState<Result>({ items: [], unread: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!session) return;
    setRefreshing(refresh); setLoading(!refresh); setError("");
    try { setData(await api<Result>("/api/v1/notifications?limit=30", session)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "通知加载失败"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  useEffect(() => { void load(); }, [load]);
  const markAll = async () => {
    if (!session || !data.unread) return;
    const before = data;
    setData((current) => ({ ...current, unread: 0, items: current.items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })) }));
    try { await api("/api/v1/notifications", session, { method: "POST", body: JSON.stringify({ action: "read_all" }) }); }
    catch (cause) { setData(before); setError(cause instanceof Error ? cause.message : "已读状态更新失败"); }
  };
  const open = async (item: Notification) => {
    if (session && !item.read_at) {
      setData((current) => ({ ...current, unread: Math.max(0, current.unread - 1), items: current.items.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row) }));
      try { await api("/api/v1/notifications", session, { method: "POST", body: JSON.stringify({ action: "read", id: item.id }) }); }
      catch { /* the next refresh reconciles the read state */ }
    }
    if (item.post?.cloudId) router.push({ pathname: "/post/[id]", params: { id: item.post.cloudId } } as never);
  };

  if (authLoading) return <PageFrame title="通知" eyebrow="ACTIVITY / HEIKA"><ActivityIndicator color={palette.green} /></PageFrame>;
  if (!session) return <PageFrame title="通知" eyebrow="ACTIVITY / HEIKA"><Text style={ui.muted}>登录后查看与你相关的点赞、评论和关注。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;

  return <PageFrame title="通知" eyebrow="ACTIVITY / HEIKA" refreshing={refreshing} onRefresh={() => void load(true)}>
    <View style={actions}><Text style={ui.rowSubtitle}>{data.unread ? `${data.unread} 条未读` : "已全部读完"}</Text><Pressable onPress={() => void markAll()} disabled={!data.unread}><Text style={[readAll, !data.unread && { opacity: 0.4 }]}>全部已读</Text></Pressable></View>
    <Notice>{error}</Notice>
    <SectionTitle detail={String(data.total)}>最近动态</SectionTitle>
    {loading ? <ActivityIndicator color={palette.green} style={{ marginTop: 24 }} /> : null}
    {!loading && !data.items.length ? <Text style={ui.muted}>暂时没有新通知。</Text> : null}
    {data.items.map((item) => <Pressable key={item.id} onPress={() => void open(item)} style={[notificationRow, !item.read_at && unreadRow]}>
      <View style={[dot, !item.read_at && activeDot]} />
      <View style={{ flex: 1 }}>
        <Text style={notificationTitle}>{item.actor?.nickname || (item.notification_type === "system" ? "黑卡 HEIKA" : "黑卡探索者")} <Text style={notificationAction}>{kindText[item.notification_type] || "有一条新动态"}</Text></Text>
        <Text style={postTitle} numberOfLines={2}>{item.post?.title || item.title || "打开查看动态"}</Text>
        <Text style={date}>{new Date(item.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
      </View>
      <Text style={{ color: palette.muted }}>›</Text>
    </Pressable>)}
  </PageFrame>;
}

const actions = { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } as const;
const readAll = { color: palette.green, fontSize: 12, fontWeight: "700" } as const;
const notificationRow = { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: palette.line } as const;
const unreadRow = { backgroundColor: "#F0F2ED" } as const;
const dot = { width: 7, height: 7, marginTop: 6, borderRadius: 4, backgroundColor: "transparent" } as const;
const activeDot = { backgroundColor: palette.gold } as const;
const notificationTitle = { color: palette.ink, fontSize: 13, fontWeight: "700" } as const;
const notificationAction = { color: palette.muted, fontWeight: "400" } as const;
const postTitle = { color: palette.ink, fontSize: 13, marginTop: 6, lineHeight: 19 } as const;
const date = { color: palette.muted, fontSize: 10, marginTop: 6 } as const;
