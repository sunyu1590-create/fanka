import { NextRequest } from "next/server";
import { ApiError, jsonBody, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";
import {
  buildRankings, loadConfig, normalizeConfig, refreshContentHot, saveConfig, type RankingKey,
} from "@/lib/server/distribution";
import { attachSeriesStats, querySeries } from "@/lib/server/series";

export const dynamic = "force-dynamic";

const RANKING_KEYS: RankingKey[] = ["global", "ai", "series", "rising", "long"];
const RANKING_LABELS: Record<RankingKey, string> = { global: "全站热榜", ai: "AI 热榜", series: "合集热榜", rising: "飙升榜", long: "长期精选" };

const dayOf = (iso: string) => iso.slice(0, 10);

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const { config, version, updatedAt } = await loadConfig(db);
    const admin = adminClient();

    const [snapRes, termsRes, eventsRes, impRes, readRes, seriesRes, curationRes, auditRes, configHistoryRes, hotRes] = await Promise.all([
      db.from("ranking_snapshots").select("key,payload,computed_at").in("key", RANKING_KEYS),
      db.from("search_terms").select("term,display_term,search_count,user_count,zero_result_count,click_count,last_searched_at").order("user_count", { ascending: false }).limit(30),
      admin.from("search_events").select("term,user_id,result_count,clicked_type,created_at").gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(4000),
      admin.from("content_impressions").select("entity_type,surface,pool,created_at").gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(5000),
      admin.from("content_events").select("surface,kind,created_at").eq("kind", "read").gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(5000),
      querySeries(db, { limit: 60, offset: 0 }),
      db.from("series_curation").select("series_id,featured,featured_rank,note,curated_at").limit(200),
      admin.from("admin_action_logs").select("actor_id,action,target,detail,created_at").order("created_at", { ascending: false }).limit(20),
      db.from("distribution_config_history").select("version,created_at,updated_by").order("version", { ascending: false }).limit(8),
      admin.from("content_hot").select("entity_type,entity_id,score_24h,score_72h,score_7d,likes_7d,bookmarks_7d,shares_7d,reads_7d").order("score_72h", { ascending: false }).limit(20),
    ]);

    const snapshots = ((snapRes.data || []) as { key: string; payload: { items?: unknown[]; computedAt?: string; hasSignal?: boolean; sample?: unknown }; computed_at: string }[])
      .map((row) => ({
        key: row.key,
        label: RANKING_LABELS[row.key as RankingKey] || row.key,
        computedAt: row.computed_at,
        staleAfterMinutes: row.key === "long" ? config.ranking.longTtlMinutes : config.ranking.ttlMinutes,
        hasSignal: row.payload?.hasSignal ?? false,
        top: Array.isArray(row.payload?.items) ? row.payload.items.slice(0, 8) : [],
        count: Array.isArray(row.payload?.items) ? row.payload.items.length : 0,
      }));

    // 搜索分析
    const eventRows = (eventsRes.data || []) as { term: string; user_id: string | null; result_count: number; clicked_type: string | null; created_at: string }[];
    const searchByDay = new Map<string, { searches: number; clicks: number; zero: number }>();
    for (const row of eventRows) {
      const day = dayOf(row.created_at);
      const item = searchByDay.get(day) || { searches: 0, clicks: 0, zero: 0 };
      if (row.clicked_type) item.clicks += 1;
      else { item.searches += 1; if (!row.result_count) item.zero += 1; }
      searchByDay.set(day, item);
    }
    const terms = ((termsRes.data || []) as { term: string; display_term: string; search_count: number; user_count: number; zero_result_count: number; click_count: number; last_searched_at: string }[])
      .map((row) => ({ ...row, ctr: row.search_count ? Number((row.click_count / row.search_count).toFixed(3)) : 0 }));
    const totalSearches = eventRows.filter((row) => !row.clicked_type).length;
    const totalClicks = eventRows.filter((row) => row.clicked_type).length;

    // 推荐分析
    const impressions = (impRes.data || []) as { entity_type: string; surface: string; pool: string | null; created_at: string }[];
    const reads = (readRes.data || []) as { surface: string; created_at: string }[];
    const surfaceMap = new Map<string, { impressions: number; reads: number }>();
    for (const row of impressions) {
      const item = surfaceMap.get(row.surface) || { impressions: 0, reads: 0 };
      item.impressions += 1;
      surfaceMap.set(row.surface, item);
    }
    for (const row of reads) {
      const item = surfaceMap.get(row.surface) || { impressions: 0, reads: 0 };
      item.reads += 1;
      surfaceMap.set(row.surface, item);
    }
    const poolMap = new Map<string, number>();
    for (const row of impressions) {
      const key = row.pool || "未标记";
      poolMap.set(key, (poolMap.get(key) || 0) + 1);
    }
    const totalImp = impressions.length;
    const distribution = [...poolMap.entries()].map(([pool, count]) => ({ pool, count, ratio: totalImp ? Number((count / totalImp).toFixed(3)) : 0 }));

    // 合集管理
    const seriesCards = await attachSeriesStats(db, seriesRes.rows, null, { withAuthor: true });
    const curation = new Map(((curationRes.data || []) as { series_id: string; featured: boolean; featured_rank: number; note: string | null }[]).map((row) => [row.series_id, row]));
    const seriesList = seriesCards.map((card) => ({
      id: card.id,
      title: card.title,
      author: card.author?.nickname || "创作者",
      chapters: card.chapters,
      follows: card.followCount,
      hot: Number(card.hot.toFixed(2)),
      updatedAt: card.updatedAt,
      featured: curation.get(card.id)?.featured || false,
      featuredRank: curation.get(card.id)?.featured_rank || 100,
      channel: card.channel,
    }));

    return {
      config,
      configMeta: { version, updatedAt },
      configHistory: (configHistoryRes.data || []) as { version: number; created_at: string; updated_by: string | null }[],
      rankings: snapshots,
      hotEntities: (hotRes.data || []) as unknown[],
      search: {
        terms,
        totals: {
          searches: totalSearches,
          clicks: totalClicks,
          ctr: totalSearches ? Number((totalClicks / totalSearches).toFixed(3)) : 0,
          zeroResult: eventRows.filter((row) => !row.clicked_type && !row.result_count).length,
          uniqueTerms: new Set(eventRows.map((row) => row.term)).size,
        },
        trend: [...searchByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, ...value })),
      },
      recommendation: {
        surfaces: [...surfaceMap.entries()].map(([surface, value]) => ({
          surface,
          impressions: value.impressions,
          reads: value.reads,
          ctr: value.impressions ? Number((value.reads / value.impressions).toFixed(3)) : 0,
        })),
        pools: distribution,
        totalImpressions: totalImp,
      },
      series: seriesList,
      audit: (auditRes.data || []) as unknown[],
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const action = String(body.action || "");

    if (action === "save_config") {
      const note = typeof body.note === "string" ? body.note.slice(0, 200) : "";
      const result = await saveConfig(user.id, body.config, note);
      return { saved: true, ...result };
    }

    if (action === "validate_config") {
      return { config: normalizeConfig(body.config) };
    }

    if (action === "refresh") {
      const { config } = await loadConfig(adminClient());
      const hot = await refreshContentHot(config);
      const rankings = await buildRankings(config);
      const requested = String(body.key || "all") as RankingKey | "all";
      const admin = adminClient();
      await admin.from("admin_action_logs").insert({
        actor_id: user.id, action: "distribution.ranking.refresh", target: requested,
        detail: { events: hot.events, entities: hot.entities, keys: Object.keys(rankings) },
      });
      return {
        refreshed: true,
        hot,
        keys: requested === "all" ? Object.keys(rankings) : [requested],
        computedAt: Object.fromEntries(Object.entries(rankings).map(([key, value]) => [key, value.computedAt])),
      };
    }

    if (action === "curate") {
      const seriesId = String(body.seriesId || "");
      if (!/^[0-9a-f-]{36}$/i.test(seriesId)) throw new ApiError(400, "合集无效");
      const featured = body.featured !== false;
      const rank = Math.max(1, Math.min(999, Number(body.rank) || 100));
      const admin = adminClient();
      if (featured) {
        await admin.from("series_curation").upsert({
          series_id: seriesId, featured: true, featured_rank: rank,
          note: typeof body.note === "string" ? body.note.slice(0, 120) : null,
          curated_by: user.id, curated_at: new Date().toISOString(),
        }, { onConflict: "series_id" });
      } else {
        await admin.from("series_curation").upsert({
          series_id: seriesId, featured: false, featured_rank: rank, curated_by: user.id, curated_at: new Date().toISOString(),
        }, { onConflict: "series_id" });
      }
      await admin.from("admin_action_logs").insert({
        actor_id: user.id, action: "distribution.series.curate", target: seriesId,
        detail: { featured, rank },
      });
      return { ok: true, featured, rank };
    }

    if (action === "rollback") {
      const version = Number(body.version);
      if (!Number.isFinite(version)) throw new ApiError(400, "版本无效");
      const admin = adminClient();
      const { data } = await admin.from("distribution_config_history").select("config,version").eq("version", version).maybeSingle();
      if (!data) throw new ApiError(404, "找不到该配置版本");
      const result = await saveConfig(user.id, (data as { config: unknown }).config, `回滚到版本 ${version}`);
      return { rolledBack: true, from: version, ...result };
    }

    throw new ApiError(400, "不支持的操作");
  });
}
