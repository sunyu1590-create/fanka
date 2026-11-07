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
import { NativeIcon } from "../../components/NativeIcon";

type Summary = { conversation_id: string; user_a: string; user_b: string; latest_body: string | null; latest_created_at: string | null; unread: number | string };
type Person = { id: string; nickname: string | null; bio: string | null; avatar_url?: string | null };
type InboxCache = { rows: Summary[]; profiles: Record<string, Person> };

export default function MessagesScreen() {
  const { colors } = useTheme();
  const { session, loading: authLoading } = useMobileSession();
  const [rows, setRows] = useState<Summary[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Person>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [inboxView, setInboxView] = useState<"chats" | "people">("chats");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rowCount = useRef(0);
  const loadInFlight = useRef(false);
  const reloadQueued = useRef(false);
  const mounted = useRef(true);
  const loadRef = useRef<(manual?: boolean) => Promise<void>>(async () => undefined);
  const activeUserId = useRef<string | null>(session?.user.id || null);
  activeUserId.current = session?.user.id || null;
  useEffect(() => { rowCount.current = rows.length; }, [rows.length]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async (manual = false) => {
    if (!session) { setLoading(false); return; }
    if (loadInFlight.current) { reloadQueued.current = true; return; }
    loadInFlight.current = true;
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
      if (!mounted.current || activeUserId.current !== session.user.id) return;
      setRows(items); setProfiles(mapped);
      void writeCache(`messages:${session.user.id}`, { rows: items, profiles: mapped } satisfies InboxCache);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "消息列表加载失败，请稍后重试。"); }
    finally {
      loadInFlight.current = false;
      if (mounted.current) { setLoading(false); setRefreshing(false); }
      if (reloadQueued.current && mounted.current) { reloadQueued.current = false; void loadRef.current(); }
    }
  }, [session]);
  useEffect(() => { loadRef.current = load; }, [load]);

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
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5 }}><View><Text style={{ color: colors.ink, fontSize: 23, fontWeight: "800" }}>消息</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 3 }}>{unreadTotal ? `${unreadTotal} 条未读私信` : "私聊与社区动态"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="打开社区通知" onPress={() => router.push("/notifications")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}><NativeIcon name="bell" color={colors.ink} size={19} /></Pressable></View>
    <Notice>{error}</Notice>
    <View style={{ flexDirection: "row", marginTop: 5, borderBottomWidth: 1, borderColor: colors.line }}>
      {([ ["chats", "会话"], ["people", "找人"] ] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: inboxView === key }} onPress={() => setInboxView(key)} style={{ minWidth: 72, minHeight: 42, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderColor: inboxView === key ? colors.action : "transparent" }}><Text style={{ color: inboxView === key ? colors.ink : colors.muted, fontSize: 12, fontWeight: inboxView === key ? "700" : "500" }}>{label}{key === "chats" && rows.length ? ` ${rows.length}` : ""}</Text></Pressable>)}
    </View>
    {inboxView === "chats" ? <>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 8, paddingBottom: 5 }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>最近会话</Text><Text style={{ color: colors.subtle, fontSize: 9 }}>实时同步</Text></View>
      {loading && !rows.length ? <ActivityIndicator color={colors.action} style={{ marginTop: 15 }} /> : null}
      {!rows.length && !loading ? <View style={{ paddingVertical: 25, alignItems: "center", borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>还没有私聊</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 5 }}>找到一位探索者，开始第一段交流。</Text><Pressable onPress={() => setInboxView("people")} style={{ marginTop: 12, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.actionSoft }}><Text style={{ color: colors.action, fontSize: 10, fontWeight: "700" }}>寻找探索者</Text></Pressable></View> : null}
      {rows.map((row, index) => {
      const peerId = row.user_a === session.user.id ? row.user_b : row.user_a;
      const person = profiles[peerId] || { id: peerId, nickname: "探索者", bio: "" };
      return <Animated.View key={row.conversation_id} entering={FadeInDown.duration(170).delay(Math.min(index * 12, 80))} layout={LinearTransition.duration(160)}>
        <Pressable onPress={() => openChat(row.conversation_id, person)} style={{ minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}>
          <View style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, borderRadius: 24, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>{person.avatar_url ? <NativeImage uri={person.avatar_url} label="用户头像" style={{ width: 48, height: 48, borderRadius: 24 }} /> : <Text style={{ color: colors.action, fontSize: 15, fontWeight: "700" }}>{(person.nickname || "探").slice(0, 1)}</Text>}</View>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>{person.nickname || "探索者"}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 5 }}>{row.latest_body || "开始聊天"}</Text></View>
          <View style={{ minWidth: 40, alignItems: "flex-end", gap: 6 }}><Text style={{ color: colors.subtle, fontSize: 9 }}>{row.latest_created_at ? new Date(row.latest_created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : ""}</Text>{Number(row.unread) > 0 ? <Text style={{ minWidth: 19, height: 19, lineHeight: 19, textAlign: "center", color: colors.surface, backgroundColor: colors.action, borderRadius: 10, overflow: "hidden", fontSize: 9, fontWeight: "800" }}>{Number(row.unread)}</Text> : null}</View>
        </Pressable>
      </Animated.View>;
      })}
    </> : <>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingTop: 13, paddingBottom: 8 }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>寻找探索者</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>按昵称和简介搜索</Text></View>
    <View style={{ minHeight: 45, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }}><NativeIcon name="search" color={colors.muted} size={17} /><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void findPeople()} placeholder="搜索昵称或简介" placeholderTextColor={colors.subtle} returnKeyType="search" style={{ flex: 1, minHeight: 43, color: colors.ink, fontSize: 13 }} /><Pressable accessibilityRole="button" onPress={() => void findPeople()} disabled={busy} style={{ minWidth: 45, minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.action, opacity: busy ? 0.65 : 1 }}><Text style={{ color: colors.surface, fontSize: 10, fontWeight: "700" }}>{busy ? "搜索中" : "搜索"}</Text></Pressable></View>
    {people.map((person, index) => <Animated.View key={person.id} entering={FadeInDown.duration(160).delay(Math.min(index * 12, 80))} style={{ minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderColor: colors.line }}>
      <Pressable onPress={() => router.push({ pathname: "/profile/[id]", params: { id: person.id } } as never)} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, borderRadius: 21, overflow: "hidden" }}>{person.avatar_url ? <NativeImage uri={person.avatar_url} label="用户头像" style={{ width: 42, height: 42, borderRadius: 21 }} /> : <Text style={{ color: colors.action, fontSize: 14, fontWeight: "700" }}>{(person.nickname || "探").slice(0, 1)}</Text>}</Pressable>
      <Pressable onPress={() => router.push({ pathname: "/profile/[id]", params: { id: person.id } } as never)} style={{ flex: 1, paddingVertical: 7 }}><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>{person.nickname || "探索者"}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>{person.bio || "还没有填写简介"}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void startChat(person)} hitSlop={7} style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.actionSoft }}><Text style={{ color: colors.action, fontSize: 10, fontWeight: "700" }}>私聊</Text></Pressable>
    </Animated.View>)}
    {!!query.trim() && !busy && !people.length ? <Text style={{ color: colors.muted, fontSize: 11, paddingVertical: 12 }}>没有找到匹配的用户。</Text> : null}
    </>}
  </PageFrame>;
}
