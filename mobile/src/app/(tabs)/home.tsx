import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, Vibration } from "react-native";
import { router } from "expo-router";
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../../lib/theme";
import { API_BASE, api, useMobileSession } from "../../lib/mobile-api";
import { readCache, writeCache } from "../../lib/local-store";
import { NativeImage } from "../../components/NativeImage";
import { NativeIcon } from "../../components/NativeIcon";
import { MotionPressable } from "../../components/MotionPressable";
import { Action, Notice } from "../../components/MobileUi";
import type { NativePost } from "../../lib/native-posts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomNavStyle } from "../../lib/navigation-preferences";

type DeckCard = { deck_id: string; local_date: string; slot: number; post_id: string; opened_at: string | null; swapped_at: string | null };
type RawPost = { id: string; client_id: number; title: string; body: string; image_url?: string | null; author_id?: string | null; interest_tags?: { name?: string | null } | null; profiles?: { nickname?: string | null } | null; post_media?: Array<{ storage_path: string; sort_order: number }> };
type Experience = { total: number; membershipTier?: "free" | "plus" | "pro"; events?: Array<{ type: string; points: number; createdAt: string }>; claimedLevels?: number[] };
type Mission = { key: string; title: string; description: string; progress: number; target: number; points: number; claimed: boolean };
type DailyMissions = { missions?: Mission[] };
type RevealedCard = { post: NativePost; rarity: string; ratingCount: number; ratingAverage: number; xp: number };

const levels = [0, 100, 240, 430, 680, 1000, 1390, 1850, 2380, 2980];

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { style: navStyle } = useBottomNavStyle();
  const { session, loading: authLoading } = useMobileSession();
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [revealed, setRevealed] = useState<Record<number, RevealedCard>>({});
  const [phase, setPhase] = useState<Record<number, "closed" | "rarity" | "content">>({});
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [busyMission, setBusyMission] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const hydration = useRef(new Set<number>());
  const phaseTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const level = useMemo(() => Math.max(1, levels.filter((xp) => (experience?.total || 0) >= xp).length), [experience?.total]);
  const nextLevel = levels[Math.min(level, levels.length - 1)];
  const levelStart = levels[level - 1] || 0;
  const progress = level >= 10 ? 100 : Math.min(100, Math.floor(((experience?.total || 0) - levelStart) / Math.max(1, nextLevel - levelStart) * 100));
  const openedCount = deck.filter((card) => card.opened_at).length;
  const todayFlipXp = (experience?.events || []).filter((event) => event.type === "flip" && new Date(event.createdAt).toDateString() === new Date().toDateString()).reduce((sum, event) => sum + event.points, 0);

  const load = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setError("");
    try {
      const cacheKey = `deck:${session.user.id}`;
      const cached = await readCache<{ deck: DeckCard[]; experience: Experience; missions: Mission[] }>(cacheKey, 10 * 60 * 1000);
      if (cached) { setDeck([...cached.deck].sort((a, b) => a.slot - b.slot)); setExperience(cached.experience); setMissions(cached.missions); setLoading(false); }
      const [deckRows, xp, tasks] = await Promise.all([
        api<DeckCard[]>("/api/v1/deck", session),
        api<Experience>("/api/v1/progression", session),
        api<DailyMissions>("/api/v1/daily-missions", session).catch(() => ({ missions: [] })),
      ]);
      const rows = Array.isArray(deckRows) ? [...deckRows].sort((a, b) => a.slot - b.slot) : [];
      setDeck(rows); setExperience(xp); setMissions(tasks.missions || []);
      void writeCache(cacheKey, { deck: rows, experience: xp, missions: tasks.missions || [] });
      setRevealed((current) => {
        const next = { ...current };
        for (const card of rows) if (!card.opened_at) { delete next[card.slot]; }
        return next;
      });
      setPhase((current) => {
        const next = { ...current };
        for (const card of rows) if (card.opened_at && !next[card.slot]) next[card.slot] = "content";
        return next;
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "首页数据加载失败，请下拉重试。"); }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { for (const timer of phaseTimers.current.values()) clearTimeout(timer); }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const openCards = deck.filter((card) => card.opened_at && !revealed[card.slot] && !hydration.current.has(card.slot));
    for (const card of openCards) {
      hydration.current.add(card.slot);
      void (async () => {
        try {
          const raw = await api<RawPost>(`/api/v1/posts/${card.post_id}`, session);
          if (!active) return;
          const media = [...(raw.post_media || [])].sort((a, b) => a.sort_order - b.sort_order);
          const image = raw.image_url || (media[0] ? `${API_BASE}/api/v1/media?path=${encodeURIComponent(media[0].storage_path)}&redirect=1` : undefined);
          const rating = await api<{ average: number; count: number }>(`/api/v1/posts/${raw.client_id}/rating`, session).catch(() => ({ average: 0, count: 0 }));
          const rarity = rating.count < 5 ? "评分形成中" : rating.average >= 4.8 && rating.count >= 20 ? "SSS" : rating.average >= 4.5 && rating.count >= 10 ? "SS" : rating.average >= 4 && rating.count >= 5 ? "S" : "普通黑卡";
          const post: NativePost = { id: raw.client_id, cloudId: raw.id, title: raw.title, body: raw.body || "", tag: raw.interest_tags?.name || "生活", topics: [], image, images: image ? [image] : [], author: raw.profiles?.nickname || "黑卡探索者", authorId: raw.author_id || undefined, date: "", likeCount: 0, viewCount: 0, channel: "community", isDemo: false };
          if (active) setRevealed((current) => ({ ...current, [card.slot]: { post, rarity, ratingCount: rating.count, ratingAverage: rating.average, xp: 0 } }));
        } catch { if (active) setError("已翻开的卡片暂时无法恢复，请检查网络后重试。"); }
        finally { hydration.current.delete(card.slot); }
      })();
    }
    return () => { active = false; };
  }, [deck, revealed, session]);
  const openCard = async (card: DeckCard) => {
    if (!session) { router.push("/account"); return; }
    if (revealed[card.slot]) return;
    if (busySlot !== null) return;
    if (card.opened_at) { setError("这张卡已翻开，刷新后可以重新打开内容。"); return; }
    setBusySlot(card.slot); setError(""); setNotice("");
    try {
      const updatedDeck = await api<DeckCard[]>("/api/v1/deck", session, { method: "POST", body: JSON.stringify({ action: "open", slot: card.slot }) });
      const orderedDeck = Array.isArray(updatedDeck) ? [...updatedDeck].sort((a, b) => a.slot - b.slot) : deck;
      setDeck(orderedDeck);
      Vibration.vibrate(12);
      const raw = await api<RawPost>(`/api/v1/posts/${card.post_id}`, session);
      const postMedia = [...(raw.post_media || [])].sort((a, b) => a.sort_order - b.sort_order);
      const firstImage = raw.image_url || (postMedia[0] ? `${API_BASE}/api/v1/media?path=${encodeURIComponent(postMedia[0].storage_path)}&redirect=1` : undefined);
      let experienceAward = 0;
      try {
        const opened = await api<{ experience?: { awarded?: number; total?: number } }>("/api/v1/library-state", session, { method: "POST", body: JSON.stringify({ action: "open", id: raw.client_id }) });
        experienceAward = Number(opened.experience?.awarded) || 0;
      } catch { /* Opening the card remains valid if experience sync is temporarily unavailable. */ }
      const rating = await api<{ average: number; count: number }>(`/api/v1/posts/${raw.client_id}/rating`, session).catch(() => ({ average: 0, count: 0 }));
      const rarity = rating.count < 5 ? "评分形成中" : rating.average >= 4.8 && rating.count >= 20 ? "SSS" : rating.average >= 4.5 && rating.count >= 10 ? "SS" : rating.average >= 4 && rating.count >= 5 ? "S" : "普通黑卡";
      const post: NativePost = { id: raw.client_id, cloudId: raw.id, title: raw.title, body: raw.body || "", tag: raw.interest_tags?.name || "生活", topics: [], image: firstImage, images: firstImage ? [firstImage] : [], author: raw.profiles?.nickname || "黑卡探索者", authorId: raw.author_id || undefined, date: "", likeCount: 0, viewCount: 0, channel: "community", isDemo: false };
      setRevealed((current) => ({ ...current, [card.slot]: { post, rarity, ratingCount: rating.count, ratingAverage: rating.average, xp: experienceAward } }));
      setPhase((current) => ({ ...current, [card.slot]: "rarity" }));
      const existingTimer = phaseTimers.current.get(card.slot);
      if (existingTimer) clearTimeout(existingTimer);
      phaseTimers.current.set(card.slot, setTimeout(() => {
        setPhase((current) => current[card.slot] === "rarity" ? { ...current, [card.slot]: "content" } : current);
        phaseTimers.current.delete(card.slot);
      }, 960));
      const latestXp = await api<Experience>("/api/v1/progression", session).catch(() => null);
      if (latestXp) setExperience(latestXp);
      if (experienceAward) setNotice(`卡片已翻开，获得 ${experienceAward} EXP`);
      await writeCache(`deck:${session.user.id}`, { deck: orderedDeck, experience: latestXp || experience, missions });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "翻卡没有完成，请稍后重试。"); }
    finally { setBusySlot(null); }
  };

  const swapCard = async () => {
    if (!session || !deck.length || deck.some((card) => card.swapped_at)) return;
    setBusySlot(0); setError("");
    try {
      const updated = await api<DeckCard[]>("/api/v1/deck", session, { method: "POST", body: JSON.stringify({ action: "swap" }) });
      setDeck(Array.isArray(updated) ? [...updated].sort((a, b) => a.slot - b.slot) : deck); setRevealed({}); setPhase({}); setNotice("已替换一张还未翻开的卡片。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法替换卡片。"); }
    finally { setBusySlot(null); }
  };

  const claimMission = async (mission: Mission) => {
    if (!session || busyMission) return;
    setBusyMission(mission.key); setError(""); setNotice("");
    try {
      const result = await api<{ awarded?: number }>("/api/v1/daily-missions", session, { method: "POST", body: JSON.stringify({ missionKey: mission.key }) });
      setNotice(result.awarded ? `任务奖励已领取，获得 ${result.awarded} EXP` : "任务奖励已经领取。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "任务奖励领取失败。"); }
    finally { setBusyMission(""); }
  };

  if (authLoading || loading && !deck.length) return <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, alignItems: "center", justifyContent: "center", gap: 12 }}><ActivityIndicator size="large" color={colors.action} /><Text style={{ color: colors.muted, fontSize: 13 }}>正在准备今天的探索…</Text></View>;

  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: navStyle === "glass" ? Math.max(128, insets.bottom + 108) : Math.max(92, insets.bottom + 74) }} showsVerticalScrollIndicator={false}>
    <View style={{ paddingTop: insets.top + 5, paddingHorizontal: 18, paddingBottom: 13, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 14, height: 14, borderWidth: 1.5, borderColor: colors.action, transform: [{ rotate: "45deg" }] }} /><Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800", letterSpacing: 1 }}>黑卡</Text><Text style={{ color: colors.muted, fontSize: 9, fontWeight: "600", letterSpacing: 2 }}>HEIKA</Text></View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}><View style={{ minHeight: 28, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 15 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: session ? colors.action : colors.subtle }} /><Text style={{ color: colors.muted, fontSize: 9 }}>{session ? "云端同步" : "访客探索"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="搜索内容和用户" onPress={() => router.push("/search")} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised }}><NativeIcon name="search" color={colors.ink} size={19} /></Pressable></View>
    </View>
    <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, shadowColor: "#000", shadowOpacity: .08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}><NativeIcon name="grid" color={colors.action} size={17} /><Text style={{ color: colors.ink, fontSize: 11, fontWeight: "700" }}>今日已翻开</Text><Text style={{ color: colors.ink, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{openedCount} / {deck.length || 5} 张</Text></View><Text style={{ color: colors.muted, fontSize: 10 }}>还可翻开 {Math.max(0, (deck.length || 5) - openedCount)} 张</Text></View>
      <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 22 }}>
        <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: "800", letterSpacing: 1.8 }}>TODAY&apos;S DECK</Text>
        <Text style={{ color: colors.ink, fontSize: 28, fontWeight: "700", marginTop: 5 }}>翻开今天的灵感</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 7 }}>每张卡都来自黑卡社区，翻开后查看内容与稀有度。</Text>
        <View style={{ flexDirection: "row", gap: 5, marginTop: 14 }}>{deck.map((card) => <View key={`progress-${card.slot}`} style={{ flex: 1, height: 3, backgroundColor: card.opened_at ? colors.gold : colors.line }} />)}</View>
      </Animated.View>
      {session ? <>
        {!deck.length && !loading ? <View style={{ marginTop: 18, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }}><Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>今天的卡片还没准备好</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>社区内容达到今日组卡条件后，这里会出现探索卡。</Text><Pressable onPress={() => void load()} style={{ marginTop: 15 }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>重新检查　›</Text></Pressable></View> : null}
        <View style={{ gap: 13, marginTop: 17 }}>
          {Array.from({ length: Math.ceil(deck.length / 2) }, (_, rowIndex) => <View key={`deck-row-${deck[rowIndex * 2]?.slot}`} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            {deck.slice(rowIndex * 2, rowIndex * 2 + 2).map((card) => <DeckCardTile key={card.slot} card={card} post={revealed[card.slot]?.post} phase={phase[card.slot] || "closed"} rarity={revealed[card.slot]?.rarity} ratingCount={revealed[card.slot]?.ratingCount || 0} experience={revealed[card.slot]?.xp || 0} busy={busySlot === card.slot} colors={colors} onOpen={() => void openCard(card)} onView={() => { const post = revealed[card.slot]?.post; if (post) router.push({ pathname: "/post/[id]", params: { id: post.cloudId } } as never); }} />)}
            {deck.length % 2 === 1 && rowIndex === Math.floor(deck.length / 2) ? <View style={{ flex: 1 }} /> : null}
          </View>)}
        </View>
        {deck.some((card) => card.swapped_at) ? <Text style={{ color: colors.subtle, fontSize: 11, textAlign: "center", marginTop: 13 }}>今日替换次数已用完</Text> : deck.some((card) => !card.opened_at) ? <Pressable accessibilityRole="button" onPress={() => void swapCard()} style={{ alignSelf: "center", paddingHorizontal: 14, paddingVertical: 11, marginTop: 6 }}><Text style={{ color: colors.muted, fontSize: 11 }}>{busySlot === 0 ? "正在替换…" : "替换一张未翻开的卡片"}</Text></Pressable> : null}
      </> : <View style={{ marginTop: 18, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>登录后开始每日翻卡</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 7 }}>翻开卡片、参与评分并累积经验，进度会和网页端同步。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></View>}
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    </View>
    <View style={{ marginTop: 20, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}><View><Text style={{ color: colors.subtle, fontSize: 10, letterSpacing: 1.5, fontWeight: "700" }}>EXPLORER LEVEL</Text><Text style={{ color: colors.ink, fontSize: 18, fontWeight: "700", marginTop: 4 }}>LV.{level}　·　{experience?.total || 0} EXP</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/experience")}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>等级与奖励　›</Text></Pressable></View>
      <View style={{ height: 4, backgroundColor: colors.line, marginTop: 12, overflow: "hidden" }}><Animated.View style={{ width: `${progress}%`, height: 4, backgroundColor: colors.action }} /></View>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>{level >= 10 ? "已达到最高等级" : `距离 LV.${level + 1} 还差 ${Math.max(0, nextLevel - (experience?.total || 0))} EXP`}　·　今日翻卡获得 {todayFlipXp} EXP</Text>
    </View>
    {missions.length ? <View style={{ marginTop: 18, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>今日任务</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>每日成长</Text></View>
      {missions.slice(0, 3).map((mission) => <View key={mission.key} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line }}><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>{mission.title}</Text><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>+{mission.points} EXP</Text></View><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{mission.description}　{mission.progress}/{mission.target}</Text>{mission.claimed ? <Text style={{ color: colors.subtle, fontSize: 10, marginTop: 6 }}>已领取</Text> : mission.progress >= mission.target ? <Pressable disabled={Boolean(busyMission)} onPress={() => void claimMission(mission)} style={{ alignSelf: "flex-start", marginTop: 6 }}><Text style={{ color: colors.action, fontSize: 11, fontWeight: "700" }}>{busyMission === mission.key ? "领取中…" : "领取奖励　›"}</Text></Pressable> : null}</View>)}
    </View> : null}
    <View style={{ paddingHorizontal: 20, marginTop: 20 }}><Pressable onPress={() => router.push("/discover")} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "600" }}>浏览发现页内容</Text><Text style={{ color: colors.action, fontSize: 14 }}>›</Text></Pressable></View>
  </ScrollView>;
}

function DeckCardTile({ card, post, phase, rarity, ratingCount, experience, busy, colors, onOpen, onView }: { card: DeckCard; post?: NativePost; phase: "closed" | "rarity" | "content"; rarity?: string; ratingCount: number; experience: number; busy: boolean; colors: ReturnType<typeof useTheme>["colors"]; onOpen: () => void; onView: () => void }) {
  const flipped = Boolean(post);
  const flip = useSharedValue(flipped ? 1 : 0);
  // Candidate mitigation for the reported HWUI transform-stack crash. Keep the reveal animation
  // while removing this perspective transform path until it can be A/B tested on the affected device.
  const frontStyle = useAnimatedStyle(() => ({ opacity: 1 - flip.value }));
  const backStyle = useAnimatedStyle(() => ({ opacity: flip.value }));
  useEffect(() => { flip.value = withTiming(flipped ? 1 : 0, { duration: 680, easing: Easing.out(Easing.cubic) }); }, [flip, flipped]);
  const press = () => { if (card.opened_at) { if (post) onView(); return; } onOpen(); };
  return <MotionPressable accessibilityRole="button" accessibilityLabel={`第 ${card.slot} 张卡片${card.opened_at ? "，已翻开" : "，点击翻开"}`} onPress={press} disabled={busy || Boolean(card.opened_at && !post)} style={{ flex: 1, minWidth: 0 }}>
    <View style={{ width: "100%", aspectRatio: .72, position: "relative", borderRadius: 12, backgroundColor: "#101517", shadowColor: "#000", shadowOpacity: .24, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 5 }}>
      <Animated.View style={[tileFace, { backgroundColor: "#111719", borderColor: "#627176" }, frontStyle]}>
        <View style={{ position: "absolute", top: 5, left: 5, right: 5, bottom: 5, borderWidth: 1, borderColor: "#68767A80", borderRadius: 9 }} />
        <View style={{ position: "absolute", left: "23%", right: "20%", top: "12%", bottom: "14%", borderLeftWidth: 1, borderRightWidth: 1, borderColor: "#D4DEE21A", transform: [{ skewX: "-28deg" }] }} />
        <View style={{ position: "absolute", width: "40%", aspectRatio: 1, borderWidth: 1, borderColor: "#D4DEE236", left: "30%", top: "31%", transform: [{ rotate: "45deg" }] }} />
        <Text style={{ color: "#C0CBCD", fontSize: 10, letterSpacing: 1.8, fontWeight: "700" }}>{String(card.slot).padStart(2, "0")}</Text>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#E7EDEE", fontSize: 14, letterSpacing: 2.2, fontWeight: "600" }}>◇ 黑卡 · HEIKA</Text></View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: "#AEB9BC", fontSize: 10, letterSpacing: 1.1 }}>{busy ? "正在翻开…" : card.opened_at ? "正在恢复内容" : "轻触翻开"}</Text><NativeIcon name="sparkles" color="#AEB9BC" size={13} /></View>
      </Animated.View>
      <Animated.View style={[tileFace, { backgroundColor: colors.surface, borderColor: colors.line, padding: 0 }, backStyle]}>
        {post ? <>
          {phase === "rarity" ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 12, gap: 8 }}><Text style={{ color: colors.subtle, fontSize: 9, letterSpacing: 1.6 }}>稀有度揭晓</Text><Text style={{ color: rarity === "SSS" ? colors.gold : colors.action, fontSize: 34, fontWeight: "800", letterSpacing: 2 }}>{rarity}</Text><Text style={{ color: colors.muted, fontSize: 9 }}>{ratingCount ? `${ratingCount} 人评分` : "等待社区评分"}</Text></View> : <>
            <View style={{ position: "relative" }}><NativeImage uri={post.image} label={post.title} resizeMode="cover" style={{ width: "100%", height: 124, borderTopLeftRadius: 11, borderTopRightRadius: 11 }} /><View style={{ position: "absolute", top: 7, right: 7, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: `${colors.surface}E8` }}><Text style={{ color: rarity === "SSS" ? colors.gold : colors.action, fontSize: 9, fontWeight: "800" }}>{rarity || "已翻开"}</Text></View></View>
            <View style={{ flex: 1, padding: 10, justifyContent: "space-between" }}><View><Text style={{ color: colors.action, fontSize: 9, fontWeight: "700" }}>#{post.tag}</Text><Text numberOfLines={3} style={{ color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 5 }}>{post.title}</Text><Text numberOfLines={2} style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }}>{post.body}</Text></View><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 6 }}><Text numberOfLines={1} style={{ color: colors.subtle, fontSize: 9, flex: 1 }}>{post.author}</Text><Text style={{ color: experience ? colors.action : colors.subtle, fontSize: 9, fontWeight: "700" }}>{experience ? `+${experience} EXP` : "查看 ›"}</Text></View></View>
          </>}
        </> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.action} /><Text style={{ color: colors.muted, fontSize: 10, marginTop: 8 }}>正在恢复已翻开的卡片</Text></View>}
      </Animated.View>
    </View>
  </MotionPressable>;
}

const tileFace = { position: "absolute" as const, top: 0, bottom: 0, left: 0, right: 0, padding: 13, borderWidth: 1, borderRadius: 12, backfaceVisibility: "hidden" as const, overflow: "hidden" as const };
