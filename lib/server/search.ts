import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./admin-client";
import { getHotMap, loadConfig } from "./distribution";
import { plainText } from "@/lib/text";

export type SearchTab = "all" | "featured" | "ai" | "series" | "people" | "topics";
export type SearchSort = "relevance" | "hot" | "latest" | "updated" | "bookmarks" | "likes";

type PostRow = {
  id: string; client_id: number; title: string; body_excerpt: string | null; image_url: string | null;
  channel: string; content_type: string; created_at: string; series_id: string | null;
  author_id: string | null; view_count: number;
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

export function sanitizeQuery(raw: string) {
  return raw.replace(/[%,_()."\\*,;:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function isPublicSearchTerm(term: string) {
  const value = term.trim();
  if (value.length < 2 || value.length > 30) return false;
  if (/@/.test(value)) return false;
  if (/\d{7,}/.test(value)) return false;
  if (/(微信|电话|手机号|地址|身份证|银行卡|密码)/.test(value) && /\d/.test(value)) return false;
  if (/^(.)\1{3,}$/.test(value)) return false;
  return true;
}

const mediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
};

function relevanceScore(query: string, ...fields: (string | null | undefined)[]) {
  const q = query.toLowerCase();
  let best = 0;
  for (const raw of fields) {
    const value = (raw || "").toLowerCase();
    if (!value) continue;
    if (value === q) best = Math.max(best, 100);
    else if (value.startsWith(q)) best = Math.max(best, 82);
    else if (value.includes(q)) best = Math.max(best, 62);
    else {
      // 中文没有空格：按查询字符命中比例给一个较低的兜底分，避免完全搜不到。
      const chars = [...new Set(q.split(""))].filter((char) => /[\u4e00-\u9fa5a-z0-9]/i.test(char));
      if (chars.length >= 2) {
        const hit = chars.filter((char) => value.includes(char)).length / chars.length;
        if (hit >= 0.8) best = Math.max(best, 30 + Math.round(hit * 20));
      }
    }
  }
  return best;
}

type PostResult = {
  type: "post";
  id: string;
  clientId: number;
  title: string;
  excerpt: string;
  cover: string | null;
  channel: string;
  contentType: string;
  tag: string | null;
  author: { name: string; avatar: string | null } | null;
  createdAt: string;
  likes: number;
  heat: number;
  score: number;
};

type SeriesResult = {
  type: "series";
  id: string;
  title: string;
  excerpt: string;
  cover: string | null;
  channel: string;
  kind: string;
  tag: string | null;
  author: { id: string; name: string; avatar: string | null } | null;
  updatedAt: string;
  chapters: number;
  bookmarks: number;
  heat: number;
  score: number;
};

export type SearchPayload = {
  query: string;
  tab: SearchTab;
  sort: SearchSort;
  items: (PostResult | SeriesResult)[];
  sections: {
    featured: PostResult[];
    ai: PostResult[];
    series: SeriesResult[];
    people: { type: "people"; id: string; nickname: string; bio: string; avatar: string | null; score: number }[];
    topics: { type: "topic"; id: number; name: string; count: number; score: number }[];
  };
  counts: { featured: number; ai: number; series: number; people: number; topics: number; all: number };
  people: { type: "people"; id: string; nickname: string; bio: string; avatar: string | null; score: number }[];
  topics: { type: "topic"; id: number; name: string; count: number; score: number }[];
  hasMore: boolean;
  mode: "results" | "empty";
};

async function loadPosts(db: SupabaseClient, query: string, limit: number) {
  const { data } = await db.from("posts")
    .select("id,client_id,title,body_excerpt,image_url,channel,content_type,created_at,series_id,author_id,view_count,profiles!posts_author_id_fkey(nickname,avatar_url),interest_tags!posts_tag_id_fkey(name),post_media(storage_path),post_like_stats(like_count)")
    .eq("status", "published")
    .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as unknown as PostRow[];
}

async function loadSeries(db: SupabaseClient, query: string, limit: number) {
  const { data } = await db.from("post_series")
    .select("id,title,description,cover_url,kind,channel,category_id,content_updated_at,created_at,profiles!post_series_creator_id_fkey(id,nickname,avatar_url)")
    .eq("review_status", "approved").eq("is_public", true)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .order("content_updated_at", { ascending: false })
    .limit(limit);
  const rows = (data || []) as unknown as SeriesRow[];

  // 合集内可见作品的标题也参与匹配（但不因此绕过作品可见性）。
  const { data: chapterData } = await db.from("posts")
    .select("series_id,title")
    .eq("status", "published").not("series_id", "is", null)
    .ilike("title", `%${query}%`).limit(200);
  const chapterSeriesIds = [...new Set(((chapterData || []) as { series_id: string }[]).map((row) => row.series_id))];
  const known = new Set(rows.map((row) => row.id));
  const missing = chapterSeriesIds.filter((id) => !known.has(id));
  if (missing.length) {
    const { data: extra } = await db.from("post_series")
      .select("id,title,description,cover_url,kind,channel,category_id,content_updated_at,created_at,profiles!post_series_creator_id_fkey(id,nickname,avatar_url)")
      .in("id", missing).eq("review_status", "approved").eq("is_public", true).limit(40);
    rows.push(...((extra || []) as unknown as SeriesRow[]));
  }
  return rows;
}

async function loadChapterCounts(db: SupabaseClient, seriesIds: string[]) {
  const counts = new Map<string, number>();
  if (!seriesIds.length) return counts;
  const { data } = await db.from("posts").select("series_id").in("series_id", seriesIds).eq("status", "published");
  for (const row of (data || []) as { series_id: string }[]) counts.set(row.series_id, (counts.get(row.series_id) || 0) + 1);
  return counts;
}

async function loadFollowCounts(db: SupabaseClient, seriesIds: string[]) {
  const counts = new Map<string, number>();
  if (!seriesIds.length) return counts;
  const { data } = await db.from("collection_follows").select("series_id").in("series_id", seriesIds);
  for (const row of (data || []) as { series_id: string }[]) counts.set(row.series_id, (counts.get(row.series_id) || 0) + 1);
  return counts;
}

export async function searchAll(db: SupabaseClient, options: {
  query: string; tab: SearchTab; sort: SearchSort; page: number; limit: number;
}): Promise<SearchPayload> {
  const query = sanitizeQuery(options.query);
  const limit = Math.max(4, Math.min(24, options.limit));
  const emptyCounts = { featured: 0, ai: 0, series: 0, people: 0, topics: 0, all: 0 };
  if (!query) return { query, tab: options.tab, sort: options.sort, items: [], sections: { featured: [], ai: [], series: [], people: [], topics: [] }, counts: emptyCounts, people: [], topics: [], hasMore: false, mode: "empty" };

  const [posts, seriesRows, peopleRes, topicRes] = await Promise.all([
    loadPosts(db, query, 240),
    loadSeries(db, query, 120),
    db.from("profiles").select("id,nickname,bio,avatar_url").or(`nickname.ilike.%${query}%,bio.ilike.%${query}%`).order("nickname", { ascending: true }).limit(40),
    db.from("interest_tags").select("id,name,description").ilike("name", `%${query}%`).limit(40),
  ]);

  const [postHeat, seriesHeat, chapterCounts, followCounts] = await Promise.all([
    getHotMap(db, "post", posts.map((row) => row.id)),
    getHotMap(db, "series", seriesRows.map((row) => row.id)),
    loadChapterCounts(db, seriesRows.map((row) => row.id)),
    loadFollowCounts(db, seriesRows.map((row) => row.id)),
  ]);

  const postResults: PostResult[] = posts.map((row) => {
    const author = one(row.profiles);
    const tag = one(row.interest_tags);
    const media = (row.post_media || [])[0];
    const stats = one(row.post_like_stats);
    return {
      type: "post" as const,
      id: row.id,
      clientId: row.client_id,
      title: row.title,
      excerpt: plainText(row.body_excerpt),
      cover: mediaUrl(row.image_url) || mediaUrl(media?.storage_path),
      channel: row.channel,
      contentType: row.content_type,
      tag: tag?.name || null,
      author: author ? { name: author.nickname, avatar: author.avatar_url } : null,
      createdAt: row.created_at,
      likes: stats?.like_count || 0,
      heat: postHeat.get(row.id) || 0,
      score: relevanceScore(query, row.title, plainText(row.body_excerpt, 400), tag?.name, author?.nickname),
    };
  }).filter((item) => item.score > 0);

  const seriesResults: SeriesResult[] = seriesRows.map((row) => {
    const author = one(row.profiles);
    return {
      type: "series" as const,
      id: row.id,
      title: row.title,
      excerpt: plainText(row.description, 110),
      cover: mediaUrl(row.cover_url),
      channel: row.channel,
      kind: row.kind,
      tag: null,
      author: author ? { id: author.id, name: author.nickname, avatar: author.avatar_url } : null,
      updatedAt: row.content_updated_at,
      chapters: chapterCounts.get(row.id) || 0,
      bookmarks: followCounts.get(row.id) || 0,
      heat: seriesHeat.get(row.id) || 0,
      score: relevanceScore(query, row.title, plainText(row.description, 400), author?.nickname),
    };
  }).filter((item) => item.score > 0 && item.chapters > 0);

  const people = ((peopleRes.data || []) as { id: string; nickname: string; bio: string; avatar_url: string | null }[])
    .map((row) => ({ type: "people" as const, id: row.id, nickname: row.nickname, bio: row.bio || "", avatar: row.avatar_url, score: relevanceScore(query, row.nickname, row.bio) }))
    .filter((item) => item.score > 0);

  const topicRows = ((topicRes.data || []) as { id: number; name: string; description: string }[])
    .map((row) => ({ type: "topic" as const, id: row.id, name: row.name, count: 0, score: relevanceScore(query, row.name, row.description) }))
    .filter((item) => item.score > 0);

  const topicSeries = new Map<string, string[]>();
  {
    const { data } = await db.from("post_topics").select("topic_id,posts!inner(status,series_id)").limit(1000);
    for (const row of (data || []) as { topic_id: number; posts: { status: string; series_id: string | null } | { status: string; series_id: string | null }[] }[]) {
      const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
      if (!post || post.status !== "published" || !post.series_id) continue;
      const list = topicSeries.get(String(row.topic_id)) || [];
      list.push(post.series_id);
      topicSeries.set(String(row.topic_id), list);
    }
  }
  for (const topic of topicRows) {
    topic.count = new Set(topicSeries.get(String(topic.id)) || []).size;
  }

  const sortPosts = (list: PostResult[]) => {
    switch (options.sort) {
      case "hot": return list.sort((a, b) => b.heat - a.heat || b.score - a.score);
      case "latest": return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      case "likes": return list.sort((a, b) => b.likes - a.likes || b.score - a.score);
      case "bookmarks": return list.sort((a, b) => b.heat - a.heat || b.score - a.score);
      default: return list.sort((a, b) => b.score - a.score || b.heat - a.heat || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
  };
  const sortSeries = (list: SeriesResult[]) => {
    switch (options.sort) {
      case "hot": case "bookmarks": return list.sort((a, b) => b.heat - a.heat || b.bookmarks - a.bookmarks || b.score - a.score);
      case "latest": case "updated": return list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      default: return list.sort((a, b) => b.score - a.score || b.heat - a.heat || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }
  };

  sortPosts(postResults);
  sortSeries(seriesResults);

  const featured = postResults.filter((item) => item.channel === "community");
  const ai = postResults.filter((item) => item.channel === "ai");
  const all = [...postResults, ...seriesResults].sort((a, b) => b.score - a.score || b.heat - a.heat);

  let items: (PostResult | SeriesResult)[] = [];
  if (options.tab === "all") items = all;
  else if (options.tab === "featured") items = featured;
  else if (options.tab === "ai") items = ai;
  else if (options.tab === "series") items = seriesResults;

  const page = Math.max(1, options.page);
  const slice = items.slice((page - 1) * limit, page * limit);

  return {
    query,
    tab: options.tab,
    sort: options.sort,
    items: options.tab === "people" || options.tab === "topics" ? [] : slice,
    sections: {
      featured: featured.slice(0, 6),
      ai: ai.slice(0, 6),
      series: seriesResults.slice(0, 6),
      people: people.slice(0, 6),
      topics: topicRows.slice(0, 8),
    },
    counts: {
      featured: featured.length,
      ai: ai.length,
      series: seriesResults.length,
      people: people.length,
      topics: topicRows.length,
      all: all.length,
    },
    people,
    topics: topicRows,
    hasMore: items.length > page * limit,
    mode: items.length || people.length || topicRows.length ? "results" : "empty",
  };
}

export async function recordSearch(query: string, userId: string | null, resultCount: number) {
  const clean = sanitizeQuery(query);
  if (!clean) return;
  try {
    const admin = adminClient();
    await admin.rpc("heika_record_search", { p_term: clean, p_display: query.trim().slice(0, 60), p_user: userId, p_results: resultCount });
  } catch {
    // 搜索统计失败不影响搜索结果本身。
  }
}

export async function recordSearchClick(term: string, entityType: string, entityId: string | null, userId: string | null) {
  const clean = sanitizeQuery(term);
  if (!clean) return;
  try {
    const admin = adminClient();
    await admin.from("search_events").insert({
      term: clean, display_term: term.trim().slice(0, 60), user_id: userId,
      result_count: 0, clicked_type: entityType.slice(0, 20), clicked_id: entityId,
    });
    const { data } = await admin.from("search_terms").select("click_count").eq("term", clean).maybeSingle();
    if (data) {
      await admin.from("search_terms").update({ click_count: Number((data as { click_count: number }).click_count) + 1 }).eq("term", clean);
    }
  } catch {
    // 忽略点击统计失败
  }
}

export type TrendingPayload = {
  mode: "hot" | "recommended";
  items: { term: string; count: number; users: number }[];
  updatedAt: string;
  reason?: string;
};

/** 真实热搜：只统计有效搜索事件；样本不足时明确降级为「推荐搜索」。 */
export async function getTrendingSearches(db: SupabaseClient): Promise<TrendingPayload> {
  const { config } = await loadConfig(db);
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data } = await db.from("search_events")
    .select("term,display_term,user_id,result_count,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(3000);
  const rows = (data || []) as { term: string; display_term: string; user_id: string | null; result_count: number }[];
  const agg = new Map<string, { term: string; count: number; users: Set<string>; zero: number }>();
  for (const row of rows) {
    if (!isPublicSearchTerm(row.display_term || row.term)) continue;
    const item = agg.get(row.term) || { term: row.display_term || row.term, count: 0, users: new Set<string>(), zero: 0 };
    item.count += 1;
    if (row.user_id) item.users.add(row.user_id);
    if (!row.result_count) item.zero += 1;
    agg.set(row.term, item);
  }
  const ranked = [...agg.values()]
    .filter((item) => item.users.size >= config.search.minUsersForHot && item.zero < item.count)
    .sort((a, b) => b.users.size - a.users.size || b.count - a.count)
    .slice(0, 10)
    .map((item) => ({ term: item.term, count: item.count, users: item.users.size }));

  if (ranked.length) return { mode: "hot", items: ranked, updatedAt: new Date().toISOString() };

  const [{ data: topics }, { data: series }] = await Promise.all([
    db.from("interest_tags").select("name").order("sort_order", { ascending: true }).limit(8),
    db.from("post_series").select("title").eq("review_status", "approved").eq("is_public", true).order("content_updated_at", { ascending: false }).limit(5),
  ]);
  const fallback = [
    ...((topics || []) as { name: string }[]).map((row) => row.name),
    ...((series || []) as { title: string }[]).map((row) => row.title),
  ].slice(0, 10).map((term) => ({ term, count: 0, users: 0 }));
  return {
    mode: "recommended",
    items: fallback,
    updatedAt: new Date().toISOString(),
    reason: `真实搜索样本不足（需 ≥ ${config.search.minUsersForHot} 位不同用户），当前展示推荐搜索。`,
  };
}

export async function getSuggestions(db: SupabaseClient, raw: string) {
  const query = sanitizeQuery(raw);
  if (query.length < 1) return { items: [], correction: null as string | null };
  const [posts, series, people, topics] = await Promise.all([
    db.from("posts").select("id,title,channel").eq("status", "published").ilike("title", `%${query}%`).order("created_at", { ascending: false }).limit(6),
    db.from("post_series").select("id,title").eq("review_status", "approved").eq("is_public", true).ilike("title", `%${query}%`).limit(4),
    db.from("profiles").select("id,nickname").ilike("nickname", `%${query}%`).limit(3),
    db.from("interest_tags").select("id,name").ilike("name", `%${query}%`).limit(4),
  ]);
  const items = [
    ...((posts.data || []) as { id: string; title: string; channel: string }[]).map((row) => ({ type: "post" as const, id: row.id, label: row.title, hint: row.channel === "ai" ? "AI 资源" : "作品" })),
    ...((series.data || []) as { id: string; title: string }[]).map((row) => ({ type: "series" as const, id: row.id, label: row.title, hint: "合集" })),
    ...((people.data || []) as { id: string; nickname: string }[]).map((row) => ({ type: "people" as const, id: row.id, label: row.nickname, hint: "用户" })),
    ...((topics.data || []) as { id: number; name: string }[]).map((row) => ({ type: "topic" as const, id: String(row.id), label: row.name, hint: "话题" })),
  ].slice(0, 10);

  let correction: string | null = null;
  if (!items.length && query.length >= 4) {
    // 轻量纠错：用前缀召回，给一个「你是不是想找」的候选，不改变搜索原词。
    const head = query.slice(0, Math.max(2, query.length - 2));
    const { data } = await db.from("posts").select("title").eq("status", "published").ilike("title", `%${head}%`).limit(1);
    const title = ((data || []) as { title: string }[])[0]?.title;
    if (title) correction = title;
  }
  return { items, correction };
}
