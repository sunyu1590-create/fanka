import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, TextInput, View } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { router } from "expo-router";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../../components/MobileUi";
import { api, getDb, useMobileSession } from "../../lib/mobile-api";
import { readCache, writeCache } from "../../lib/local-store";
import { useTheme } from "../../lib/theme";
import { NativeImage } from "../../components/NativeImage";

type Summary = { conversation_id: string; user_a: string; user_b: string; latest_body: string | null; latest_created_at: string | null; unread: number | string };
type Person = { id: string; nickname: string | null; bio: string | null; avatar_url?: string | null };
type InboxCache = { rows: Summary[]; profiles: Record<string, Person> };

export default function MessagesScreen() {
  const { colors } = useTheme();
  const { session, loading: authLoading } = useMobileSession();
  const [rows, setRows] = useState<Summary[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Person>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rowCount = useRef(0);
  useEffect(() => { rowCount.current = rows.length; }, [rows.length]);

  const load = useCallback(async (manual = false) => {
    if (!session) { setLoading(false); return; }
    if (manual) setRefreshing(true); else if (!rowCount.current) setLoading(true);
    setError("");
    try {
      const client = await getDb();
      const { data, error: dbError } = await client.rpc("dm_inbox_summary");
      if (dbError) throw dbError;
      const items = (data || []) as Summary[];
      const ids = [...new Set(items.map((item) => item.user_a === session.user.id ? item.user_b : item.user_a))];
      const peopleResult = ids.length ? await client.from("profiles").select("id,nickname,bio,avatar_url").in("id", ids) : { data: [], error: null };
      if (peopleResult.error) throw peopleResult.error;
      const mapped = Object.fromEntries(((peopleResult.data || []) as Person[]).map((person) => [person.id, person]));
      setRows(items); setProfiles(mapped);
      void writeCache(`messages:${session.user.id}`, { rows: items, profiles: mapped } satisfies InboxCache);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "消息列表加载失败，请稍后重试。"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  useEffect(() => {
    if (!session) { setRows([]); setProfiles({}); setLoading(false); return; }
    let active = true;
    setLoading(true);
    void readCache<InboxCache>(`messages:${session.user.id}`, 8 * 60 * 1000).then((cache) => {
      if (active && cache) { setRows(cache.rows); setProfiles(cache.profiles); setLoading(false); }
    }).finally(() => { if (active) void load(); });
    return () => { active = false; };
  }, [session, load]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let channel: ReturnType<SupabaseClient["channel"]> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      if (timer) clearInterval(timer);
      if (AppState.currentState === "active") timer = setInterval(() => { if (AppState.currentState === "active") void load(); }, 30_000);
    };
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void load(); schedule(); });
    void getDb().then((client) => {
      if (!active) return;
      channel = client.channel(`heika-native-inbox-${session.user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "dm_messages" }, () => void load()).subscribe();
      schedule();
    }).catch(() => undefined);
    return () => { active = false; subscription.remove(); if (timer) clearInterval(timer); if (channel) void getDb().then((client) => client.removeChannel(channel!)); };
  }, [load, session]);

  const findPeople = async () => {
    const term = query.trim();
    if (!term) { setPeople([]); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ items: Person[] }>(`/api/v1/search?kind=people&q=${encodeURIComponent(term)}&limit=12`, session);
      setPeople((result.items || []).filter((person) => person.id !== session?.user.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "用户搜索失败。"); }
    finally { setBusy(false); }
  };

  const openChat = (conversationId: string, person: Person) => router.push({ pathname: "/chat/[id]", params: { id: conversationId, peerId: person.id, nickname: person.nickname || "探索者" } } as never);
  const startChat = async (person: Person) => {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const client = await getDb(); const { data, error: rpcError } = await client.rpc("open_dm", { peer: person.id });
      if (rpcError) throw rpcError;
      openChat(String(data), person);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法发起私聊。"); }
    finally { setBusy(false); }
  };

  if (authLoading) return <PageFrame title="消息" eyebrow="MESSAGES / HEIKA" back={false}><ActivityIndicator color={colors.action} /></PageFrame>;
  if (!session) return <PageFrame title="消息" eyebrow="MESSAGES / PRIVATE" back={false}><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>登录后查看会话、搜索用户并开始交流。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;
  const unreadTotal = rows.reduce((sum, row) => sum + Number(row.unread || 0), 0);

  return <PageFrame title="消息" eyebrow="MESSAGES / PRIVATE" back={false} refreshing={refreshing} onRefresh={() => void load(true)}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.muted, fontSize: 11 }}>{unreadTotal ? `${unreadTotal} 条未读私信` : "私聊消息已同步"}</Text><Pressable accessibilityRole="button" onPress={() => router.push("/notifications")}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>社区通知　›</Text></Pressable></View>
    <Notice>{error}</Notice>
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 7, paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>最近会话</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>{rows.length}</Text></View>
    {loading && !rows.length ? <ActivityIndicator color={colors.action} style={{ marginTop: 15 }} /> : null}
    {!rows.length && !loading ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, paddingVertical: 12 }}>还没有私聊。搜索其他探索者，开始第一段交流。</Text> : null}
    {rows.map((row, index) => {
      const peerId = row.user_a === session.user.id ? row.user_b : row.user_a;
      const person = profiles[peerId] || { id: peerId, nickname: "探索者", bio: "" };
      return <Animated.View key={row.conversation_id} entering={FadeInDown.duration(170).delay(Math.min(index * 12, 80))} layout={LinearTransition.duration(160)}>
        <Pressable onPress={() => openChat(row.conversation_id, person)} style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}>
          <View style={{ width: 46, height: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{person.avatar_url ? <NativeImage uri={person.avatar_url} label="用户头像" style={{ width: 46, height: 46 }} /> : <Text style={{ color: colors.action, fontSize: 15, fontWeight: "700" }}>{(person.nickname || "探").slice(0, 1)}</Text>}</View>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>{person.nickname || "探索者"}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 5 }}>{row.latest_body || "开始聊天"}</Text></View>
          <View style={{ minWidth: 42, alignItems: "flex-end", gap: 6 }}><Text style={{ color: colors.subtle, fontSize: 9 }}>{row.latest_created_at ? new Date(row.latest_created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : ""}</Text>{Number(row.unread) > 0 ? <Text style={{ minWidth: 19, textAlign: "center", color: colors.surface, backgroundColor: colors.action, overflow: "hidden", fontSize: 10, fontWeight: "700" }}>{Number(row.unread)}</Text> : null}</View>
        </Pressable>
      </Animated.View>;
    })}
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>寻找探索者</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>按昵称和简介搜索</Text></View>
    <View style={{ flexDirection: "row", gap: 8 }}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void findPeople()} placeholder="搜索昵称或简介" placeholderTextColor={colors.subtle} returnKeyType="search" style={{ flex: 1, minHeight: 45, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 13 }} /><Pressable accessibilityRole="button" onPress={() => void findPeople()} disabled={busy} style={{ width: 68, alignItems: "center", justifyContent: "center", backgroundColor: colors.action, opacity: busy ? 0.65 : 1 }}><Text style={{ color: colors.surface, fontSize: 12, fontWeight: "700" }}>{busy ? "搜索中" : "搜索"}</Text></Pressable></View>
    {people.map((person, index) => <Animated.View key={person.id} entering={FadeInDown.duration(160).delay(Math.min(index * 12, 80))} style={{ minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderColor: colors.line }}>
      <Pressable onPress={() => router.push({ pathname: "/profile/[id]", params: { id: person.id } } as never)} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{person.avatar_url ? <NativeImage uri={person.avatar_url} label="用户头像" style={{ width: 40, height: 40 }} /> : <Text style={{ color: colors.action, fontSize: 14, fontWeight: "700" }}>{(person.nickname || "探").slice(0, 1)}</Text>}</Pressable>
      <Pressable onPress={() => router.push({ pathname: "/profile/[id]", params: { id: person.id } } as never)} style={{ flex: 1, paddingVertical: 7 }}><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>{person.nickname || "探索者"}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>{person.bio || "还没有填写简介"}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void startChat(person)} hitSlop={7} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 8 }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>私聊</Text></Pressable>
    </Animated.View>)}
    {!!query.trim() && !busy && !people.length ? <Text style={{ color: colors.muted, fontSize: 11, paddingVertical: 12 }}>没有找到匹配的用户。</Text> : null}
  </PageFrame>;
}
