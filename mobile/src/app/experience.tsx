import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { Action, Notice, PageFrame } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";
import { useTheme } from "../lib/theme";
import { router } from "expo-router";

type Summary = { total: number; events?: Array<{ event_type?: string; type?: string; points: number; created_at?: string; createdAt?: string }>; claimedLevels?: number[]; membershipTier?: string };
const levels = [
  { threshold: 0, reward: "黑卡探索者", description: "获得黑卡探索者身份。" },
  { threshold: 100, reward: "LV2 探索徽章", description: "在个人资料中展示 LV2 探索徽章。" },
  { threshold: 240, reward: "头像边框", description: "解锁个人头像的金属边框。" },
  { threshold: 430, reward: "专属卡背", description: "解锁专属黑卡卡背样式。" },
  { threshold: 680, reward: "置顶收藏位 +1", description: "收藏夹额外增加一个置顶位置。" },
  { threshold: 1000, reward: "个人页主题色", description: "解锁个人主页主题色。" },
  { threshold: 1390, reward: "翻卡揭晓动效", description: "解锁专属翻卡揭晓动效。" },
  { threshold: 1850, reward: "置顶内容位 +1", description: "作品额外增加一个置顶位置。" },
  { threshold: 2380, reward: "探索者专属称号", description: "解锁个人资料专属称号。" },
  { threshold: 2980, reward: "黑卡收藏家边框", description: "获得黑卡收藏家头像边框。" },
];

export default function ExperienceScreen() {
  const { colors } = useTheme();
  const { session } = useMobileSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setSummary(await api<Summary>("/api/v1/progression", session)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "经验记录暂时无法加载。"); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void load(); }, [load]);
  const total = summary?.total || 0;
  const current = useMemo(() => Math.max(0, levels.findLastIndex((item) => total >= item.threshold)), [total]);
  const next = levels[current + 1];
  const progress = next ? Math.min(100, Math.floor(((total - levels[current].threshold) / (next.threshold - levels[current].threshold)) * 100)) : 100;
  const claim = async (level: number) => {
    if (!session || busy) return;
    setBusy(level); setError(""); setNotice("");
    try { await api("/api/v1/progression", session, { method: "POST", body: JSON.stringify({ level }) }); setNotice(`LV.${level} 奖励已领取。`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "奖励领取失败，请稍后重试。"); }
    finally { setBusy(0); }
  };

  if (!session) return <PageFrame title="等级与奖励" eyebrow="HEIKA / PROGRESSION"><Text style={{ color: colors.muted, fontSize: 13 }}>登录后查看经验进度和等级奖励。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;
  return <PageFrame title="等级与奖励" eyebrow="HEIKA / PROGRESSION" refreshing={loading} onRefresh={() => void load()}>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>翻开卡片、首次评分和完成任务可获得经验。进度会与网页端同步。</Text>
    <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    {loading && !summary ? <ActivityIndicator color={colors.action} /> : <>
      <Animated.View entering={FadeInDown.duration(240)} style={{ padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={{ color: colors.muted, fontSize: 11 }}>当前等级</Text><Text style={{ color: colors.ink, fontSize: 30, fontWeight: "800", marginTop: 3 }}>LV.{current + 1}</Text></View><Text style={{ color: colors.action, fontSize: 15, fontWeight: "700" }}>{total} EXP</Text></View>
        <View style={{ height: 5, backgroundColor: colors.line, marginTop: 13, overflow: "hidden" }}><Animated.View layout={LinearTransition.duration(240)} style={{ height: 5, width: `${progress}%`, backgroundColor: colors.action }} /></View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>{next ? `距离 LV.${current + 2} 还差 ${Math.max(0, next.threshold - total)} EXP` : "已达到最高等级"}</Text>
      </Animated.View>
      <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>经验获取</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 5 }}>首次翻开卡片、首次给内容评分和完成每日任务都会按服务端规则记入经验。重复评分不会重复获得经验。</Text></View>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700", marginTop: 7 }}>等级奖励</Text>
      {levels.map((item, index) => {
        const level = index + 1; const reached = total >= item.threshold; const claimed = (summary?.claimedLevels || []).includes(level);
        return <Animated.View key={level} entering={FadeInDown.duration(180).delay(Math.min(index * 20, 140))} layout={LinearTransition.duration(180)} style={{ paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View style={{ width: 42, minHeight: 38, justifyContent: "center", borderRightWidth: 2, borderColor: reached ? colors.action : colors.line }}><Text style={{ color: reached ? colors.action : colors.subtle, fontSize: 12, fontWeight: "800" }}>LV.{level}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: reached ? colors.ink : colors.muted, fontSize: 13, fontWeight: "700" }}>{item.reward}</Text><Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 15, marginTop: 3 }}>{item.description}</Text><Text style={{ color: colors.subtle, fontSize: 10, marginTop: 3 }}>{item.threshold} EXP</Text></View>
          {reached && level > 1 ? claimed ? <Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>已领取</Text> : <Pressable accessibilityRole="button" disabled={busy !== 0} onPress={() => void claim(level)} style={{ minWidth: 66, minHeight: 38, justifyContent: "center", alignItems: "flex-end" }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>{busy === level ? "领取中" : "领取"}</Text></Pressable> : reached ? <Text style={{ color: colors.subtle, fontSize: 10 }}>已解锁</Text> : <Text style={{ color: colors.subtle, fontSize: 10 }}>未解锁</Text>}
        </Animated.View>;
      })}
    </>}
  </PageFrame>;
}
