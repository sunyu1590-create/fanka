import React, { memo, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MotionPressable } from "../../components/MotionPressable";
import { useTheme } from "../../lib/theme";
import type { NativePost } from "../../lib/native-posts";
import { DiscoveryImage } from "./DiscoveryImage";
import { getFeedImageSource } from "./DiscoveryRepository";

type Props = {
  post: NativePost;
  channel: "community" | "ai";
  liked: boolean;
  saved: boolean;
  likeBusy: boolean;
  saveBusy: boolean;
  onOpen: (post: NativePost) => void;
  onOpenAuthor: (authorId?: string) => void;
  onLike: (post: NativePost) => void;
  onSave: (post: NativePost) => void;
};

function coverAspectRatio(postId: number) {
  const shape = Math.abs(postId) % 8;
  if (shape === 0) return 1 / 1.45;
  if (shape === 1 || shape === 2) return 1 / 1.18;
  return 4 / 5;
}

function plainSummary(value: string) {
  return value.replace(/[#*`>_\[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export const DiscoveryCard = memo(function DiscoveryCard({ post, channel, liked, saved, likeBusy, saveBusy, onOpen, onOpenAuthor, onLike, onSave }: Props) {
  const { colors, isDark } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const summary = useMemo(() => plainSummary(post.body), [post.body]);
  const hasImage = Boolean(getFeedImageSource(post.image));
  const ratingLabel = post.ratingCount > 0 ? post.ratingAverage.toFixed(1) : "待评级";
  const aiTypeLabel = post.contentType === "agent" ? "Agent" : post.contentType === "skill" ? "Skill" : post.contentType === "prompt" ? "Prompt" : post.contentType === "ai_tool" ? "AI 工具" : post.contentType === "tutorial" ? "实战教程" : "AI 知识";

  useEffect(() => {
    setImageFailed(false);
    setRetryKey(0);
  }, [post.cloudId, post.image]);

  const badges = <View pointerEvents="none" style={{ position: "absolute", top: 9, left: 9, right: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
    <View style={{ maxWidth: "68%", minHeight: 24, justifyContent: "center", paddingHorizontal: 8, borderRadius: 14, borderWidth: 0.75, borderColor: "rgba(255,255,255,0.42)", backgroundColor: isDark ? "rgba(18,22,22,0.76)" : "rgba(255,255,255,0.84)" }}>
      <Text numberOfLines={1} style={{ color: isDark ? "#F0F1EB" : "#303734", fontSize: 9, fontWeight: "600" }}>{channel === "ai" ? aiTypeLabel : post.tag}</Text>
    </View>
    <View accessibilityLabel={post.ratingCount > 0 ? `社区评分 ${ratingLabel}，${post.ratingCount} 人评分` : "待评级"} style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: 14, borderWidth: 0.75, borderColor: "rgba(197,168,74,0.56)", backgroundColor: isDark ? "rgba(18,22,22,0.78)" : "rgba(255,255,255,0.86)" }}>
      <Text style={{ color: colors.gold, fontSize: 11, fontWeight: "800" }}>★</Text>
      <Text style={{ color: isDark ? "#F0F1EB" : "#303734", fontSize: 9, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{ratingLabel}</Text>
    </View>
  </View>;

  const titleStyle = { color: "#FFFFFF", fontSize: 14, lineHeight: 19, fontWeight: "700" as const, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };
  return <View style={{ flex: 1, minWidth: 0, marginHorizontal: 5, marginBottom: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface }}>
    {hasImage ? <View style={{ aspectRatio: coverAspectRatio(post.id), overflow: "hidden", backgroundColor: imageFailed ? colors.raised : "#252B2A" }}>
      <MotionPressable accessibilityRole="button" accessibilityLabel={`阅读：${post.title}`} onPress={() => onOpen(post)} style={{ flex: 1, overflow: "hidden" }}>
        <DiscoveryImage uri={post.image} label={post.title} recyclingKey={post.cloudId} retryKey={retryKey} onError={() => setImageFailed(true)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
        <View pointerEvents="none" style={{ position: "absolute", right: 0, bottom: 0, left: 0, height: 86, backgroundColor: "rgba(0,0,0,0.25)" }} />
        {badges}
        {imageFailed ? <View pointerEvents="none" style={{ position: "absolute", top: 38, right: 8, bottom: 78, left: 8, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "600" }}>图片暂时无法加载</Text></View> : null}
        <Text numberOfLines={2} style={{ position: "absolute", right: 11, bottom: 12, left: 11, ...titleStyle }}>{post.title}</Text>
      </MotionPressable>
      {imageFailed ? <Pressable accessibilityRole="button" accessibilityLabel="重试加载图片" onPress={(event) => { event.stopPropagation(); setImageFailed(false); setRetryKey((value) => value + 1); }} style={{ position: "absolute", top: "50%", alignSelf: "center", marginTop: 17, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(18,22,22,0.72)" }}><Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>重试</Text></Pressable> : null}
    </View> : <MotionPressable accessibilityRole="button" accessibilityLabel={`阅读：${post.title}`} onPress={() => onOpen(post)} style={{ minHeight: 166, justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 12, paddingBottom: 13, backgroundColor: colors.raised }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 7 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.action, fontSize: 9, fontWeight: "700" }}>{channel === "ai" ? aiTypeLabel : `#${post.tag}`}</Text>
        <View accessibilityLabel={post.ratingCount > 0 ? `社区评分 ${ratingLabel}` : "待评级"} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Text style={{ color: colors.gold, fontSize: 11, fontWeight: "800" }}>★</Text><Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{ratingLabel}</Text></View>
      </View>
      <View style={{ marginTop: 12 }}>
        <Text numberOfLines={3} style={{ color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "700" }}>{post.title}</Text>
        {summary ? <Text numberOfLines={4} style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }}>{summary}</Text> : null}
      </View>
      <Text style={{ color: colors.subtle, fontSize: 9, marginTop: 12 }}>阅读全文　↗</Text>
    </MotionPressable>}

    {hasImage && channel === "ai" && summary ? <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 10, lineHeight: 15, paddingHorizontal: 10, paddingTop: 8 }}>{summary}</Text> : null}
    <View style={{ minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingTop: hasImage && channel === "ai" && summary ? 3 : 0, paddingBottom: 5 }}>
      {post.authorId ? <Pressable accessibilityRole="button" accessibilityLabel={`查看作者 ${post.author}`} onPress={() => onOpenAuthor(post.authorId)} style={{ flex: 1, minHeight: 34, justifyContent: "center", marginRight: 4 }}><Text numberOfLines={1} style={{ color: colors.subtle, fontSize: 9, fontWeight: "600" }}>{post.author || "探索者"}</Text></Pressable> : <Text numberOfLines={1} style={{ flex: 1, color: colors.subtle, fontSize: 9, marginRight: 4 }}>{post.author || "探索者"}</Text>}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        {channel === "ai" ? <Pressable accessibilityRole="button" accessibilityLabel={saved ? "取消收藏资源" : "收藏资源"} accessibilityState={{ selected: saved }} disabled={saveBusy} onPress={() => onSave(post)} hitSlop={6} style={{ minWidth: 28, minHeight: 32, alignItems: "center", justifyContent: "center" }}><Text style={{ color: saved ? colors.gold : colors.muted, fontSize: 15 }}>{saved ? "♥" : "♡"}</Text></Pressable> : null}
        {channel === "community" ? <Pressable accessibilityRole="button" accessibilityLabel={liked ? "取消点赞" : "点赞"} accessibilityState={{ selected: liked }} disabled={likeBusy} onPress={() => onLike(post)} hitSlop={6} style={{ minWidth: 27, minHeight: 32, alignItems: "center", justifyContent: "center" }}><Text style={{ color: liked ? colors.danger : colors.muted, fontSize: 15 }}>{liked ? "♥" : "♡"}</Text></Pressable> : null}
        <Text style={{ color: liked && channel === "community" ? colors.danger : colors.muted, fontSize: 9, fontVariant: ["tabular-nums"] }}>{post.likeCount}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`打开详情：${post.title}`} onPress={() => onOpen(post)} hitSlop={6} style={{ minWidth: 27, minHeight: 32, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 14, fontWeight: "700" }}>↗</Text></Pressable>
      </View>
    </View>
  </View>;
});
