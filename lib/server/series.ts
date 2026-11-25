import type { SupabaseClient } from "@supabase/supabase-js";

export type SeriesCard = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  kind: string;
  channel: string;
  categoryId: number | null;
  categoryName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string; avatarUrl: string | null } | null;
  chapters: number;
  followCount: number;
  hot: number;
  source?: string;
  reason?: string;
  progress?: { read: number; total: number; percent: number; lastPostId: string | null; updatedAt: string | null };
};

type SeriesRow = {
  id: string; creator_id: string; title: string; description: string; cover_url: string | null;
  kind: string; channel: string; category_id: number | null; status: string;
  created_at: string; content_updated_at: string;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? (value[0] || null) : (value || null);

const mediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
};

export const SERIES_FIELDS = "id,creator_id,title,description,cover_url,kind,channel,category_id,status,created_at,content_updated_at";

export async function attachSeriesStats(
  db: SupabaseClient,
  rows: SeriesRow[],
  userId: string | null,
  options: { withProgress?: boolean; withAuthor?: boolean } = {},
): Promise<SeriesCard[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const creatorIds = [...new Set(rows.map((row) => row.creator_id))];
  const categoryIds = [...new Set(rows.map((row) => row.category_id).filter((value): value is number => value !== null))];

  const [chapterRes, followRes, hotRes, profileRes, categoryRes, progressRes, readRes] = await Promise.all([
    db.from("posts").select("series_id").in("series_id", ids).eq("status", "published"),
    db.from("collection_follows").select("series_id").in("series_id", ids),
    db.from("content_hot").select("entity_id,score_72h").eq("entity_type", "series").in("entity_id", ids),
    options.withAuthor === false ? Promise.resolve({ data: [] }) : db.from("profiles").select("id,nickname,avatar_url").in("id", creatorIds),
    categoryIds.length ? db.from("interest_tags").select("id,name").in("id", categoryIds) : Promise.resolve({ data: [] }),
    options.withProgress && userId ? db.from("collection_progress").select("series_id,post_id,updated_at").eq("user_id", userId).in("series_id", ids) : Promise.resolve({ data: [] }),
    options.withProgress && userId ? db.from("collection_read_items").select("series_id,post_id").eq("user_id", userId).in("series_id", ids) : Promise.resolve({ data: [] }),
  ]);

  const chapters = new Map<string, number>();
  for (const row of (chapterRes.data || []) as { series_id: string }[]) chapters.set(row.series_id, (chapters.get(row.series_id) || 0) + 1);
  const follows = new Map<string, number>();
  for (const row of (followRes.data || []) as { series_id: string }[]) follows.set(row.series_id, (follows.get(row.series_id) || 0) + 1);
  const hot = new Map<string, number>();
  for (const row of (hotRes.data || []) as { entity_id: string; score_72h: number }[]) hot.set(row.entity_id, Number(row.score_72h));
  const profiles = new Map<string, { nickname: string; avatar_url: string | null }>();
  for (const row of (profileRes.data || []) as { id: string; nickname: string; avatar_url: string | null }[]) profiles.set(row.id, row);
  const categories = new Map<number, string>();
  for (const row of (categoryRes.data || []) as { id: number; name: string }[]) categories.set(Number(row.id), row.name);
  const progressRows = new Map<string, { post_id: string | null; updated_at: string }>();
  for (const row of (progressRes.data || []) as { series_id: string; post_id: string | null; updated_at: string }[]) progressRows.set(row.series_id, { post_id: row.post_id, updated_at: row.updated_at });
  const readBySeries = new Map<string, Set<string>>();
  for (const row of (readRes.data || []) as { series_id: string; post_id: string }[]) {
    const set = readBySeries.get(row.series_id) || new Set<string>();
    set.add(row.post_id);
    readBySeries.set(row.series_id, set);
  }

  return rows.map((row) => {
    const author = profiles.get(row.creator_id);
    const total = chapters.get(row.id) || 0;
    const read = Math.min(total, readBySeries.get(row.id)?.size || 0);
    const progressRow = progressRows.get(row.id);
    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      coverUrl: mediaUrl(row.cover_url),
      kind: row.kind,
      channel: row.channel,
      categoryId: row.category_id,
      categoryName: row.category_id ? categories.get(Number(row.category_id)) || null : null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.content_updated_at,
      author: author ? { id: row.creator_id, nickname: author.nickname, avatarUrl: author.avatar_url } : null,
      chapters: total,
      followCount: follows.get(row.id) || 0,
      hot: hot.get(row.id) || 0,
      progress: options.withProgress && userId
        ? { read, total, percent: total ? Math.round((read / total) * 100) : 0, lastPostId: progressRow?.post_id || null, updatedAt: progressRow?.updated_at || null }
        : undefined,
    };
  });
}

/** 公开合集基础查询：只返回已上架合集，权限过滤永远在数据层完成。 */
export async function querySeries(
  db: SupabaseClient,
  options: {
    ids?: string[];
    categoryId?: number | null;
    channel?: string | null;
    sort?: "recommended" | "hot" | "updated" | "new" | "follows";
    limit?: number;
    offset?: number;
    creatorId?: string;
  },
) {
  const limit = Math.max(1, Math.min(60, options.limit || 24));
  const offset = Math.max(0, options.offset || 0);
  let query = db.from("post_series").select(SERIES_FIELDS, { count: "exact" })
    .eq("review_status", "approved").eq("is_public", true);
  if (options.ids) query = query.in("id", options.ids);
  if (options.creatorId) query = query.eq("creator_id", options.creatorId);
  if (options.categoryId) query = query.eq("category_id", options.categoryId);
  // 合集的 channel 默认是 community，AI 合集按「内部作品属于 AI 频道的占比」判定，
  // 因此这里不能直接按 post_series.channel 过滤，否则永远查不到 AI 合集。
  if (options.channel && options.channel !== "ai") query = query.eq("channel", options.channel);

  if (options.sort === "new") {
    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (data || []) as unknown as SeriesRow[], total: count || 0 };
  }

  // 需要互动统计的排序无法在单表 SQL 内完成：先取候选集，再在服务层排序分页。
  query = query.order("content_updated_at", { ascending: false }).range(0, 299);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  let rows = (data || []) as unknown as SeriesRow[];
  if (options.channel === "ai") rows = await filterAiSeries(db, rows);
  return { rows, total: options.channel === "ai" ? rows.length : (count || rows.length) };
}

/** 保留「显式标记为 AI 频道」或「过半数作品属于 AI 频道」的合集。 */
async function filterAiSeries(db: SupabaseClient, rows: SeriesRow[]) {
  if (!rows.length) return rows;
  const { data } = await db.from("posts").select("series_id,channel")
    .in("series_id", rows.map((row) => row.id)).eq("status", "published");
  const stats = new Map<string, { ai: number; total: number }>();
  for (const row of (data || []) as { series_id: string; channel: string }[]) {
    const entry = stats.get(row.series_id) || { ai: 0, total: 0 };
    entry.total += 1;
    if (row.channel === "ai") entry.ai += 1;
    stats.set(row.series_id, entry);
  }
  return rows.filter((row) => {
    if (row.channel === "ai") return true;
    const entry = stats.get(row.id);
    if (!entry || !entry.total) return false;
    return entry.ai * 2 >= entry.total;
  });
}


export const seriesCategoryList = async (db: SupabaseClient) => {
  const { data } = await db.from("post_series")
    .select("category_id").eq("review_status", "approved").eq("is_public", true).not("category_id", "is", null);
  const counts = new Map<number, number>();
  for (const row of (data || []) as { category_id: number }[]) counts.set(Number(row.category_id), (counts.get(Number(row.category_id)) || 0) + 1);
  if (!counts.size) return [];
  const { data: tags } = await db.from("interest_tags").select("id,name").in("id", [...counts.keys()]).order("sort_order", { ascending: true });
  return ((tags || []) as { id: number; name: string }[]).map((tag) => ({ id: Number(tag.id), name: tag.name, count: counts.get(Number(tag.id)) || 0 }));
};

export { one as firstRow };
