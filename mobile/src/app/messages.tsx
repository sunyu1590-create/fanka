import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { router } from "expo-router";
import { Action, Notice, PageFrame, SectionTitle, palette, ui } from "../components/MobileUi";
import { api, getDb, useMobileSession } from "../lib/mobile-api";

type Summary = { conversation_id: string; user_a: string; user_b: string; latest_body: string | null; latest_created_at: string | null; unread: number | string };
type Person = { id: string; nickname: string | null; bio: string | null; avatar_url?: string | null };

export default function MessagesScreen() {
  const { session, loading: authLoading } = useMobileSession();
  const [rows, setRows] = useState<Summary[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Person>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (manual = false) => {
    if (!session) return;
    setRefreshing(manual); setError("");
    try {
      const client = await getDb();
      const { data, error: dbError } = await client.rpc("dm_inbox_summary");
      if (dbError) throw dbError;
      const items = (data || []) as Summary[];
      setRows(items);
      const ids = [...new Set(items.map((item) => item.user_a === session.user.id ? item.user_b : item.user_a))];
      if (ids.length) {
        const { data: peopleData, error: profilesError } = await client.from("profiles").select("id,nickname,bio,avatar_url").in("id", ids);
        if (profilesError) throw profilesError;
        setProfiles(Object.fromEntries(((peopleData || []) as Person[]).map((person) => [person.id, person])));
      } else setProfiles({});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "消息列表加载失败"); }
    finally { setRefreshing(false); }
  }, [session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!session) return;
    let channel: ReturnType<SupabaseClient["channel"]> | undefined;
    let timer: ReturnType<typeof setInterval>;
    let active = true;
    void getDb().then((client) => {
      if (!active) return;
      channel = client.channel(`heika-mobile-inbox-${session.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages" }, () => void load())
        .subscribe();
      timer = setInterval(() => void load(), 30000);
    });
    return () => { active = false; const activeChannel = channel; if (activeChannel) void getDb().then((client) => client.removeChannel(activeChannel)); if (timer) clearInterval(timer); };
  }, [session, load]);

  const findPeople = async () => {
    if (query.trim().length < 1) { setPeople([]); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ items: Person[] }>(`/api/v1/search?kind=people&q=${encodeURIComponent(query.trim())}&limit=12`);
      setPeople((result.items || []).filter((person) => person.id !== session?.user.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "搜索失败"); }
    finally { setBusy(false); }
  };

  const openChat = (conversationId: string, peer: Person) => router.push({ pathname: "/chat/[id]", params: { id: conversationId, peerId: peer.id, nickname: peer.nickname || "探索者" } } as never);
  const startChat = async (person: Person) => {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const client = await getDb();
      const { data, error: rpcError } = await client.rpc("open_dm", { peer: person.id });
      if (rpcError) throw rpcError;
      openChat(String(data), person);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法发起私聊"); }
    finally { setBusy(false); }
  };

  if (authLoading) return <PageFrame title="消息" eyebrow="MESSAGES / HEIKA"><ActivityIndicator color={palette.green} /></PageFrame>;
  if (!session) return <PageFrame title="消息" eyebrow="MESSAGES / PRIVATE"><Text style={ui.muted}>登录后查看会话，搜索用户并开始交流。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;

  return <PageFrame title="消息" eyebrow="MESSAGES / PRIVATE" refreshing={refreshing} onRefresh={() => void load(true)}>
    <View style={topActions}>
      <Text style={ui.rowSubtitle}>{rows.reduce((sum, row) => sum + Number(row.unread || 0), 0)} 条未读私信</Text>
      <Pressable onPress={() => router.push("/notifications")}><Text style={link}>社区通知　›</Text></Pressable>
    </View>
    <Notice>{error}</Notice>
    <SectionTitle detail={String(rows.length)}>最近会话</SectionTitle>
    {!rows.length && !refreshing ? <Text style={ui.muted}>还没有私聊。搜索其他探索者，开始第一段交流。</Text> : null}
    {rows.map((row) => {
      const peerId = row.user_a === session.user.id ? row.user_b : row.user_a;
      const person = profiles[peerId] || { id: peerId, nickname: "探索者", bio: "" };
      return <Pressable key={row.conversation_id} onPress={() => openChat(row.conversation_id, person)} style={conversationRow}>
        <View style={avatar}>{person.avatar_url ? <Image source={{ uri: person.avatar_url }} alt={person.nickname || "探索者头像"} style={avatarImage} /> : <Text style={avatarText}>{(person.nickname || "探").slice(0, 1)}</Text>}</View>
        <View style={{ flex: 1 }}><Text style={peerName} numberOfLines={1}>{person.nickname || "探索者"}</Text><Text style={preview} numberOfLines={1}>{row.latest_body || "开始聊天"}</Text></View>
        <View style={rightMeta}><Text style={timeText}>{row.latest_created_at ? new Date(row.latest_created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : ""}</Text>{Number(row.unread) > 0 ? <Text style={unread}>{Number(row.unread)}</Text> : null}</View>
      </Pressable>;
    })}
    <SectionTitle>寻找探索者</SectionTitle>
    <View style={searchRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void findPeople()} placeholder="搜索昵称或简介" placeholderTextColor={palette.muted} style={searchInput} returnKeyType="search"/><Pressable onPress={() => void findPeople()} style={searchButton}><Text style={searchButtonText}>{busy ? "…" : "搜索"}</Text></Pressable></View>
    {people.map((person) => <Pressable key={person.id} onPress={() => void startChat(person)} style={conversationRow}>
      <View style={avatar}>{person.avatar_url ? <Image source={{ uri: person.avatar_url }} alt={person.nickname || "探索者头像"} style={avatarImage} /> : <Text style={avatarText}>{(person.nickname || "探").slice(0, 1)}</Text>}</View>
      <View style={{ flex: 1 }}><Text style={peerName}>{person.nickname || "探索者"}</Text><Text style={preview} numberOfLines={1}>{person.bio || "还没有填写简介"}</Text></View>
      <Text style={link}>私聊　›</Text>
    </Pressable>)}
  </PageFrame>;
}

const topActions = { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } as const;
const link = { color: palette.green, fontSize: 13, fontWeight: "600" } as const;
const conversationRow = { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.line } as const;
const avatar = { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E8ECE8", alignItems: "center", justifyContent: "center" } as const;
const avatarText = { color: palette.green, fontWeight: "700", fontSize: 15 } as const;
const avatarImage = { width: 44, height: 44, borderRadius: 22 } as const;
const peerName = { color: palette.ink, fontSize: 14, fontWeight: "700" } as const;
const preview = { color: palette.muted, fontSize: 12, marginTop: 5 } as const;
const rightMeta = { minWidth: 42, alignItems: "flex-end", gap: 6 } as const;
const timeText = { color: palette.muted, fontSize: 10 } as const;
const unread = { minWidth: 19, height: 19, overflow: "hidden", textAlign: "center", textAlignVertical: "center", borderRadius: 10, color: "#FFFFFF", backgroundColor: palette.green, fontSize: 10, fontWeight: "700" } as const;
const searchRow = { flexDirection: "row", gap: 8 } as const;
const searchInput = { flex: 1, height: 46, paddingHorizontal: 12, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: 10, color: palette.ink } as const;
const searchButton = { width: 68, alignItems: "center", justifyContent: "center", backgroundColor: palette.green, borderRadius: 10 } as const;
const searchButtonText = { color: "#FFFFFF", fontWeight: "700" } as const;
