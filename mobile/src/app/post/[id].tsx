import { NativeMarkdown } from "../../components/NativeMarkdown";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScaledSize } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../../components/MobileUi";
import { MotionPressable } from "../../components/MotionPressable";
import { NativeImage } from "../../components/NativeImage";
import { API_BASE, api, getDb, useMobileSession } from "../../lib/mobile-api";
import { useTheme } from "../../lib/theme";

type Post = { id: string; client_id: number; title: string; body: string; images?: string[]; image_url?: string | null; cover_text?: string | null; created_at?: string; author_id?: string | null; profiles?: { nickname?: string | null; avatar_url?: string | null } | null; interest_tags?: { name?: string | null } | null; post_media?: Array<{ storage_path: string; sort_order: number }> };
type Comment = { id: string; author_id: string; parent_id: string | null; body: string; created_at: string; likeCount: number; liked: boolean; author?: { nickname?: string | null; avatar_url?: string | null } | null };
type Rating = { average: number; count: number; myRating: number | null };
type CommentPage = { items: Comment[]; total: number; has_more: boolean; hot_window_limited?: boolean; page: number; limit: number };
const reportReasons = ["垃圾营销或重复内容", "骚扰、仇恨或攻击", "虚假或误导信息", "侵权或未经授权转载", "不适宜或危险内容", "其他"];

export default function PostScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useMobileSession();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsHotWindowLimited, setCommentsHotWindowLimited] = useState(false);
  const [loadingCommentsMore, setLoadingCommentsMore] = useState(false);
  const [rating, setRating] = useState<Rating>({ average: 0, count: 0, myRating: null });
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sort, setSort] = useState<"hot" | "new">("new");
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replying, setReplying] = useState<Comment | null>(null);
  const [draft, setDraft] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportComment, setReportComment] = useState<Comment | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pageWidth, setPageWidth] = useState(Dimensions.get("window").width - 36);
  const [imagePage, setImagePage] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const [detail, rows, initialRating] = await Promise.all([
        api<Post>(`/api/v1/posts/${id}`, session),
        api<CommentPage>(`/api/v1/posts/${id}/comments?sort=${sort}&page=1&limit=30`, session),
        api<Rating>(`/api/v1/posts/${id}/rating`, session).catch(() => ({ average: 0, count: 0, myRating: null })),
      ]);
      setPost(detail); setComments(rows.items || []); setCommentsTotal(rows.total || 0); setCommentsHasMore(Boolean(rows.has_more)); setCommentsPage(1); setCommentsHotWindowLimited(Boolean(rows.hot_window_limited)); setRating(initialRating);
      if (session) {
        const client = await getDb();
        const [interaction, bookmark] = await Promise.all([
          client.from("user_interactions").select("liked").eq("post_id", detail.id).eq("user_id", session.user.id).maybeSingle(),
          client.from("bookmarks").select("post_id").eq("post_id", detail.id).eq("user_id", session.user.id).maybeSingle(),
        ]);
        if (interaction.error) throw interaction.error;
        if (bookmark.error) throw bookmark.error;
        setLiked(Boolean(interaction.data?.liked)); setSaved(Boolean(bookmark.data));
      } else { setLiked(false); setSaved(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "内容读取失败，请检查网络后重试。"); }
    finally { setLoading(false); }
  }, [id, session, sort]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const subscription = Dimensions.addEventListener("change", ({ window }: { window: ScaledSize }) => setPageWidth(window.width - 36)); return () => subscription.remove(); }, []);
  useEffect(() => { setImagePage(0); }, [id]);

  const loadMoreComments = async () => {
    if (!post || loadingCommentsMore || !commentsHasMore) return;
    setLoadingCommentsMore(true);
    try {
      const nextPage = commentsPage + 1;
      const result = await api<CommentPage>(`/api/v1/posts/${post.id}/comments?sort=${sort}&page=${nextPage}&limit=30`, session);
      setComments((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...(result.items || []).filter((item) => !known.has(item.id))];
      });
      setCommentsPage(nextPage); setCommentsHasMore(Boolean(result.has_more)); setCommentsTotal(result.total || 0); setCommentsHotWindowLimited(Boolean(result.hot_window_limited));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "更多评论暂时无法加载，请重试。"); }
    finally { setLoadingCommentsMore(false); }
  };

  const images = useMemo(() => {
    if (!post) return [];
    if (post.images?.length) return post.images;
    const media = [...(post.post_media || [])].sort((a, b) => a.sort_order - b.sort_order).map((item) => `${API_BASE}/api/v1/media?path=${encodeURIComponent(item.storage_path)}&redirect=1`);
    return [...(post.image_url ? [post.image_url] : []), ...media];
  }, [post]);
  const roots = useMemo(() => comments.filter((comment) => !comment.parent_id), [comments]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of comments) if (comment.parent_id) map.set(comment.parent_id, [...(map.get(comment.parent_id) || []), comment]);
    return map;
  }, [comments]);

  const toggleLike = async () => {
    if (!session) { router.push("/account"); return; }
    if (!post || busy) return;
    const previous = liked; setLiked(!previous); setBusy(true); setError("");
    try { await api("/api/v1/library-state", session, { method: "POST", body: JSON.stringify({ action: "like", id: post.client_id, value: !previous }) }); }
    catch (cause) { setLiked(previous); setError(cause instanceof Error ? cause.message : "点赞失败，请重试。"); }
    finally { setBusy(false); }
  };
  const toggleBookmark = async () => {
    if (!session) { router.push("/account"); return; }
    if (!post || busy) return;
    const previous = saved; setSaved(!previous); setBusy(true); setError("");
    try { await api("/api/v1/library-state", session, { method: "POST", body: JSON.stringify({ action: "bookmark", id: post.client_id, value: !previous }) }); setNotice(previous ? "已从收藏中移除。" : "已加入我的收藏。"); }
    catch (cause) { setSaved(previous); setError(cause instanceof Error ? cause.message : "收藏状态保存失败。"); }
    finally { setBusy(false); }
  };
  const rate = async (value: number) => {
    if (!session) { router.push("/account"); return; }
    if (!post || ratingBusy || post.author_id === session.user.id) return;
    const previous = rating; setRating((current) => ({ ...current, myRating: value })); setRatingBusy(true); setError(""); setNotice("");
    try {
      const result = await api<Rating & { experience?: { awarded?: number } }>(`/api/v1/posts/${post.client_id}/rating`, session, { method: "POST", body: JSON.stringify({ rating: value }) });
      setRating(result); if (result.experience?.awarded) setNotice(`首次评分已获得 ${result.experience.awarded} EXP。`);
    } catch (cause) { setRating(previous); setError(cause instanceof Error ? cause.message : "评分没有保存，请重试。"); }
    finally { setRatingBusy(false); }
  };
  const sendComment = async () => {
    if (!session) { router.push("/account"); return; }
    const body = draft.trim();
    if (!post || !body || busy || body.length > 1000) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const comment = await api<Comment>(`/api/v1/posts/${post.id}/comments`, session, { method: "POST", body: JSON.stringify({ body, parent_id: replying?.id }) });
      setComments((current) => sort === "new" ? [comment, ...current] : [...current, comment]); setCommentsTotal((count) => count + 1); setDraft("");
      if (replying) setExpandedReplies((current) => ({ ...current, [replying.id]: true }));
      setReplying(null); setNotice("评论已发送。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "评论没有发送，草稿仍保留，请重试。"); }
    finally { setBusy(false); }
  };
  const toggleCommentLike = async (comment: Comment) => {
    if (!session) { router.push("/account"); return; }
    const previousLiked = comment.liked; const previousCount = comment.likeCount;
    setComments((current) => current.map((item) => item.id === comment.id ? { ...item, liked: !previousLiked, likeCount: Math.max(0, previousCount + (previousLiked ? -1 : 1)) } : item));
    try {
      await api(`/api/v1/comments/${comment.id}/reactions${previousLiked ? "?kind=like" : ""}`, session, { method: previousLiked ? "DELETE" : "POST", ...(previousLiked ? {} : { body: JSON.stringify({ kind: "like" }) }) });
    } catch (cause) { setComments((current) => current.map((item) => item.id === comment.id ? { ...item, liked: previousLiked, likeCount: previousCount } : item)); setError(cause instanceof Error ? cause.message : "评论点赞失败。"); }
  };
  const deleteComment = async (comment: Comment) => {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/api/v1/comments/${comment.id}`, session, { method: "DELETE" });
      const removed = comments.filter((item) => item.id === comment.id || item.parent_id === comment.id).length;
      setComments((current) => current.filter((item) => item.id !== comment.id && item.parent_id !== comment.id));
      setCommentsTotal((count) => Math.max(0, count - removed)); setNotice("评论已删除。");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "评论删除失败。"); }
    finally { setBusy(false); }
  };
  const submitReport = async (comment?: Comment) => {
    if (!session) { router.push("/account"); return; }
    if (!reportReason || busy) { if (!reportReason) setError("请选择举报原因。"); return; }
    setBusy(true); setError("");
    try { await api("/api/v1/reports", session, { method: "POST", body: JSON.stringify({ ...(comment ? { comment_id: comment.id } : { post_id: post?.id }), reason: reportReason, note: reportNote }) }); setReportOpen(false); setReportComment(null); setReportReason(""); setReportNote(""); setNotice("举报已提交，平台会进行审核。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "举报提交失败。"); }
    finally { setBusy(false); }
  };

  return <PageFrame title="内容详情" eyebrow="DISCOVER / POST" refreshing={loading} onRefresh={() => void load()}>
    <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    {loading && !post ? <ActivityIndicator color={colors.action} /> : null}
    {post ? <>
      {images.length ? <View onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event) => setImagePage(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, pageWidth)))}>
          {images.map((uri, index) => <NativeImage key={`${uri}:${index}`} uri={uri} label={post.title} resizeMode="cover" style={{ width: pageWidth, height: Math.min(450, pageWidth * 1.12), backgroundColor: colors.raised }} />)}
        </ScrollView>
        {images.length > 1 ? <Text style={{ color: colors.muted, fontSize: 10, textAlign: "right", marginTop: 5 }}>{imagePage + 1} / {images.length}</Text> : null}
      </View> : <View style={{ minHeight: 150, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised }}><Text style={{ color: colors.action, fontSize: 16, letterSpacing: 3 }}>{post.cover_text || "HEIKA"}</Text></View>}
      <Text style={{ color: colors.action, fontSize: 10, fontWeight: "700", letterSpacing: 0.7, marginTop: 5 }}>#{post.interest_tags?.name || "生活"}</Text>
      <Text style={{ color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: "800", marginTop: 5 }}>{post.title}</Text>
      <Pressable onPress={() => post.author_id && router.push({ pathname: "/profile/[id]", params: { id: post.author_id } } as never)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.line }}>
        <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{post.profiles?.avatar_url ? <NativeImage uri={post.profiles.avatar_url} label="作者头像" style={{ width: 30, height: 30 }} /> : <Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>{(post.profiles?.nickname || "探").slice(0, 1)}</Text>}</View>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>{post.profiles?.nickname || "黑卡探索者"}</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>· {post.created_at ? new Date(post.created_at).toLocaleDateString("zh-CN") : ""}</Text>
      </Pressable>
      <View style={{marginTop:13}}><NativeMarkdown source={post.body}/></View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18, paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.line }}>
        <MotionPressable accessibilityRole="button" accessibilityLabel={`${liked ? "取消赞" : "点赞"}`} onPress={() => void toggleLike()} style={{ minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: liked ? colors.danger : colors.muted, fontSize: 20 }}>{liked ? "♥" : "♡"}</Text><Text style={{ color: liked ? colors.danger : colors.muted, fontSize: 12 }}>赞</Text></MotionPressable>
        <MotionPressable accessibilityRole="button" onPress={() => void toggleBookmark()} style={{ minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: saved ? colors.gold : colors.muted, fontSize: 18 }}>{saved ? "◆" : "◇"}</Text><Text style={{ color: saved ? colors.gold : colors.muted, fontSize: 12 }}>{saved ? "已收藏" : "收藏"}</Text></MotionPressable>
        <Pressable onPress={() => { setReportComment(null); setReportReason(""); setReportOpen((value) => !value); }} style={{ minHeight: 42, justifyContent: "center", marginLeft: "auto" }}><Text style={{ color: colors.subtle, fontSize: 11 }}>更多　···</Text></Pressable>
      </View>
      {reportOpen ? <Animated.View entering={FadeInDown.duration(180)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 12, fontWeight: "700", marginBottom: 8 }}>{reportComment ? "举报评论" : "举报内容"}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{reportReasons.map((reason) => <Pressable key={reason} onPress={() => setReportReason(reason)} style={{ paddingVertical: 7, paddingHorizontal: 9, borderWidth: 1, borderColor: reportReason === reason ? colors.action : colors.line, backgroundColor: reportReason === reason ? colors.actionSoft : colors.surface }}><Text style={{ color: reportReason === reason ? colors.action : colors.muted, fontSize: 10 }}>{reason}</Text></Pressable>)}</View><TextInput value={reportNote} onChangeText={setReportNote} maxLength={300} placeholder="补充说明（可选）" placeholderTextColor={colors.subtle} style={{ minHeight: 42, paddingHorizontal: 10, marginTop: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 12 }} /><Pressable onPress={() => void submitReport(reportComment || undefined)} style={{ alignSelf: "flex-end", minHeight: 38, justifyContent: "center", paddingHorizontal: 10 }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>{busy ? "提交中…" : "提交举报"}</Text></Pressable><Pressable onPress={() => { setReportOpen(false); setReportComment(null); }} style={{ alignSelf: "flex-end", minHeight: 30, justifyContent: "center", paddingHorizontal: 10 }}><Text style={{ color: colors.subtle, fontSize: 10 }}>取消</Text></Pressable></Animated.View> : null}
      <View style={{ paddingTop: 15, paddingBottom: 9, borderBottomWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}><Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>给这篇内容评分</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{rating.count ? `${rating.average.toFixed(1)} 分 · ${rating.count} 人` : "暂无评分"}</Text></View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 }}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} 星`} accessibilityState={{ selected: rating.myRating === value }} disabled={ratingBusy || post.author_id === session?.user.id} onPress={() => void rate(value)} style={{ minWidth: 40, minHeight: 42, alignItems: "center", justifyContent: "center" }}><Animated.Text entering={rating.myRating === value ? FadeIn.duration(200) : undefined} style={{ color: rating.myRating && rating.myRating >= value ? colors.gold : colors.subtle, fontSize: 25 }}>★</Animated.Text></Pressable>)}<Text style={{ color: colors.muted, fontSize: 10, marginLeft: 4 }}>{post.author_id === session?.user.id ? "作者不能给自己的内容评分" : rating.myRating ? "已评分，可再次调整" : "选择星级"}</Text></View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 17, paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>评论{commentsTotal >= 100 ? " · 99+" : ` · ${commentsTotal}`}</Text><View style={{ flexDirection: "row", gap: 13 }}>{([["hot", "最热"], ["new", "最新"]] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: sort === value }} onPress={() => setSort(value)}><Text style={{ color: sort === value ? colors.action : colors.muted, fontSize: 11, fontWeight: sort === value ? "700" : "500" }}>{label}</Text></Pressable>)}</View></View>
      {commentsHotWindowLimited && sort === "hot" ? <Text style={{ color: colors.subtle, fontSize: 10, paddingTop: 8 }}>最热排序基于最近 100 条评论；切换“最新”可继续浏览全部评论。</Text> : null}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}>
          {replying ? <View style={{ minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.action, fontSize: 11 }}>回复 {replying.author?.nickname || "探索者"}</Text><Pressable onPress={() => setReplying(null)}><Text style={{ color: colors.muted, fontSize: 11 }}>取消回复</Text></Pressable></View> : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}><TextInput value={draft} onChangeText={setDraft} maxLength={1000} multiline placeholder={replying ? `回复 ${replying.author?.nickname || "探索者"}…` : "写下你的想法…"} placeholderTextColor={colors.subtle} style={{ flex: 1, minHeight: 43, maxHeight: 100, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: colors.raised, color: colors.ink, fontSize: 13 }} /><Pressable accessibilityRole="button" onPress={() => void sendComment()} disabled={busy || !draft.trim()} style={{ minWidth: 55, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: colors.action, opacity: busy || !draft.trim() ? 0.5 : 1 }}><Text style={{ color: colors.surface, fontSize: 11, fontWeight: "700" }}>{busy ? "发送中" : "发送"}</Text></Pressable></View>
        </View>
        {roots.map((comment, index) => {
          const replies = repliesByParent.get(comment.id) || [];
          const visibleReplies = expandedReplies[comment.id] ? replies : replies.slice(0, 2);
          return <Animated.View key={comment.id} entering={FadeInDown.duration(180).delay(Math.min(index * 10, 80))} layout={LinearTransition.duration(160)} style={{ paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.line }}>
            <CommentRow comment={comment} own={comment.author_id === session?.user.id} authorId={post.author_id} onReply={() => setReplying(comment)} onLike={() => void toggleCommentLike(comment)} onDelete={() => void deleteComment(comment)} onReport={() => { setReportOpen(true); setReportComment(comment); setReportReason(""); setReportNote(""); setReplying(null); }} colors={colors} />
            {visibleReplies.map((reply) => <View key={reply.id} style={{ marginLeft: 40, marginTop: 11, paddingLeft: 10, borderLeftWidth: 1, borderColor: colors.line }}><CommentRow comment={reply} own={reply.author_id === session?.user.id} authorId={post.author_id} onReply={() => setReplying(comment)} onLike={() => void toggleCommentLike(reply)} onDelete={() => void deleteComment(reply)} onReport={() => { setReportOpen(true); setReportComment(reply); setReportReason(""); setReportNote(""); }} colors={colors} compact /></View>)}
            {replies.length > 2 ? <Pressable onPress={() => setExpandedReplies((current) => ({ ...current, [comment.id]: !current[comment.id] }))} style={{ minHeight: 34, marginLeft: 40, justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 10, fontWeight: "600" }}>{expandedReplies[comment.id] ? "收起回复" : `展开其余 ${replies.length - 2} 条回复`}</Text></Pressable> : null}
          </Animated.View>;
        })}
        {!loading && !comments.length ? <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 24 }}>还没有评论，来写下第一条想法。</Text> : null}
        {commentsHasMore ? <Pressable accessibilityRole="button" onPress={() => void loadMoreComments()} disabled={loadingCommentsMore} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "600" }}>{loadingCommentsMore ? "正在加载…" : "加载更多评论"}</Text></Pressable> : null}
      </KeyboardAvoidingView>
    </> : !loading ? <View style={{ paddingVertical: 24 }}><Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>内容暂时无法显示</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>{error || "请检查网络后重试。"}</Text><Action title="重新加载" subtle onPress={() => void load()} /></View> : null}
  </PageFrame>;
}

function CommentRow({ comment, own, authorId, onReply, onLike, onDelete, onReport, colors, compact = false }: { comment: Comment; own: boolean; authorId?: string | null; onReply: () => void; onLike: () => void; onDelete: () => void; onReport: () => void; colors: ReturnType<typeof useTheme>["colors"]; compact?: boolean }) {
  const [actionsOpen, setActionsOpen] = useState(false);
  return <View style={{ flexDirection: "row", gap: compact ? 8 : 10 }}>
    <Pressable onPress={() => comment.author_id && router.push({ pathname: "/profile/[id]", params: { id: comment.author_id } } as never)} style={{ width: compact ? 27 : 36, height: compact ? 27 : 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, overflow: "hidden" }}>{comment.author?.avatar_url ? <NativeImage uri={comment.author.avatar_url} label="评论头像" style={{ width: compact ? 27 : 36, height: compact ? 27 : 36 }} /> : <Text style={{ color: colors.action, fontSize: compact ? 10 : 12, fontWeight: "700" }}>{(comment.author?.nickname || "探").slice(0, 1)}</Text>}</Pressable>
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ minHeight: 19, flexDirection: "row", alignItems: "center", gap: 6 }}><Text numberOfLines={1} style={{ maxWidth: "70%", color: colors.ink, fontSize: 13, fontWeight: "700" }}>{comment.author?.nickname || "探索者"}</Text>{comment.author_id === authorId ? <Text style={{ color: colors.subtle, fontSize: 9 }}>作者</Text> : null}</View>
      <Text selectable style={{ color: colors.ink, fontSize: 14, lineHeight: 22, marginTop: 3 }}>{comment.body}</Text>
      <View style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 3 }}><Text style={{ color: colors.subtle, fontSize: 10 }}>{relativeTime(comment.created_at)}</Text><Pressable onPress={onReply} hitSlop={5}><Text style={{ color: colors.muted, fontSize: 10 }}>回复</Text></Pressable><Pressable onPress={() => setActionsOpen((value) => !value)} hitSlop={5}><Text style={{ color: colors.muted, fontSize: 10 }}>更多</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={comment.liked ? "取消评论点赞" : "点赞评论"} onPress={onLike} style={{ marginLeft: "auto", minWidth: 42, minHeight: 36, alignItems: "flex-end", justifyContent: "center" }}><Text style={{ color: comment.liked ? colors.danger : colors.muted, fontSize: 12 }}>{comment.liked ? "♥" : "♡"} {comment.likeCount}</Text></Pressable></View>
      {actionsOpen ? <View style={{ flexDirection: "row", gap: 14, paddingVertical: 6 }}><Pressable onPress={() => { setActionsOpen(false); onReport(); }}><Text style={{ color: colors.muted, fontSize: 10 }}>举报评论</Text></Pressable>{own ? <Pressable onPress={() => { setActionsOpen(false); onDelete(); }}><Text style={{ color: colors.danger, fontSize: 10 }}>删除评论</Text></Pressable> : null}</View> : null}
    </View>
  </View>;
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
