import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router } from "expo-router";
import { Action, Metric, Notice, PageFrame, SectionTitle, palette, ui } from "../components/MobileUi";
import { api, useMobileSession } from "../lib/mobile-api";

type Mission = { key: "explore_days" | "publish_post" | "curate_posts"; title: string; description: string; progress: number; target: number; points: number; claimed: boolean };
type CreatorData = { insights?: { posts?: number; views?: number; likes?: number; saves?: number; comments?: number; topPosts?: Array<{ title: string; views: number; likes: number; saves: number; comments: number }> }; weekStart?: string; missions?: Mission[] };

export default function CreatorScreen() {
  const { session, loading: authLoading } = useMobileSession();
  const [data, setData] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError("");
    try { setData(await api<CreatorData>("/api/v1/creator-center", session)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "创作者数据读取失败"); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const claim = async (mission: Mission) => {
    if (!session || busy) return;
    setBusy(mission.key); setNotice(""); setError("");
    try {
      const result = await api<{ points?: number }>("/api/v1/creator-center", session, { method: "POST", body: JSON.stringify({ missionKey: mission.key }) });
      setNotice(result.points ? `已领取 ${result.points} EXP，经验已同步。` : "这项奖励已经领取过了。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "奖励领取失败"); }
    finally { setBusy(null); }
  };

  if (authLoading) return <PageFrame title="创作者中心" eyebrow="CREATOR / HEIKA"><ActivityIndicator color={palette.green} /></PageFrame>;
  if (!session) return <PageFrame title="创作者中心" eyebrow="CREATOR / HEIKA"><Text style={ui.muted}>登录后查看作品表现与每周成长任务。</Text><Action title="登录 / 注册" onPress={() => router.push("/account")} /></PageFrame>;
  const insights = data?.insights || {};

  return <PageFrame title="创作者中心" eyebrow="CREATOR / INSIGHTS">
    <Text style={intro}>作品表现、每周任务与成长奖励都在这里汇总。</Text>
    <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
    {loading && !data ? <ActivityIndicator color={palette.green} style={{ marginTop: 20 }} /> : <>
      <View style={metrics}>
        <Metric label="公开作品" value={insights.posts ?? 0} /><Metric label="阅读" value={insights.views ?? 0} />
      </View>
      <View style={metrics}>
        <Metric label="点赞" value={insights.likes ?? 0} /><Metric label="收藏" value={insights.saves ?? 0} /><Metric label="评论" value={insights.comments ?? 0} />
      </View>
      <SectionTitle detail={data?.weekStart ? `周起始 ${data.weekStart}` : "每周刷新"}>成长任务</SectionTitle>
      {(data?.missions || []).map((mission) => {
        const complete = mission.progress >= mission.target;
        return <View key={mission.key} style={missionCard}>
          <View style={missionHead}><Text style={missionTitle}>{mission.title}</Text><Text style={missionPoints}>+{mission.points} EXP</Text></View>
          <Text style={ui.rowSubtitle}>{mission.description}</Text>
          <View style={track}><View style={[progress, { width: `${Math.min(100, Math.round(mission.progress / Math.max(1, mission.target) * 100))}%` }]} /></View>
          <View style={missionFoot}><Text style={ui.rowSubtitle}>{mission.progress} / {mission.target}</Text>
            {mission.claimed ? <Text style={claimed}>已领取</Text> : complete ? <Action title={busy === mission.key ? "领取中…" : "领取奖励"} disabled={Boolean(busy)} onPress={() => void claim(mission)} /> : null}
          </View>
        </View>;
      })}
      <SectionTitle detail="按互动数据排序">表现较好的作品</SectionTitle>
      {(insights.topPosts || []).map((post, index) => <View key={`${post.title}-${index}`} style={topPost}>
        <Text style={postTitle} numberOfLines={2}>{post.title}</Text>
        <Text style={ui.rowSubtitle}>阅读 {post.views}　赞 {post.likes}　藏 {post.saves}　评 {post.comments}</Text>
      </View>)}
      {!insights.topPosts?.length ? <Text style={ui.muted}>发布并通过审核后，这里会显示作品表现。</Text> : null}
    </>}
  </PageFrame>;
}

const intro = { color: palette.muted, fontSize: 13, lineHeight: 20 } as const;
const metrics = { flexDirection: "row", gap: 8 } as const;
const missionCard = { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.line, gap: 7 } as const;
const missionHead = { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } as const;
const missionTitle = { color: palette.ink, fontSize: 14, fontWeight: "700" } as const;
const missionPoints = { color: palette.green, fontSize: 12, fontWeight: "700" } as const;
const track = { height: 4, backgroundColor: "#E2E6E0", overflow: "hidden" as const, marginTop: 5 };
const progress = { height: 4, backgroundColor: palette.green } as const;
const missionFoot = { minHeight: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" } as const;
const claimed = { color: palette.muted, fontSize: 12 } as const;
const topPost = { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.line, gap: 6 } as const;
const postTitle = { color: palette.ink, fontSize: 14, fontWeight: "600" } as const;
