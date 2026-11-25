import type { SupabaseClient } from "@supabase/supabase-js";
import { getHotMap, loadConfig, type DistributionConfig } from "./distribution";
import { plainText } from "@/lib/text";

/** 规则推荐引擎：兴趣匹配 / 近期热门 / 新作品 / 优质合集 / 兴趣探索，带多样性重排。 */

type Candidate = {
  type: "post" | "series";
  id: string;
  title: string;
  excerpt: string;
  cover: string | null;
  channel: string;
  kind: string;
  tagId: number | null;
  tag: string | null;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  createdAt: string;
  chapters: number;
  follows: number;
  likes: number;
  hot: number;
  pool: string;
  reason: string;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? (value[0] || null) : (value || null);
const mediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
};

export type InterestProfile = {
  tags: Map<number, number>;
  seriesIds: Set<string>;
  hasSignal: boolean;
};

export async function buildInterestProfile(db: SupabaseClient, userId: string | null): Promise<InterestProfile> {
  const tags = new Map<number, number>();
  const seriesIds = new Set<string>();
  if (!userId) return { tags, seriesIds, hasSignal: false };

  const [{ data: interests }, { data: bookmarks }, { data: interactions }, { data: follows }, { data: reads }] = await Promise.all([
    db.from("user_interests").select("tag_id").eq("user_id", userId),
    db.from("bookmarks").select("post_id").eq("user_id", userId).limit(300),
    db.from("user_interactions").select("post_id,liked").eq("user_id", userId).eq("liked", true).limit(300),
    db.from("collection_follows").select("series_id").eq("user_id", userId).limit(200),
    db.from("content_events").select("entity_id").eq("user_id", userId).eq("entity_type", "post").eq("kind", "read").gte("occurred_at", new Date(Date.now() - 90 * 86400_000).toISOString()).limit(400),
  ]);

  for (const row of (interests || []) as { tag_id: number }[]) tags.set(Number(row.tag_id), (tags.get(Number(row.tag_id)) || 0) + 3);
  for (const row of (follows || []) as { series_id: string }[]) seriesIds.add(row.series_id);

  const postIds = [...new Set([
    ...((bookmarks || []) as { post_id: string }[]).map((row) => row.post_id),
    ...((interactions || []) as { post_id: string }[]).map((row) => row.post_id),
    ...((reads || []) as { entity_id: string }[]).map((row) => row.entity_id),
  ])];
  if (postIds.length) {
    const { data: postRows } = await db.from("posts").select("id,tag_id,series_id").in("id", postIds.slice(0, 800));
    for (const row of (postRows || []) as { id: string; tag_id: number; series_id: string | null }[]) {
      const weight = ((bookmarks || []) as { post_id: string }[]).some((item) => item.post_id === row.id) ? 4
        : ((interactions || []) as { post_id: string }[]).some((item) => item.post_id === row.id) ? 2.5 : 1;
      tags.set(Number(row.tag_id), (tags.get(Number(row.tag_id)) || 0) + weight);
      if (row.series_id) seriesIds.add(row.series_id);
    }
  }
  return { tags, seriesIds, hasSignal: tags.size > 0 || seriesIds.size > 0 };
}

export type RecommendResult = {
  items: Candidate[];
  coldStart: boolean;
  profile: { tags: { id: number; weight: number }[]; followedSeries: number };
  ratios: DistributionConfig["recommend"];
  computedAt: string;
};

type PostRow = {
  id: string; client_id: number; title: string; body_excerpt: string | null; image_url: string | null;
  channel: string; content_type: string; created_at: string; tag_id: number;
  author_id: string | null;
  profiles?: { nickname: string; avatar_url: string | null } | { nickname: string; avatar_url: string | null }[] | null;
  interest_tags?: { name: string } | { name: string }[] | null;
  post_media?: { storage_path: string }[] | null;
  post_like_stats?: { like_count: number } | { like_count: number }[] | null;
};

export async function recommendSeries(db: SupabaseClient, userId: string | null, limit = 12): Promise<RecommendResult> {
  const { config } = await loadConfig(db);
  const profile = await buildInterestProfile(db, userId);
  const [{ data: seriesData }, { data: tagRows }] = await Promise.all([
    db.from("post_series")
      .select("id,title,description,cover_url,kind,channel,category_id,content_updated_at,created_at,profiles!post_series_creator_id_fkey(id,nickname,avatar_url)")
      .eq("review_status", "approved").eq("is_public", true)
      .order("content_updated_at", { ascending: false }).limit(200),
    db.from("interest_tags").select("id,name").limit(1000),
  ]);
  const tagName = new Map(((tagRows || []) as { id: number; name: string }[]).map((row) => [Number(row.id), row.name]));
  const rows = (seriesData || []) as unknown as {
    id: string; title: string; description: string; cover_url: string | null; kind: string; channel: string;
    category_id: number | null; content_updated_at: string; created_at: string;
    profiles?: { id: string; nickname: string; avatar_url: string | null } | { id: string; nickname: string; avatar_url: string | null }[] | null;
  }[];

  const chapterCount = new Map<string, number>();
  if (rows.length) {
    const { data } = await db.from("posts").select("series_id").in("series_id", rows.map((row) => row.id)).eq("status", "published");
    for (const row of (data || []) as { series_id: string }[]) chapterCount.set(row.series_id, (chapterCount.get(row.series_id) || 0) + 1);
  }
  const followCount = new Map<string, number>();
  if (rows.length) {
    const { data } = await db.from("collection_follows").select("series_id").in("series_id", rows.map((row) => row.id));
    for (const row of (data || []) as { series_id: string }[]) followCount.set(row.series_id, (followCount.get(row.series_id) || 0) + 1);
  }
  const hot = await getHotMap(db, "series", rows.map((row) => row.id));

  const maxHot = Math.max(1, ...rows.map((row) => hot.get(row.id) || 0));
  const maxFollow = Math.max(1, ...rows.map((row) => followCount.get(row.id) || 0));
  const now = Date.now();

  const candidates: Candidate[] = rows.map((row) => {
    const author = one(row.profiles);
    const chapters = chapterCount.get(row.id) || 0;
    const follow = followCount.get(row.id) || 0;
    const heat = hot.get(row.id) || 0;
    const tagId = row.category_id ? Number(row.category_id) : null;
    return {
      type: "series" as const, id: row.id, title: row.title, excerpt: row.description || "",
      cover: mediaUrl(row.cover_url), channel: row.channel, kind: row.kind,
      tagId, tag: tagId ? tagName.get(tagId) || null : null,
      authorId: author?.id || "", authorName: author?.nickname || "创作者", authorAvatar: author?.avatar_url || null,
      createdAt: row.content_updated_at, chapters, follows: follow, likes: 0, hot: heat,
      pool: "explore", reason: "",
    };
  }).filter((item) => item.chapters >= config.series.minChapters);

  const { interest, hot: hotRatio, fresh, collection, explore } = config.recommend;
  const weighted = candidates.map((item) => {
    const interestWeight = item.tagId ? (profile.tags.get(item.tagId) || 0) : 0;
    const normalizedInterest = Math.min(1, interestWeight / 6);
    const hotScore = item.hot / maxHot;
    const freshScore = Math.max(0, 1 - (now - Date.parse(item.createdAt)) / (config.recommend.freshHours * 3600_000));
    const collectionScore = item.follows / maxFollow;
    const exploreScore = 0.5 + 0.5 * Math.abs(Math.sin((item.id.charCodeAt(0) + item.id.charCodeAt(1) + (userId ? userId.length : 7)) * 1.618));
    const scores = {
      interest: normalizedInterest * interest,
      hot: hotScore * hotRatio,
      fresh: freshScore * fresh,
      collection: collectionScore * collection,
      explore: exploreScore * explore,
    };
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const pool = best[1] > 0 ? best[0] : "explore";
    const reason = pool === "interest" ? "符合你的兴趣" : pool === "hot" ? "近期热门" : pool === "fresh" ? "最近更新" : pool === "collection" ? "收藏较多" : "换换口味";
    return { item: { ...item, pool, reason }, total: Object.values(scores).reduce((sum, value) => sum + value, 0) };
  }).sort((a, b) => b.total - a.total);

  // 多样性重排：同作者、同分类上限内做贪心挑选。
  const picked: Candidate[] = [];
  const authorCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  for (const entry of weighted) {
    if (picked.length >= limit) break;
    const item = entry.item;
    if (picked.some((existing) => existing.id === item.id)) continue;
    const authorUsed = authorCount.get(item.authorId) || 0;
    if (authorUsed >= config.recommend.maxPerAuthor) continue;
    const categoryKey = item.tagId ? String(item.tagId) : "none";
    const categoryUsed = categoryCount.get(categoryKey) || 0;
    if (categoryKey !== "none" && categoryUsed >= config.recommend.maxPerCategory) continue;
    picked.push(item);
    authorCount.set(item.authorId, authorUsed + 1);
    categoryCount.set(categoryKey, categoryUsed + 1);
  }
  // 上限导致不足时，按热度回补，不允许出现空白。
  if (picked.length < limit) {
    for (const entry of weighted) {
      if (picked.length >= limit) break;
      if (picked.some((existing) => existing.id === entry.item.id)) continue;
      picked.push({ ...entry.item, pool: "explore", reason: "补充推荐" });
    }
  }

  return {
    items: picked,
    coldStart: !profile.hasSignal,
    profile: { tags: [...profile.tags.entries()].map(([id, weight]) => ({ id, weight })).sort((a, b) => b.weight - a.weight).slice(0, 8), followedSeries: profile.seriesIds.size },
    ratios: config.recommend,
    computedAt: new Date().toISOString(),
  };
}

/** 首页/AI 等作品型推荐：同样走统一内容池，便于后台查看分发比例。 */
export async function recommendPosts(db: SupabaseClient, userId: string | null, surface: "discover" | "ai", limit = 12): Promise<RecommendResult> {
  const { config } = await loadConfig(db);
  const profile = await buildInterestProfile(db, userId);
  let request = db.from("posts")
    .select("id,client_id,title,body_excerpt,image_url,channel,content_type,created_at,tag_id,author_id,profiles!posts_author_id_fkey(nickname,avatar_url),interest_tags!posts_tag_id_fkey(name),post_media(storage_path),post_like_stats(like_count)")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(240);
  if (surface === "ai") request = request.eq("channel", "ai");
  const { data } = await request;
  const rows = (data || []) as unknown as PostRow[];
  const hot = await getHotMap(db, "post", rows.map((row) => row.id));
  const maxHot = Math.max(1, ...rows.map((row) => hot.get(row.id) || 0));
  const maxLikes = Math.max(1, ...rows.map((row) => Number(one(row.post_like_stats)?.like_count) || 0));
  const now = Date.now();
  const { interest, hot: hotRatio, fresh, collection, explore } = config.recommend;

  const weighted = rows.map((row) => {
    const author = one(row.profiles);
    const tag = one(row.interest_tags);
    const media = (row.post_media || [])[0];
    const likes = Number(one(row.post_like_stats)?.like_count) || 0;
    const interestWeight = profile.tags.get(Number(row.tag_id)) || 0;
    const scores = {
      interest: Math.min(1, interestWeight / 6) * interest,
      hot: ((hot.get(row.id) || 0) / maxHot) * hotRatio,
      fresh: Math.max(0, 1 - (now - Date.parse(row.created_at)) / (config.recommend.freshHours * 3600_000)) * fresh,
      collection: (likes / maxLikes) * collection,
      explore: (0.5 + 0.5 * Math.abs(Math.sin(row.id.charCodeAt(0) * 1.618 + (userId ? userId.length : 3)))) * explore,
    };
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const pool = best[1] > 0 ? best[0] : "explore";
    const candidate: Candidate = {
      type: "post" as const, id: row.id, title: row.title, excerpt: plainText(row.body_excerpt, 90),
      cover: mediaUrl(row.image_url) || mediaUrl(media?.storage_path), channel: row.channel, kind: row.content_type,
      tagId: Number(row.tag_id), tag: tag?.name || null,
      authorId: row.author_id || "", authorName: author?.nickname || "创作者", authorAvatar: author?.avatar_url || null,
      createdAt: row.created_at, chapters: 0, follows: 0, likes, hot: hot.get(row.id) || 0,
      pool, reason: pool === "interest" ? "符合你的兴趣" : pool === "hot" ? "近期热门" : pool === "fresh" ? "新发布" : pool === "collection" ? "收藏较多" : "换换口味",
    };
    return { item: candidate, total: Object.values(scores).reduce((sum, value) => sum + value, 0) };
  }).sort((a, b) => b.total - a.total);

  const picked: Candidate[] = [];
  const authorCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  for (const entry of weighted) {
    if (picked.length >= limit) break;
    const item = entry.item;
    const authorUsed = authorCount.get(item.authorId) || 0;
    if (authorUsed >= config.recommend.maxPerAuthor) continue;
    const key = item.tagId ? String(item.tagId) : "none";
    const used = categoryCount.get(key) || 0;
    if (key !== "none" && used >= config.recommend.maxPerCategory) continue;
    if (picked.some((existing) => existing.id === item.id)) continue;
    picked.push(item);
    authorCount.set(item.authorId, authorUsed + 1);
    categoryCount.set(key, used + 1);
  }
  if (picked.length < limit) {
    for (const entry of weighted) {
      if (picked.length >= limit) break;
      if (picked.some((existing) => existing.id === entry.item.id)) continue;
      picked.push({ ...entry.item, pool: "explore", reason: "补充推荐" });
    }
  }

  return {
    items: picked,
    coldStart: !profile.hasSignal,
    profile: { tags: [...profile.tags.entries()].map(([id, weight]) => ({ id, weight })).sort((a, b) => b.weight - a.weight).slice(0, 8), followedSeries: profile.seriesIds.size },
    ratios: config.recommend,
    computedAt: new Date().toISOString(),
  };
}
