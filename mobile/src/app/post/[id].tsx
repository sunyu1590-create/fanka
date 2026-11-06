import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Action, Notice, PageFrame, SectionTitle, palette, ui } from "../../components/MobileUi";
import { api, getDb, useMobileSession } from "../../lib/mobile-api";

type Post = { title: string; body: string; image_url?: string | null; cover_text?: string | null; created_at?: string; profiles?: { nickname?: string } | null };
type Comment = { id: string; author_id: string; body: string; created_at: string };
type Author = { nickname?: string | null; avatar_url?: string | null };

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useMobileSession();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const [detail, rows] = await Promise.all([api<Post>(`/api/v1/posts/${id}`), api<Comment[]>(`/api/v1/posts/${id}/comments?sort=new`)]);
      setPost(detail); setComments(rows || []);
      const ids = [...new Set((rows || []).map((row) => row.author_id))];
      if (ids.length) {
        try {
          const client = await getDb();
          const { data } = await client.from("profiles").select("id,nickname,avatar_url").in("id", ids);
          setAuthors(Object.fromEntries((data || []).map((profile) => [profile.id, profile])));
        } catch { setAuthors({}); }
      } else setAuthors({});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "内容读取失败"); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    if (!session) { router.push("/account"); return; }
    if (!draft.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const comment = await api<Comment>(`/api/v1/posts/${id}/comments`, session, { method: "POST", body: JSON.stringify({ body: draft.trim() }) });
      setComments((current) => [comment, ...current]); setDraft("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "评论没有发送，请重试。"); }
    finally { setBusy(false); }
  };
  return <PageFrame title="内容详情" eyebrow="DISCOVER / POST" refreshing={loading} onRefresh={() => void load()}>
    {loading && !post ? <ActivityIndicator color={palette.green} /> : null}
    <Notice>{error}</Notice>
    {post ? <>
      {post.image_url ? <Image source={{ uri: post.image_url }} alt={post.title} resizeMode="cover" style={cover} /> : <View style={coverBlank}><Text style={blankText}>{post.cover_text || "HEIKA"}</Text></View>}
      <Text style={title}>{post.title}</Text>
      <Text style={ui.rowSubtitle}>{post.profiles?.nickname || "黑卡探索者"}{post.created_at ? ` · ${post.created_at.slice(0, 10)}` : ""}</Text>
      <Text style={body}>{post.body}</Text>
      <SectionTitle detail={`${comments.length} 条`}>评论</SectionTitle>
      <View style={composer}><TextInput value={draft} onChangeText={setDraft} maxLength={1000} placeholder="写下你的想法…" placeholderTextColor={palette.muted} style={commentInput} /><View style={{ width: 66 }}><Action title={busy ? "…" : "发送"} disabled={busy || !draft.trim()} onPress={() => void send()} /></View></View>
      {comments.map((comment) => <View key={comment.id} style={commentRow}><View style={avatar}>{authors[comment.author_id]?.avatar_url ? <Image source={{ uri: authors[comment.author_id].avatar_url! }} alt={authors[comment.author_id].nickname || "用户头像"} style={avatarImage} /> : <Text style={avatarLabel}>{(authors[comment.author_id]?.nickname || (comment.author_id === session?.user.id ? "我" : "探")).slice(0, 1)}</Text>}</View><View style={{ flex: 1 }}><Text style={ui.rowSubtitle}>{comment.author_id === session?.user.id ? "我" : authors[comment.author_id]?.nickname || "探索者"} · {new Date(comment.created_at).toLocaleDateString("zh-CN")}</Text><Text style={commentText}>{comment.body}</Text></View></View>)}
    </> : !loading ? <Text style={ui.muted}>这篇内容暂时无法打开。</Text> : null}
  </PageFrame>;
}

const cover = { width: "100%", height: 290, backgroundColor: "#E8ECE8", marginBottom: 8 } as const;
const coverBlank = { height: 170, alignItems: "center", justifyContent: "center", backgroundColor: "#E8ECE8" } as const;
const blankText = { color: palette.green, fontSize: 18, letterSpacing: 4 } as const;
const title = { color: palette.ink, fontSize: 25, lineHeight: 32, fontWeight: "700", marginTop: 8 } as const;
const body = { color: palette.ink, fontSize: 15, lineHeight: 25, marginTop: 12 } as const;
const composer = { flexDirection: "row", alignItems: "center", gap: 8 } as const;
const commentInput = { flex: 1, minHeight: 45, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 12, backgroundColor: palette.paper, color: palette.ink } as const;
const commentRow = { flexDirection: "row", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.line } as const;
const avatar = { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#E8ECE8" } as const;
const avatarLabel = { color: palette.green, fontSize: 12, fontWeight: "700" } as const;
const avatarImage = { width: 32, height: 32, borderRadius: 16 } as const;
const commentText = { color: palette.ink, fontSize: 14, lineHeight: 21, marginTop: 4 } as const;
