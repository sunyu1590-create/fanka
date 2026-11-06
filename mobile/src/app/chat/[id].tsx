import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { Action, Notice, PageFrame, palette, ui } from "../../components/MobileUi";
import { getDb, makeUuid, useMobileSession } from "../../lib/mobile-api";

type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; media_path?: string | null };

export default function ChatScreen() {
  const { id, nickname } = useLocalSearchParams<{ id: string; nickname?: string }>();
  const { session, loading: authLoading } = useMobileSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const scroll = useRef<ScrollViewInstance | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    let channel: ReturnType<SupabaseClient["channel"]> | undefined;
    let active = true;
    const loadMessages = async () => {
      try {
        const client = await getDb();
        const { data, error: queryError } = await client.from("dm_messages").select("id,conversation_id,sender_id,body,created_at,media_path")
          .eq("conversation_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(60);
        if (queryError) throw queryError;
        if (active) setMessages(((data || []) as Message[]).reverse());
        const { error: readError } = await client.from("dm_reads").upsert({ conversation_id: id, user_id: session.user.id, read_at: new Date().toISOString() }, { onConflict: "conversation_id,user_id" });
        if (readError) throw readError;
        if (!active) return;
        channel = client.channel(`heika-mobile-chat-${id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${id}` }, (payload) => {
          const message = payload.new as Message;
          setMessages((current) => current.some((row) => row.id === message.id) ? current : [...current, message]);
          if (message.sender_id !== session.user.id) {
            void client.from("dm_reads").upsert({ conversation_id: id, user_id: session.user.id, read_at: new Date().toISOString() }, { onConflict: "conversation_id,user_id" });
          }
        }).subscribe();
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "消息读取失败"); }
      finally { if (active) setLoading(false); }
    };
    void loadMessages();
    return () => { active = false; if (channel) void getDb().then((client) => client.removeChannel(channel!)); };
  }, [id, session]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !session || busy || content.length > 2000) return;
    setBusy(true); setError("");
    const nonce = makeUuid();
    try {
      const client = await getDb();
      const { data, error: sendError } = await client.rpc("send_dm", { room: id, content, nonce });
      if (sendError) throw sendError;
      setMessages((current) => current.some((row) => row.id === data.id) ? current : [...current, data as Message]);
      setDraft("");
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "发送失败，草稿仍保留，请重试。"); }
    finally { setBusy(false); }
  };

  if (authLoading) return <PageFrame title="私聊"><ActivityIndicator color={palette.green} /></PageFrame>;
  if (!session) return <PageFrame title="私聊"><Text style={ui.muted}>登录后才能查看这段会话。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;

  return <PageFrame title={typeof nickname === "string" ? nickname : "私聊"} eyebrow="PRIVATE / HEIKA" scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={12}>
      <ScrollView ref={scroll} contentContainerStyle={chatList} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={palette.green} style={{ marginTop: 28 }} /> : null}
        {!loading && !messages.length ? <Text style={[ui.muted, { textAlign: "center", marginTop: 28 }]}>向对方打个招呼，开始聊天。</Text> : null}
        {messages.map((message) => {
          const own = message.sender_id === session.user.id;
          return <View key={message.id} style={[bubbleRow, own && bubbleOwnRow]}>
            <View style={[bubble, own ? bubbleOwn : bubblePeer]}>
              <Text style={[bubbleText, own && bubbleOwnText]}>{message.body}</Text>
              <Text style={[bubbleTime, own && bubbleOwnTime]}>{new Date(message.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
          </View>;
        })}
      </ScrollView>
      <Notice>{error}</Notice>
      <View style={composer}>
        <TextInput value={draft} onChangeText={setDraft} style={input} multiline maxLength={2000} placeholder="写一条消息…" placeholderTextColor={palette.muted} onSubmitEditing={() => void send()} />
        <Pressable onPress={() => void send()} disabled={busy || !draft.trim()} style={[sendButton, (busy || !draft.trim()) && { opacity: 0.5 }]}><Text style={sendLabel}>{busy ? "…" : "发送"}</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  </PageFrame>;
}

const chatList = { flexGrow: 1, padding: 16, gap: 10, justifyContent: "flex-end" } as const;
const bubbleRow = { flexDirection: "row", justifyContent: "flex-start" } as const;
const bubbleOwnRow = { justifyContent: "flex-end" } as const;
const bubble = { maxWidth: "84%", paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 15 } as const;
const bubblePeer = { backgroundColor: "#FFFFFF", borderBottomLeftRadius: 4 } as const;
const bubbleOwn = { backgroundColor: palette.green, borderBottomRightRadius: 4 } as const;
const bubbleText = { color: palette.ink, fontSize: 14, lineHeight: 21 } as const;
const bubbleOwnText = { color: "#FFFFFF" } as const;
const bubbleTime = { color: palette.muted, fontSize: 10, textAlign: "right", marginTop: 4 } as const;
const bubbleOwnTime = { color: "#DDE7E3" } as const;
const composer = { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12, paddingBottom: 18, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: palette.line } as const;
const input = { flex: 1, maxHeight: 110, minHeight: 42, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: palette.bg, color: palette.ink, borderRadius: 12, fontSize: 14 } as const;
const sendButton = { height: 42, paddingHorizontal: 15, justifyContent: "center", backgroundColor: palette.green, borderRadius: 12 } as const;
const sendLabel = { color: "#FFFFFF", fontSize: 13, fontWeight: "700" } as const;
