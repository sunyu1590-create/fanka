/**
 * 趋势热榜 API：基于 content_events 最近窗口内的交互密度 + 排行榜快照
 * 返回 topN 条当前最热内容（帖子 / 合集），支持种类过滤。
 */
import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/distribution";
import { adminClient } from "@/lib/server/admin-client";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TrendingEntity {
  entity_id: string;
  entity_type: string;
  event_count: number;
}

interface PostRow {
  id: string;
  title: string;
  excerpt: string;
  cover: string | null;
  channel: string;
  kind: string;
  tag_id: number;
  author_id: string;
  created_at: string;
  status: string;
}

interface SeriesRow {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  channel: string;
  kind: string;
  tag_id: number;
  author_id: string;
  created_at: string;
  approval_status: string;
}

interface EnrichedItem extends Record<string, unknown> {
  entity_type: string;
  hot_score: number;
  id: string;
  title: string;
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const config = (await loadConfig(db)).config;
    const { windowHours, minEventCount, topN } = config.trending;

    const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
    const dbc = adminClient();

    const { data: hotEntities, error: hotErr } = await dbc.rpc("get_trending_entities", {
      _since: since,
      _min_events: minEventCount,
      _limit: topN * 2,
    });
    if (hotErr) return { error: hotErr.message, items: [] };

    const entities = (hotEntities || []) as TrendingEntity[];
    if (entities.length === 0) {
      return await fallbackRankings(db, topN);
    }

    const postIds = entities.filter((e) => e.entity_type === "post").map((e) => e.entity_id);
    const seriesIds = entities.filter((e) => e.entity_type === "series").map((e) => e.entity_id);

    const [postRows, seriesRows] = await Promise.all([
      postIds.length
        ? db.from("posts").select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,status").in("id", postIds).eq("status", "published")
        : { data: [] },
      seriesIds.length
        ? db.from("post_series").select("id,title,description,cover,channel,kind,tag_id,author_id,created_at,approval_status").in("id", seriesIds).eq("approval_status", "approved")
        : { data: [] },
    ]);

    const eventMap = new Map<string, number>(entities.map((e) => [e.entity_id, e.event_count]));
    const posts = (postRows?.data || []) as PostRow[];
    const series = (seriesRows?.data || []) as SeriesRow[];

    const enrichedPosts = posts.map((p) => ({ ...p, __type: "post", __score: eventMap.get(p.id) || 0 }));
    const enrichedSeries = series.map((s) => ({ ...s, __type: "series", __score: eventMap.get(s.id) || 0 }));

    const items: EnrichedItem[] = [...enrichedPosts, ...enrichedSeries]
      .sort((a, b) => (b.__score as number) - (a.__score as number))
      .slice(0, topN)
      .map(({ __type, __score, ...rest }) => ({ entity_type: __type as string, hot_score: __score as number, ...rest } as EnrichedItem));

    return { window_hours: windowHours, generated_at: new Date().toISOString(), items };
  });
}

async function fallbackRankings(db: SupabaseClient, topN: number) {
  const { data: snap } = await db.from("ranking_snapshots").select("payload").eq("key", "global").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const payload = (snap as { payload?: { items?: unknown[] } } | null)?.payload;
  const items = (payload?.items || []).slice(0, topN);
  return { window_hours: 0, fallback: true, generated_at: new Date().toISOString(), items };
}
