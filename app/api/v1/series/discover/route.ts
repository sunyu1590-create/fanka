import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { loadConfig, getRankings } from "@/lib/server/distribution";
import { recommendSeries } from "@/lib/server/recommend";
import { attachSeriesStats, querySeries, seriesCategoryList, type SeriesCard } from "@/lib/server/series";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const params = req.nextUrl.searchParams;
    const sort = (params.get("sort") || "recommended") as "recommended" | "hot" | "updated" | "new" | "follows";
    const categoryId = Number(params.get("category")) || null;
    const page = Math.max(1, Math.min(200, Number(params.get("page")) || 1));
    const limit = Math.max(6, Math.min(48, Number(params.get("limit")) || 24));
    const channel = params.get("channel") === "ai" ? "ai" : null;
    const { config } = await loadConfig(db);

    // 全量候选（当前体量下最多 300 个合集），统计与排序都在服务端完成。
    // 频道过滤交给 querySeries：AI 合集按内部作品所属频道判定，不能用 post_series.channel 直接筛。
    const { rows } = await querySeries(db, { limit: 60, offset: 0, channel });
    const cards = await attachSeriesStats(db, rows, user?.id || null, { withProgress: !!user, withAuthor: true });
    const byId = new Map(cards.map((card) => [card.id, card]));

    const curationRes = await db.from("series_curation").select("series_id,featured_rank").eq("featured", true).order("featured_rank", { ascending: true }).limit(24);
    const curated = ((curationRes.data || []) as { series_id: string }[]).map((row) => byId.get(row.series_id)).filter((card): card is SeriesCard => !!card);
    const featured = curated.length
      ? curated.slice(0, config.series.featuredLimit).map((card) => ({ ...card, source: "editorial" }))
      : [...cards]
        .sort((a, b) => (b.followCount * 3 + b.hot + b.chapters) - (a.followCount * 3 + a.hot + a.chapters))
        .slice(0, Math.min(3, config.series.featuredLimit))
        .map((card) => ({ ...card, source: "auto" }));

    const hasHotSignal = cards.some((card) => card.hot > 0);
    const trending = [...cards]
      .sort((a, b) => (hasHotSignal ? b.hot - a.hot || b.followCount - a.followCount : b.followCount - a.followCount || +new Date(b.updatedAt) - +new Date(a.updatedAt)))
      .slice(0, config.series.trendingLimit)
      .map((card, index) => ({ ...card, rank: index + 1 }));

    const continueReading = user
      ? [...cards]
        .filter((card) => card.progress && card.progress.read > 0)
        .sort((a, b) => Date.parse(b.progress?.updatedAt || "") - Date.parse(a.progress?.updatedAt || ""))
        .slice(0, 6)
      : [];

    const updated = [...cards].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 8);
    const recommendation = await recommendSeries(db, user?.id || null, 8);

    // 全部合集：筛选 + 排序 + 分页
    const filtered = cards
      .filter((card) => (categoryId ? card.categoryId === categoryId : true))
      .sort((a, b) => {
        switch (sort) {
          case "hot": return b.hot - a.hot || b.followCount - a.followCount;
          case "follows": return b.followCount - a.followCount || b.hot - a.hot;
          case "updated": return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
          case "new": return Date.parse(b.createdAt) - Date.parse(a.createdAt);
          default: {
            const score = (card: SeriesCard) => card.hot * 1.2 + card.followCount * 0.8 + Math.max(0, 30 - (Date.now() - Date.parse(card.updatedAt)) / 86400_000) * 0.2;
            return score(b) - score(a);
          }
        }
      });
    const start = (page - 1) * limit;
    const all = filtered.slice(start, start + limit);
    const categories = await seriesCategoryList(db);

    const ranking = await getRankings(db, ["series"], {});
    return {
      featured,
      featuredSource: featured[0]?.source || null,
      trending,
      trendingBasis: hasHotSignal ? "interaction" : "bookmarks",
      continueReading,
      updated,
      recommended: recommendation.items,
      recommendedMeta: { coldStart: recommendation.coldStart, profile: recommendation.profile },
      all,
      categories,
      counts: { total: cards.length, filtered: filtered.length, categories: categories.length },
      rankingComputedAt: ranking.computedAt.series || null,
      page,
      limit,
      hasMore: start + limit < filtered.length,
      config: { minChapters: config.series.minChapters, hotWindowHours: config.windows.recent },
    };
  });
}
