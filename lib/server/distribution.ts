import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./admin-client";
import { plainText } from "@/lib/text";

/**
 * 内容分发服务：统一热度、榜单、推荐池与分发配置。
 * 所有最终热度只由服务端计算，客户端只读快照。
 */

export type EventKind = "like" | "bookmark" | "share" | "read" | "complete" | "follow";

export type DistributionConfig = {
  weights: Record<EventKind, number>;
  decayHours: number;
  windows: { recent: number; rising: number; long: number };
  ranking: { size: number; ttlMinutes: number; longTtlMinutes: number };
  recommend: {
    interest: number; hot: number; fresh: number; collection: number; explore: number;
    maxPerAuthor: number; maxPerCategory: number; freshHours: number;
  };
  search: { minUsersForHot: number; ttlMinutes: number };
  series: { minChapters: number; featuredLimit: number; trendingLimit: number };
};

export const DEFAULT_CONFIG: DistributionConfig = {
  weights: { like: 2, bookmark: 5, share: 3, read: 0.1, complete: 0.6, follow: 4 },
  decayHours: 72,
  windows: { recent: 72, rising: 24, long: 720 },
  ranking: { size: 20, ttlMinutes: 10, longTtlMinutes: 180 },
  recommend: { interest: 0.4, hot: 0.2, fresh: 0.15, collection: 0.15, explore: 0.1, maxPerAuthor: 2, maxPerCategory: 3, freshHours: 72 },
  search: { minUsersForHot: 3, ttlMinutes: 20 },
  series: { minChapters: 1, featuredLimit: 6, trendingLimit: 12 },
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

/** 只接受合法字段与范围，缺失项回落到默认值；比例统一归一化到 1。 */
export function normalizeConfig(raw: unknown): DistributionConfig {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const weightsRaw = (source.weights && typeof source.weights === "object" ? source.weights : {}) as Record<string, unknown>;
  const windowsRaw = (source.windows && typeof source.windows === "object" ? source.windows : {}) as Record<string, unknown>;
  const rankingRaw = (source.ranking && typeof source.ranking === "object" ? source.ranking : {}) as Record<string, unknown>;
  const recommendRaw = (source.recommend && typeof source.recommend === "object" ? source.recommend : {}) as Record<string, unknown>;
  const searchRaw = (source.search && typeof source.search === "object" ? source.search : {}) as Record<string, unknown>;
  const seriesRaw = (source.series && typeof source.series === "object" ? source.series : {}) as Record<string, unknown>;

  const weights = {} as Record<EventKind, number>;
  for (const kind of ["like", "bookmark", "share", "read", "complete", "follow"] as EventKind[]) {
    weights[kind] = clamp(weightsRaw[kind], 0, 20, DEFAULT_CONFIG.weights[kind]);
  }

  const ratioOf = (key: string) => clamp(recommendRaw[key], 0, 1, DEFAULT_CONFIG.recommend[key as keyof DistributionConfig["recommend"]] as number);
  const ratios = {
    interest: ratioOf("interest"),
    hot: ratioOf("hot"),
    fresh: ratioOf("fresh"),
    collection: ratioOf("collection"),
    explore: ratioOf("explore"),
  };
  const total = Object.values(ratios).reduce((sum, value) => sum + value, 0);
  const normalized = total > 0
    ? Object.fromEntries(Object.entries(ratios).map(([key, value]) => [key, Number((value / total).toFixed(3))])) as typeof ratios
    : ratios;

  return {
    weights,
    decayHours: clamp(source.decayHours, 6, 720, DEFAULT_CONFIG.decayHours),
    windows: {
      recent: clamp(windowsRaw.recent, 24, 720, DEFAULT_CONFIG.windows.recent),
      rising: clamp(windowsRaw.rising, 6, 168, DEFAULT_CONFIG.windows.rising),
      long: clamp(windowsRaw.long, 168, 8760, DEFAULT_CONFIG.windows.long),
    },
    ranking: {
      size: clamp(rankingRaw.size, 5, 50, DEFAULT_CONFIG.ranking.size),
      ttlMinutes: clamp(rankingRaw.ttlMinutes, 1, 180, DEFAULT_CONFIG.ranking.ttlMinutes),
      longTtlMinutes: clamp(rankingRaw.longTtlMinutes, 30, 720, DEFAULT_CONFIG.ranking.longTtlMinutes),
    },
    recommend: {
      ...normalized,
      maxPerAuthor: clamp(recommendRaw.maxPerAuthor, 1, 6, DEFAULT_CONFIG.recommend.maxPerAuthor),
      maxPerCategory: clamp(recommendRaw.maxPerCategory, 1, 8, DEFAULT_CONFIG.recommend.maxPerCategory),
      freshHours: clamp(recommendRaw.freshHours, 6, 336, DEFAULT_CONFIG.recommend.freshHours),
    },
    search: {
      minUsersForHot: clamp(searchRaw.minUsersForHot, 1, 50, DEFAULT_CONFIG.search.minUsersForHot),
      ttlMinutes: clamp(searchRaw.ttlMinutes, 5, 120, DEFAULT_CONFIG.search.ttlMinutes),
    },
    series: {
      minChapters: clamp(seriesRaw.minChapters, 1, 10, DEFAULT_CONFIG.series.minChapters),
      featuredLimit: clamp(seriesRaw.featuredLimit, 1, 12, DEFAULT_CONFIG.series.featuredLimit),
      trendingLimit: clamp(seriesRaw.trendingLimit, 3, 30, DEFAULT_CONFIG.series.trendingLimit),
    },
  };
}

export async function loadConfig(db: SupabaseClient): Promise<{ config: DistributionConfig; version: number; updatedAt: string | null }> {
  const { data } = await db.from("distribution_config").select("config,version,updated_at").eq("id", 1).maybeSingle();
  const row = data as { config?: unknown; version?: number; updated_at?: string } | null;
  return {
    config: normalizeConfig(row?.config),
    version: Number(row?.version) || 1,
    updatedAt: row?.updated_at || null,
  };
}

export async function saveConfig(actorId: string, raw: unknown, note?: string) {
  const admin = adminClient();
  const next = normalizeConfig(raw);
  const { data: current } = await admin.from("distribution_config").select("version").eq("id", 1).maybeSingle();
  const version = (Number((current as { version?: number } | null)?.version) || 0) + 1;
  const { error } = await admin.from("distribution_config").upsert({
    id: 1, config: next, version, updated_by: actorId, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  await admin.from("distribution_config_history").insert({ version, config: next, updated_by: actorId });
  await admin.from("admin_action_logs").insert({
    actor_id: actorId, action: "distribution.config.save", target: "distribution_config",
    detail: { version, note: note || "", config: next },
  });
  return { config: next, version };
}

type HotAgg = {
  s24: number; s72: number; s7: number; long: number;
  likes: number; bookmarks: number; shares: number; reads: number;
  readers: Set<string>;
};

const emptyAgg = (): HotAgg => ({ s24: 0, s72: 0, s7: 0, long: 0, likes: 0, bookmarks: 0, shares: 0, reads: 0, readers: new Set() });

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
};

/** 按事件发生时间逐条衰减，避免用作品发布时间统一衰减全部历史互动。 */
export async function refreshContentHot(config: DistributionConfig) {
  const admin = adminClient();
  const now = Date.now();
  const windowHours = Math.max(config.windows.long, config.windows.recent, 720);
  const since = new Date(now - windowHours * 3600_000).toISOString();

  const authorByPost = new Map<string, string | null>();
  const seriesByPost = new Map<string, string | null>();
  {
    let from = 0;
    for (;;) {
      const { data, error } = await admin.from("posts").select("id,author_id,series_id").range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = (data || []) as { id: string; author_id: string | null; series_id: string | null }[];
      for (const row of rows) {
        authorByPost.set(row.id, row.author_id);
        seriesByPost.set(row.id, row.series_id);
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  const authorBySeries = new Map<string, string>();
  {
    const { data } = await admin.from("post_series").select("id,creator_id").limit(2000);
    for (const row of (data || []) as { id: string; creator_id: string }[]) authorBySeries.set(row.id, row.creator_id);
  }

  const agg = new Map<string, HotAgg>();
  let events = 0;
  {
    let from = 0;
    for (;;) {
      const { data, error } = await admin.from("content_events")
        .select("entity_type,entity_id,user_id,kind,occurred_at")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = (data || []) as { entity_type: "post" | "series"; entity_id: string; user_id: string | null; kind: EventKind; occurred_at: string }[];
      for (const row of rows) {
        events += 1;
        const author = row.entity_type === "post" ? authorByPost.get(row.entity_id) : authorBySeries.get(row.entity_id);
        // 作者自身互动不计入热度。
        if (row.user_id && author && row.user_id === author) continue;
        const key = `${row.entity_type}:${row.entity_id}`;
        const item = agg.get(key) || emptyAgg();
        const ageHours = Math.max(0, (now - Date.parse(row.occurred_at)) / 3600_000);
        const decayed = config.weights[row.kind] * Math.pow(2, -ageHours / config.decayHours);
        if (ageHours <= config.windows.rising) item.s24 += decayed;
        if (ageHours <= config.windows.recent) item.s72 += decayed;
        if (ageHours <= 168) item.s7 += decayed;
        item.long += decayed;
        if (ageHours <= 168) {
          if (row.kind === "like") item.likes += 1;
          if (row.kind === "bookmark") item.bookmarks += 1;
          if (row.kind === "share") item.shares += 1;
          if (row.kind === "read") item.reads += 1;
        }
        if (row.kind === "read" && row.user_id && ageHours <= 168) item.readers.add(row.user_id);
        agg.set(key, item);
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  // 合集热度：收藏与阅读 + 内部作品近期平均热度（取前 20 篇，避免篇数堆叠）+ 真实内容更新。
  const seriesMembers = new Map<string, number[]>();
  for (const [postId, seriesId] of seriesByPost) {
    if (!seriesId) continue;
    const score = agg.get(`post:${postId}`)?.s72 || 0;
    if (score <= 0) continue;
    const list = seriesMembers.get(seriesId) || [];
    list.push(score);
    seriesMembers.set(seriesId, list);
  }
  const { data: seriesRows } = await admin.from("post_series").select("id,content_updated_at,is_public,review_status").limit(2000);
  for (const row of (seriesRows || []) as { id: string; content_updated_at: string; is_public: boolean; review_status: string }[]) {
    if (!row.is_public || row.review_status !== "approved") continue;
    const key = `series:${row.id}`;
    const base = agg.get(key) || emptyAgg();
    const members = (seriesMembers.get(row.id) || []).sort((a, b) => b - a).slice(0, 20);
    const average = members.length ? members.reduce((sum, value) => sum + value, 0) / members.length : 0;
    // 合集热度只由真实互动构成；"最近更新"另有独立排序，不能拿来冒充热度。
    const seriesScore = base.s72 + average * 1.5;
    if (seriesScore <= 0) continue;
    agg.set(key, {
      ...base,
      s24: base.s24 + average * 1.5 * 0.6,
      s72: seriesScore,
      s7: base.long + average * 1.5,
      long: base.long + average * 1.5,
      readers: base.readers,
    });
  }

  const rows = [...agg.entries()].map(([key, value]) => {
    const [entityType, entityId] = key.split(":");
    return {
      entity_type: entityType,
      entity_id: entityId,
      score_24h: Number(value.s24.toFixed(4)),
      score_72h: Number(value.s72.toFixed(4)),
      score_7d: Number(value.s7.toFixed(4)),
      score_long: Number(value.long.toFixed(4)),
      likes_7d: value.likes,
      bookmarks_7d: value.bookmarks,
      shares_7d: value.shares,
      reads_7d: value.reads,
      unique_readers_7d: value.readers.size,
      updated_at: new Date().toISOString(),
    };
  });

  for (const part of chunk(rows, 400)) {
    if (!part.length) continue;
    const { error } = await admin.from("content_hot").upsert(part, { onConflict: "entity_type,entity_id" });
    if (error) throw new Error(error.message);
  }
  return { events, entities: rows.length, computedAt: new Date().toISOString() };
}

export type RankingItem = {
  type: "post" | "series";
  id: string;
  clientId?: number;
  title: string;
  subtitle?: string;
  cover: string | null;
  channel: string;
  contentType?: string;
  tag?: string | null;
  author?: { id: string; name: string; avatar: string | null } | null;
  score: number;
  rank: number;
  meta?: Record<string, number | string | null>;
};

export type RankingPayload = {
  key: string;
  items: RankingItem[];
  computedAt: string;
  hasSignal: boolean;
  basis: "interaction" | "fresh";
  sample: { events: number; entities: number; windowHours: number };
};

type PostRow = {
  id: string; client_id: number; title: string; body_excerpt: string | null; image_url: string | null;
  channel: string; content_type: string; created_at: string; series_id: string | null; tag_id: number;
  view_count: number; author_id: string | null;
  profiles?: { nickname: string; avatar_url: string | null } | { nickname: string; avatar_url: string | null }[] | null;
  interest_tags?: { name: string } | { name: string }[] | null;
  post_media?: { storage_path: string }[] | null;
  post_like_stats?: { like_count: number } | { like_count: number }[] | null;
};

type SeriesRow = {
  id: string; title: string; description: string; cover_url: string | null; kind: string; channel: string;
  category_id: number | null; content_updated_at: string; created_at: string;
  profiles?: { id: string; nickname: string; avatar_url: string | null } | { id: string; nickname: string; avatar_url: string | null }[] | null;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? (value[0] || null) : (value || null);

const mediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
};

function postCover(row: PostRow) {
  if (row.image_url) return mediaUrl(row.image_url);
  const media = (row.post_media || [])[0];
  return media ? mediaUrl(media.storage_path) : null;
}

export type RankingKey = "global" | "ai" | "series" | "rising" | "long";

export async function buildRankings(config: DistributionConfig) {
  const admin = adminClient();
  const hot = new Map<string, { s24: number; s72: number; long: number; likes: number; bookmarks: number; reads: number }>();
  {
    let from = 0;
    for (;;) {
      const { data } = await admin.from("content_hot")
        .select("entity_type,entity_id,score_24h,score_72h,score_long,likes_7d,bookmarks_7d,reads_7d")
        .range(from, from + 999);
      const rows = (data || []) as { entity_type: string; entity_id: string; score_24h: number; score_72h: number; score_long: number; likes_7d: number; bookmarks_7d: number; reads_7d: number }[];
      for (const row of rows) {
        hot.set(`${row.entity_type}:${row.entity_id}`, {
          s24: Number(row.score_24h), s72: Number(row.score_72h), long: Number(row.score_long),
          likes: row.likes_7d, bookmarks: row.bookmarks_7d, reads: row.reads_7d,
        });
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  const { data: postData } = await admin.from("posts")
    .select("id,client_id,title,body_excerpt,image_url,channel,content_type,created_at,series_id,tag_id,view_count,author_id,profiles!posts_author_id_fkey(nickname,avatar_url),interest_tags!posts_tag_id_fkey(name),post_media(storage_path),post_like_stats(like_count)")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(500);
  const posts = (postData || []) as unknown as PostRow[];

  const { data: seriesData } = await admin.from("post_series")
    .select("id,title,description,cover_url,kind,channel,category_id,content_updated_at,created_at,profiles!post_series_creator_id_fkey(id,nickname,avatar_url)")
    .eq("review_status", "approved").eq("is_public", true)
    .order("content_updated_at", { ascending: false })
    .limit(300);
  const seriesList = (seriesData || []) as unknown as SeriesRow[];

  const chapterCount = new Map<string, number>();
  {
    const { data } = await admin.from("posts").select("series_id").eq("status", "published").not("series_id", "is", null).limit(2000);
    for (const row of (data || []) as { series_id: string }[]) chapterCount.set(row.series_id, (chapterCount.get(row.series_id) || 0) + 1);
  }
  const followCount = new Map<string, number>();
  {
    const { data } = await admin.from("collection_follows").select("series_id").limit(5000);
    for (const row of (data || []) as { series_id: string }[]) followCount.set(row.series_id, (followCount.get(row.series_id) || 0) + 1);
  }

  const seriesCategory = new Map<number, string>();
  const { data: tags } = await admin.from("interest_tags").select("id,name").limit(1000);
  for (const row of (tags || []) as { id: number; name: string }[]) seriesCategory.set(row.id, row.name);

  const postItems = posts.map((row) => {
    const author = one(row.profiles);
    const tag = one(row.interest_tags);
    const stats = one(row.post_like_stats);
    const hotScore = hot.get(`post:${row.id}`);
    return {
      type: "post" as const,
      id: row.id,
      clientId: row.client_id,
      title: row.title,
      subtitle: plainText(row.body_excerpt, 70),
      cover: postCover(row),
      channel: row.channel,
      contentType: row.content_type,
      tag: tag?.name || null,
      author: author ? { id: row.author_id || "", name: author.nickname, avatar: author.avatar_url } : null,
      s24: hotScore?.s24 || 0,
      s72: hotScore?.s72 || 0,
      long: hotScore?.long || 0,
      likes: stats?.like_count || hotScore?.likes || 0,
      bookmarks: hotScore?.bookmarks || 0,
      reads: hotScore?.reads || 0,
      createdAt: row.created_at,
      chapters: 0,
    };
  });

  const seriesItems = seriesList.map((row) => {
    const author = one(row.profiles);
    const hotScore = hot.get(`series:${row.id}`);
    const chapters = chapterCount.get(row.id) || 0;
    return {
      type: "series" as const,
      id: row.id,
      title: row.title,
      subtitle: row.description || "",
      cover: row.cover_url ? mediaUrl(row.cover_url) : null,
      channel: row.channel,
      contentType: row.kind,
      tag: row.category_id ? seriesCategory.get(row.category_id) || null : null,
      author: author ? { id: author.id || "", name: author.nickname, avatar: author.avatar_url } : null,
      s24: hotScore?.s24 || 0,
      s72: hotScore?.s72 || 0,
      long: hotScore?.long || 0,
      likes: 0,
      bookmarks: followCount.get(row.id) || 0,
      reads: hotScore?.reads || 0,
      createdAt: row.content_updated_at,
      chapters,
    };
  }).filter((item) => item.chapters >= config.series.minChapters);

  const maxOf = (items: { s72: number; s24: number; long: number }[], key: "s72" | "s24" | "long") => Math.max(0, ...items.map((item) => item[key]));
  const maxPost72 = maxOf(postItems, "s72");
  const maxSeries72 = maxOf(seriesItems, "s72");
  const maxPost24 = maxOf(postItems, "s24");
  const maxSeries24 = maxOf(seriesItems, "s24");
  const maxPostLong = maxOf(postItems, "long");
  const maxSeriesLong = maxOf(seriesItems, "long");

  const normalize = (score: number, max: number, type: "post" | "series") => {
    if (max <= 0) return 0;
    return (score / max) * (type === "series" ? 1.05 : 1);
  };

  const toItem = (candidate: (typeof postItems)[number] | (typeof seriesItems)[number], score: number): RankingItem => ({
    type: candidate.type,
    id: candidate.id,
    clientId: candidate.type === "post" ? candidate.clientId : undefined,
    title: candidate.title,
    subtitle: candidate.subtitle,
    cover: candidate.cover,
    channel: candidate.channel,
    contentType: candidate.contentType,
    tag: candidate.tag,
    author: candidate.author,
    score: Number(score.toFixed(4)),
    rank: 0,
    meta: {
      chapters: candidate.chapters,
      likes: candidate.likes,
      bookmarks: candidate.bookmarks,
      reads: candidate.reads,
    },
  });

  const rankList = (entries: { candidate: (typeof postItems)[number] | (typeof seriesItems)[number]; score: number }[], size: number) => {
    const sorted = entries.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, size);
    return sorted.map((entry, index) => ({ ...toItem(entry.candidate, entry.score), rank: index + 1 }));
  };

  const globalEntries = [
    ...postItems.map((item) => ({ candidate: item, score: normalize(item.s72, maxPost72, "post") })),
    ...seriesItems.map((item) => ({ candidate: item, score: normalize(item.s72, maxSeries72, "series") })),
  ];
  const aiEntries = [
    ...postItems.filter((item) => item.channel === "ai").map((item) => ({ candidate: item, score: normalize(item.s72, maxPost72, "post") })),
    ...seriesItems.filter((item) => item.channel === "ai").map((item) => ({ candidate: item, score: normalize(item.s72, maxSeries72, "series") })),
  ];
  const risingEntries = [
    ...postItems.map((item) => ({ candidate: item, score: normalize(item.s24, maxPost24, "post") })),
    ...seriesItems.map((item) => ({ candidate: item, score: normalize(item.s24, maxSeries24, "series") })),
  ];
  const longEntries = [
    ...postItems.map((item) => ({ candidate: item, score: normalize(item.long, maxPostLong, "post") })),
    ...seriesItems.map((item) => ({ candidate: item, score: normalize(item.long, maxSeriesLong, "series") })),
  ];
  const seriesEntries = seriesItems.map((item) => ({ candidate: item, score: normalize(item.s72, maxSeries72, "series") }));

  const sample = {
    events: [...hot.values()].reduce((sum, item) => sum + item.likes + item.bookmarks + item.reads, 0),
    entities: hot.size,
    windowHours: config.windows.recent,
  };
  const build = (key: RankingKey, entries: { candidate: (typeof postItems)[number] | (typeof seriesItems)[number]; score: number }[], size: number): RankingPayload => {
    const items = rankList(entries, size);
    return {
      key,
      items,
      computedAt: new Date().toISOString(),
      hasSignal: items.length > 0,
      basis: items.length > 0 ? "interaction" : "fresh",
      sample,
    };
  };

  const payloads: Record<RankingKey, RankingPayload> = {
    global: build("global", globalEntries, config.ranking.size),
    ai: build("ai", aiEntries, config.ranking.size),
    series: build("series", seriesEntries, config.ranking.size),
    rising: build("rising", risingEntries, config.ranking.size),
    long: build("long", longEntries, config.ranking.size),
  };

  const { data: configRow } = await admin.from("distribution_config").select("version").eq("id", 1).maybeSingle();
  const version = Number((configRow as { version?: number } | null)?.version) || 1;
  for (const [key, payload] of Object.entries(payloads)) {
    const { error } = await admin.from("ranking_snapshots").upsert({
      key, payload, computed_at: payload.computedAt, version,
    }, { onConflict: "key" });
    if (error) throw new Error(error.message);
  }

  // 记录一次真实的刷新动作，便于后台查看"最近计算时间"。
  return payloads;
}

let refreshLock: Promise<Record<RankingKey, RankingPayload>> | null = null;

/** 读取快照；过期或不存在时重算一次，重算并发合并为一次。 */
export async function getRankings(db: SupabaseClient, keys: RankingKey[], options: { force?: boolean } = {}) {
  const { config } = await loadConfig(db);
  const { data } = await db.from("ranking_snapshots").select("key,payload,computed_at").in("key", keys);
  const rows = (data || []) as { key: string; payload: RankingPayload; computed_at: string }[];
  const map = new Map(rows.map((row) => [row.key, row]));
  const now = Date.now();
  const stale = keys.filter((key) => {
    if (options.force) return true;
    const row = map.get(key);
    if (!row) return true;
    const ttl = key === "long" ? config.ranking.longTtlMinutes : config.ranking.ttlMinutes;
    return now - Date.parse(row.computed_at) > ttl * 60_000;
  });

  if (stale.length) {
    if (!refreshLock) {
      refreshLock = (async () => {
        await refreshContentHot(config);
        return buildRankings(config);
      })().finally(() => { refreshLock = null; }) as Promise<Record<RankingKey, RankingPayload>>;
    }
    try {
      const fresh = await refreshLock;
      for (const key of keys) {
        const payload = fresh[key];
        if (payload) map.set(key, { key, payload, computed_at: payload.computedAt });
      }
    } catch {
      // 重算失败时保留上一份合法快照，页面不空白。
    }
  }

  return {
    config,
    rankings: Object.fromEntries(keys.map((key) => [key, map.get(key)?.payload || null])) as Record<RankingKey, RankingPayload | null>,
    computedAt: Object.fromEntries(keys.map((key) => [key, map.get(key)?.computed_at || null])),
  };
}

export async function getHotMap(db: SupabaseClient, entityType: "post" | "series", ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const { data } = await db.from("content_hot").select("entity_id,score_72h").eq("entity_type", entityType).in("entity_id", ids);
  return new Map((data || []).map((row) => [(row as { entity_id: string }).entity_id, Number((row as { score_72h: number }).score_72h)]));
}
