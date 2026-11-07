import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import type { SupabaseClient } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { Action, Notice, PageFrame } from "../../components/MobileUi";
import { NativeImage } from "../../components/NativeImage";
import { getDb, makeUuid, useMobileSession } from "../../lib/mobile-api";
import { useTheme } from "../../lib/theme";

type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; media_path?: string | null; media_url?: string | null };
type SelectedImage = { uri: string; base64: string; path?: string };
type PendingAttempt = { nonce: string; body: string; uri?: string; path?: string };

export default function ChatScreen() {
  const { colors } = useTheme();
  const { id, nickname } = useLocalSearchParams<{ id: string; nickname?: string }>();
  const { session, loading: authLoading } = useMobileSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState("");
  const scroll = useRef<ScrollViewInstance | null>(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const restoreOffset = useRef<number | null>(null);
  const autoScroll = useRef(true);
  const pendingAttempt = useRef<PendingAttempt | null>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signMedia = useCallback(async (client: Awaited<ReturnType<typeof getDb>>, rows: Message[]) => {
    const paths = [...new Set(rows.flatMap((row) => row.media_path ? [row.media_path] : []))];
    if (!paths.length) return rows;
    const results = await Promise.all(paths.map(async (path) => {
      const signed = await client.storage.from("heika-chat").createSignedUrl(path, 600);
      return [path, signed.data?.signedUrl || null] as const;
    }));
    const urls = new Map(results);
    return rows.map((row) => ({ ...row, media_url: row.media_path ? urls.get(row.media_path) || undefined : undefined }));
  }, []);

  const loadInitial = useCallback(async (client: Awaited<ReturnType<typeof getDb>>, roomId: string, userId: string, active: () => boolean) => {
    const { data, error: queryError } = await client.from("dm_messages").select("id,conversation_id,sender_id,body,created_at,media_path")
      .eq("conversation_id", roomId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(60);
    if (queryError) throw queryError;
    const ordered = ((data || []) as Message[]).reverse();
    const withImages = await signMedia(client, ordered);
    if (!active()) return;
    setMessages(withImages); setHasOlder(ordered.length === 60); autoScroll.current = true;
    const { error: readError } = await client.from("dm_reads").upsert({ conversation_id: roomId, user_id: userId, read_at: new Date().toISOString() }, { onConflict: "conversation_id,user_id" });
    if (readError) throw readError;
  }, [signMedia]);

  useEffect(() => {
    if (!session || !id) { setLoading(false); return; }
    let active = true;
    let channel: ReturnType<SupabaseClient["channel"]> | undefined;
    setLoading(true); setError("");
    void getDb().then(async (client) => {
      if (!active) return;
      await loadInitial(client, id, session.user.id, () => active);
      if (!active) return;
      channel = client.channel(`heika-native-chat-${id}-${session.user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${id}` }, async (payload) => {
          const incoming = payload.new as Message;
          const rows = await signMedia(client, [incoming]);
          if (!active) return;
          const message = rows[0];
          setMessages((current) => current.some((row) => row.id === message.id) ? current : [...current, message]);
          autoScroll.current = true;
          if (message.sender_id !== session.user.id) void client.from("dm_reads").upsert({ conversation_id: id, user_id: session.user.id, read_at: new Date().toISOString() }, { onConflict: "conversation_id,user_id" });
        })
        .subscribe((status) => { if (status === "SUBSCRIBED" && active && AppState.currentState === "active") void loadInitial(client, id, session.user.id, () => active); });
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "消息读取失败，请稍后重试。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (channel) void getDb().then((client) => client.removeChannel(channel!)); };
  }, [id, loadInitial, session, signMedia]);

  useEffect(() => {
    if (!session || !id) return;
    let active = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void getDb().then((client) => loadInitial(client, id, session.user.id, () => active)).catch(() => { if (active) setError("消息同步暂时中断，请下拉重试。"); });
    });
    return () => { active = false; subscription.remove(); };
  }, [id, loadInitial, session]);

  useEffect(() => () => { if (scrollTimeout.current) clearTimeout(scrollTimeout.current); }, []);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!session || !id || !oldest || loadingOlder || !hasOlder) return;
    setLoadingOlder(true); setError("");
    try {
      const client = await getDb();
      const { data, error: queryError } = await client.from("dm_messages").select("id,conversation_id,sender_id,body,created_at,media_path").eq("conversation_id", id)
        .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(60);
      if (queryError) throw queryError;
      const ordered = ((data || []) as Message[]).reverse();
      const withImages = await signMedia(client, ordered);
      setHasOlder(ordered.length === 60);
      restoreOffset.current = scrollY.current;
      setMessages((current) => { const known = new Set(current.map((row) => row.id)); return [...withImages.filter((row) => !known.has(row.id)), ...current]; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "更早的消息暂时无法加载。"); }
    finally { setLoadingOlder(false); }
  };

  const chooseImage = async () => {
    if (busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("需要允许 HEIKA 访问相册，才能发送图片。"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true); setError("");
    try {
      const compressed = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 1600, height: 1600 } }], { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!compressed.base64 || Math.ceil(compressed.base64.length * 3 / 4) > 4 * 1024 * 1024) throw new Error("图片压缩后仍超过 4 MB，请换一张图片。");
      setImage({ uri: compressed.uri, base64: compressed.base64 }); pendingAttempt.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图片处理失败，请重试。"); }
    finally { setBusy(false); }
  };

  const send = async () => {
    const content = draft.trim();
    if (!session || !id || busy || (!content && !image) || content.length > 2000) return;
    setBusy(true); setError("");
    const attempt = pendingAttempt.current && pendingAttempt.current.body === content && pendingAttempt.current.uri === image?.uri
      ? pendingAttempt.current
      : { nonce: makeUuid(), body: content, uri: image?.uri, path: image?.path };
    pendingAttempt.current = attempt;
    let uploadedPath = attempt.path;
    try {
      const client = await getDb();
      if (image && !uploadedPath) {
        const path = `${id}/${session.user.id}/${attempt.nonce}.jpg`;
        const bytes = decodeBase64(image.base64);
        const { error: uploadError } = await client.storage.from("heika-chat").upload(path, bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
        if (uploadError) throw uploadError;
        uploadedPath = path; attempt.path = path; pendingAttempt.current = attempt; setImage({ ...image, path });
      }
      const { data, error: sendError } = await client.rpc("send_dm", { room: id, content, nonce: attempt.nonce, image_path: uploadedPath || null });
      if (sendError) throw sendError;
      const prepared = await signMedia(client, [data as Message]);
      autoScroll.current = true;
      setMessages((current) => current.some((row) => row.id === data.id) ? current : [...current, prepared[0]]);
      setDraft(""); setImage(null); pendingAttempt.current = null;
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => { scroll.current?.scrollToEnd({ animated: true }); scrollTimeout.current = null; }, 40);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "发送失败，文字和图片仍保留在输入区，请重试。"); }
    finally { setBusy(false); }
  };

  if (authLoading) return <PageFrame title="私聊"><ActivityIndicator color={colors.action} /></PageFrame>;
  if (!session) return <PageFrame title="私聊"><Text style={{ color: colors.muted, fontSize: 13 }}>登录后才能查看这段会话。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;

  return <PageFrame title={typeof nickname === "string" ? nickname : "私聊"} eyebrow="PRIVATE / HEIKA" scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      {hasOlder ? <Pressable accessibilityRole="button" onPress={() => void loadOlder()} disabled={loadingOlder || loading} style={{ minHeight: 38, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "600" }}>{loadingOlder ? "正在读取更早消息…" : "查看更早消息"}</Text></Pressable> : null}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled" onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} onContentSizeChange={(_, height) => {
        const previousHeight = contentHeight.current; contentHeight.current = height;
        if (restoreOffset.current !== null) { scroll.current?.scrollTo({ y: restoreOffset.current + Math.max(0, height - previousHeight), animated: false }); restoreOffset.current = null; }
        else if (autoScroll.current) { scroll.current?.scrollToEnd({ animated: true }); autoScroll.current = false; }
      }}>
        {loading ? <ActivityIndicator color={colors.action} style={{ marginTop: 25 }} /> : null}
        {!loading && !messages.length ? <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 26 }}>向对方打个招呼，开始聊天。</Text> : null}
        {messages.map((message) => {
          const own = message.sender_id === session.user.id;
          return <View key={message.id} style={{ flexDirection: "row", justifyContent: own ? "flex-end" : "flex-start" }}><View style={{ maxWidth: "84%", paddingHorizontal: 12, paddingTop: 9, paddingBottom: 7, backgroundColor: own ? colors.action : colors.surface, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomRightRadius: own ? 4 : 14, borderBottomLeftRadius: own ? 14 : 4, borderWidth: own ? 0 : 1, borderColor: colors.line }}>
            {message.media_url ? <NativeImage uri={message.media_url} label="聊天图片" resizeMode="cover" style={{ width: 210, height: 190, marginBottom: message.body ? 8 : 2, backgroundColor: colors.raised }} /> : message.media_path ? <Text style={{ color: own ? colors.surface : colors.muted, fontSize: 11, marginBottom: 5 }}>图片暂时无法加载</Text> : null}
            {message.body ? <Text selectable style={{ color: own ? colors.surface : colors.ink, fontSize: 14, lineHeight: 21 }}>{message.body}</Text> : null}
            <Text style={{ color: own ? `${colors.surface}B8` : colors.subtle, fontSize: 9, textAlign: "right", marginTop: 4 }}>{new Date(message.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</Text>
          </View></View>;
        })}
      </ScrollView>
      <Notice>{error}</Notice>
      {image ? <View style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingTop: 9, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line }}><NativeImage uri={image.uri} label="待发送图片" resizeMode="cover" style={{ width: 54, height: 54, backgroundColor: colors.raised }} /><Text style={{ flex: 1, color: colors.muted, fontSize: 10 }}>图片已压缩，单张不超过 4 MB</Text><Pressable onPress={() => { setImage(null); pendingAttempt.current = null; }}><Text style={{ color: colors.danger, fontSize: 12 }}>移除</Text></Pressable></View> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 9, paddingBottom: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="选择聊天图片" onPress={() => void chooseImage()} disabled={busy} style={{ width: 38, height: 42, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 21 }}>＋</Text></Pressable>
        <TextInput value={draft} onChangeText={(value) => { setDraft(value); if (pendingAttempt.current && pendingAttempt.current.body !== value.trim()) pendingAttempt.current = null; }} style={{ flex: 1, maxHeight: 110, minHeight: 42, paddingHorizontal: 11, paddingVertical: 10, backgroundColor: colors.raised, color: colors.ink, fontSize: 13 }} multiline maxLength={2000} placeholder="写一条消息…" placeholderTextColor={colors.subtle} />
        <Pressable accessibilityRole="button" onPress={() => void send()} disabled={busy || (!draft.trim() && !image)} style={{ minWidth: 55, height: 42, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.action, opacity: busy || (!draft.trim() && !image) ? 0.5 : 1 }}><Text style={{ color: colors.surface, fontSize: 11, fontWeight: "700" }}>{busy ? "发送中" : "发送"}</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  </PageFrame>;
}

function decodeBase64(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/\s/g, "").replace(/=+$/, "");
  const output = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let buffer = 0; let bits = 0; let offset = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const digit = alphabet.indexOf(clean[index]);
    if (digit < 0) throw new Error("图片编码无效，请重新选择图片。");
    buffer = (buffer << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; output[offset++] = (buffer >> bits) & 0xff; }
  }
  return output.subarray(0, offset);
}
