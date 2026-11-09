import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View, Vibration } from "react-native";
import { router } from "expo-router";
import Animated, { Easing, FadeIn, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../../lib/theme";
import { API_BASE, api, useMobileSession } from "../../lib/mobile-api";
import { readCache, writeCache } from "../../lib/local-store";
import { NativeImage } from "../../components/NativeImage";
import { MotionPressable } from "../../components/MotionPressable";
import { Action, Notice } from "../../components/MobileUi";
import type { NativePost } from "../../lib/native-posts";

type DeckCard = { deck_id: string; local_date: string; slot: number; post_id: string; opened_at: string | null; swapped_at: string | null };
type RawPost = { id: string; client_id: number; title: string; body: string; image_url?: string | null; author_id?: string | null; interest_tags?: { name?: string | null } | null; profiles?: { nickname?: string | null } | null; post_media?: Array<{ storage_path: string; sort_order: number }> };
type Experience = { total: number; membershipTier?: "free" | "plus" | "pro"; events?: Array<{ type: string; points: number; createdAt: string }>; claimedLevels?: number[] };
type Mission = { key: string; title: string; description: string; progress: number; target: number; points: number; claimed: boolean };
type DailyMissions = { missions?: Mission[] };
type RevealedCard = { post: NativePost; rarity: string; ratingCount: number; ratingAverage: number; xp: number };

const levels = [0, 100, 240, 430, 680, 1000, 1390, 1850, 2380, 2980];

export default function HomeScreen() {
  const { colors } = useTheme();
  const { session, loading: authLoading } = useMobileSession();
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [revealed, setRevealed] = useState<Record<number, RevealedCard>>({});
  const [phase, setPhase] = useState<Record<number, "closed" | "rarity" | "content">>({});
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [busyMission, setBusyMission] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const flip = useSharedValue(0);
  const hydration = useRef(new Set<number>());
  const phaseTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const activeCard = deck.find((card) => card.slot === selected + 1);
  const currentPhase = activeCard ? phase[activeCard.slot] || (activeCard.opened_at ? "content" : "closed") : "closed";
  const cardWidth = Math.min(Dimensions.get("window").width - 44, 390);
  const frontStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }] }));
  const backStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }] }));
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
      if (cached) { setDeck(cached.deck); setExperience(cached.experience); setMissions(cached.missions); setLoading(false); }
      const [deckRows, xp, tasks] = await Promise.all([
        api<DeckCard[]>("/api/v1/deck", session),
        api<Experience>("/api/v1/progression", session),
        api<DailyMissions>("/api/v1/daily-missions", session).catch(() => ({ missions: [] })),
      ]);
      const rows = Array.isArray(deckRows) ? deckRows : [];
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
  useEffect(() => {
    const card = deck.find((item) => item.slot === selected + 1);
    const isOpen = Boolean(card?.opened_at || phase[selected + 1] === "rarity" || phase[selected + 1] === "content");
    flip.value = withTiming(isOpen ? 1 : 0, { duration: 460, easing: Easing.out(Easing.cubic) });
  }, [deck, flip, phase, selected]);

  const openCard = async (card: DeckCard) => {
    if (!session) { router.push("/account"); return; }
    if (revealed[card.slot]) { router.push({ pathname: "/post/[id]", params: { id: revealed[card.slot].post.cloudId } } as never); return; }
    if (busySlot !== null) return;
    if (card.opened_at) { setError("这张卡已翻开，刷新后可以重新打开内容。"); return; }
    setBusySlot(card.slot); setError(""); setNotice("");
    try {
      const updatedDeck = await api<DeckCard[]>("/api/v1/deck", session, { method: "POST", body: JSON.stringify({ action: "open", slot: card.slot }) });
      setDeck(Array.isArray(updatedDeck) ? updatedDeck : deck);
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
      setSelected(card.slot - 1);
      flip.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) });
      const existingTimer = phaseTimers.current.get(card.slot);
      if (existingTimer) clearTimeout(existingTimer);
      phaseTimers.current.set(card.slot, setTimeout(() => {
        setPhase((current) => current[card.slot] === "rarity" ? { ...current, [card.slot]: "content" } : current);
        phaseTimers.current.delete(card.slot);
      }, 960));
      const latestXp = await api<Experience>("/api/v1/progression", session).catch(() => null);
      if (latestXp) setExperience(latestXp);
      if (experienceAward) setNotice(`卡片已翻开，获得 ${experienceAward} EXP`);
      await writeCache(`deck:${session.user.id}`, { deck: Array.isArray(updatedDeck) ? updatedDeck : deck, experience: latestXp || experience, missions });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "翻卡没有完成，请稍后重试。"); }
    finally { setBusySlot(null); }
  };

  const swapCard = async () => {
    if (!session || !deck.length || deck.some((card) => card.swapped_at)) return;
    setBusySlot(0); setError("");
    try {
      const updated = await api<DeckCard[]>("/api/v1/deck", session, { method: "POST", body: JSON.stringify({ action: "swap" }) });
      setDeck(Array.isArray(updated) ? updated : deck); setRevealed({}); setPhase({}); setNotice("已替换一张还未翻开的卡片。");
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

  if (authLoading || loading && !deck.length) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 12 }}><ActivityIndicator size="large" color={colors.action} /><Text style={{ color: colors.muted, fontSize: 13 }}>正在准备今天的探索…</Text></View>;

  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 108 }} showsVerticalScrollIndicator={false}>
    <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 13, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View><Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800", letterSpacing: 1 }}>◇ 黑卡 <Text style={{ color: colors.muted, fontSize: 9, fontWeight: "600", letterSpacing: 2 }}>HEIKA</Text></Text><Text style={{ color: colors.subtle, fontSize: 9, letterSpacing: 1.6, marginTop: 4 }}>HEIKA / EXPLORE</Text></View>
      <Pressable accessibilityRole="button" onPress={() => router.push("/search")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink, fontSize: 20 }}>⌕</Text></Pressable>
    </View>
    <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
      <Animated.View entering={FadeInDown.duration(260)}>
        <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: "800", letterSpacing: 1.8 }}>TODAY&apos;S DECK</Text>
        <View style={{ marginTop: 5, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ color: colors.ink, fontSize: 27, fontWeight: "700" }}>翻开今天的灵感</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{openedCount}/{deck.length || 5} 已翻开</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 7 }}>每张卡都来自黑卡社区，翻开后查看内容与稀有度。</Text>
      </Animated.View>
      {session ? <>
        <View style={{ height: 400, alignItems: "center", justifyContent: "center", marginTop: 14 }}>
          {!deck.length && !loading ? <View style={{ width: "100%", padding: 20, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.gold }}><Text style={{ color: colors.ink, fontSize: 15, fontWeight: "700" }}>今天的卡片还没准备好</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>社区内容达到今日组卡条件后，这里会出现五张探索卡。</Text><Pressable onPress={() => void load()} style={{ marginTop: 15 }}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>重新检查　›</Text></Pressable></View> : null}
          {activeCard ? <View style={{ width: cardWidth, height: 370 }}>
            <Animated.View style={[cardFace, { backgroundColor: colors.ink, borderColor: colors.line }, frontStyle]}>
              <Text style={{ color: colors.subtle, fontSize: 10, letterSpacing: 1.6, fontWeight: "700" }}>HEIKA　·　{String(activeCard.slot).padStart(2, "0")}</Text>
              <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}><Text style={{ color: colors.action, fontSize: 96, fontWeight: "200" }}>◇</Text><Text style={{ color: colors.surface, fontSize: 13, letterSpacing: 1.6, marginTop: 10 }}>{activeCard.opened_at ? "已翻开" : "今日探索卡"}</Text></View>
              <MotionPressable onPress={() => void openCard(activeCard)} style={{ backgroundColor: colors.surface, minHeight: 50, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}>{busySlot === activeCard.slot ? "正在翻开…" : activeCard.opened_at ? "查看这张卡" : "翻开卡片"}</Text></MotionPressable>
            </Animated.View>
            <Animated.View style={[cardFace, { backgroundColor: colors.surface, borderColor: colors.line }, backStyle]}>
              {revealed[activeCard.slot] ? <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "700" }}>CARD RARITY</Text>{revealed[activeCard.slot].xp > 0 ? <Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>+{revealed[activeCard.slot].xp} EXP</Text> : null}</View>
                {currentPhase === "rarity" ? <Animated.View entering={FadeIn.duration(280)} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}><Text style={{ color: colors.subtle, fontSize: 11, letterSpacing: 2 }}>稀有度揭晓</Text><Text style={{ color: revealed[activeCard.slot].rarity === "SSS" ? colors.gold : colors.action, fontSize: 52, fontWeight: "800", letterSpacing: 3 }}>{revealed[activeCard.slot].rarity}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{revealed[activeCard.slot].ratingCount ? `${revealed[activeCard.slot].ratingCount} 人评分` : "等待社区评分"}</Text></Animated.View> : <Animated.View entering={FadeInDown.duration(280)} style={{ flex: 1, justifyContent: "center" }}>
                  <View style={{ width: 54, height: 54, alignItems: "center", justifyContent: "center", backgroundColor: colors.actionSoft, marginBottom: 16 }}><Text style={{ color: colors.action, fontSize: 16, fontWeight: "800" }}>{revealed[activeCard.slot].rarity}</Text></View>
                  <Text style={{ color: colors.action, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>#{revealed[activeCard.slot].post.tag}</Text>
                  <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "700", lineHeight: 30, marginTop: 8 }}>{revealed[activeCard.slot].post.title}</Text>
                  <Text numberOfLines={4} style={{ color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 11 }}>{revealed[activeCard.slot].post.body}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 15 }}><Text style={{ color: colors.subtle, fontSize: 11 }}>{revealed[activeCard.slot].post.author}</Text><Pressable onPress={() => openCard(activeCard)}><Text style={{ color: colors.action, fontSize: 12, fontWeight: "700" }}>查看内容　›</Text></Pressable></View>
                  {revealed[activeCard.slot].post.image ? <NativeImage uri={revealed[activeCard.slot].post.image} label={revealed[activeCard.slot].post.title} resizeMode="cover" style={{ width: "100%", height: 78, marginTop: 12 }} /> : null}
                </Animated.View>}
              </> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.action, fontSize: 54, fontWeight: "200" }}>◇</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 16 }}>卡片内容将在稀有度揭晓后出现</Text></View>}
            </Animated.View>
          </View> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 13, justifyContent: "center", flexGrow: 1 }}>
          {deck.map((card, index) => <Pressable accessibilityRole="button" accessibilityLabel={`第 ${card.slot} 张卡片${card.opened_at ? "，已翻开" : "，未翻开"}`} accessibilityState={{ selected: selected === index }} key={card.slot} onPress={() => setSelected(index)} style={{ width: 48, height: 54, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: selected === index ? colors.action : colors.line, backgroundColor: card.opened_at ? colors.actionSoft : colors.surface }}><Text style={{ color: selected === index ? colors.action : colors.muted, fontSize: 12, fontWeight: "700" }}>{card.slot}</Text><Text style={{ color: colors.subtle, fontSize: 9, marginTop: 2 }}>{card.opened_at ? "已开" : "未开"}</Text></Pressable>)}
        </ScrollView>
        {deck.some((card) => card.swapped_at) ? <Text style={{ color: colors.subtle, fontSize: 11, textAlign: "center" }}>今日替换次数已用完</Text> : deck.some((card) => !card.opened_at) ? <Pressable accessibilityRole="button" onPress={() => void swapCard()} style={{ alignSelf: "center", padding: 10 }}><Text style={{ color: colors.muted, fontSize: 11 }}>{busySlot === 0 ? "正在替换…" : "替换一张未翻开的卡片"}</Text></Pressable> : null}
      </> : <View style={{ marginTop: 24, padding: 20, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.gold }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>登录后开始每日翻卡</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 7 }}>翻开卡片、参与评分并累积经验，进度会和网页端同步。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></View>}
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

const cardFace = { position: "absolute" as const, top: 0, bottom: 0, left: 0, right: 0, padding: 19, borderWidth: 1, backfaceVisibility: "hidden" as const, overflow: "hidden" as const };
