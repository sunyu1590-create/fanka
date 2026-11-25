/** 轮播跳转目标搜索：作品与合集各一个入口，结果直接可点选。 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type BannerTarget = {
  id: string;
  type: "post" | "series";
  title: string;
  author: string | null;
  cover: string | null;
  meta: string;
};

const mediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
};

export async function searchBannerTargets(db: SupabaseClient, query: string, type: "post" | "series"): Promise<BannerTarget[]> {
  const keyword = query.slice(0, 40);
  const like = `%${keyword.replace(/[%_]/g, "")}%`;

  if (type === "series") {
    let builder = db.from("post_series")
      .select("id,title,description,cover_url,kind,creator_id")
      .eq("review_status", "approved").eq("is_public", true)
      .order("created_at", { ascending: false }).limit(12);
    if (keyword) builder = builder.ilike("title", like);
    const { data } = await builder;
    const rows = (data || []) as { id: string; title: string; description: string; cover_url: string | null; kind: string; creator_id: string }[];
    if (!rows.length) return [];
    const { data: profiles } = await db.from("profiles").select("id,nickname").in("id", [...new Set(rows.map((row) => row.creator_id))]);
    const names = new Map(((profiles || []) as { id: string; nickname: string }[]).map((row) => [row.id, row.nickname]));
    const { data: counts } = await db.from("posts").select("series_id").in("series_id", rows.map((row) => row.id)).eq("status", "published");
    const chapterCount = new Map<string, number>();
    for (const row of (counts || []) as { series_id: string }[]) chapterCount.set(row.series_id, (chapterCount.get(row.series_id) || 0) + 1);
    return rows.map((row) => ({
      id: row.id,
      type: "series" as const,
      title: row.title,
      author: names.get(row.creator_id) || null,
      cover: mediaUrl(row.cover_url),
      meta: `合集 · ${chapterCount.get(row.id) || 0} 篇`,
    }));
  }

  let builder = db.from("posts")
    .select("id,title,author_id,channel,images,cover_url")
    .eq("status", "published")
    .order("created_at", { ascending: false }).limit(12);
  if (keyword) builder = builder.ilike("title", like);
  const { data } = await builder;
  const rows = (data || []) as { id: string; title: string; author_id: string; channel: string; images: unknown; cover_url: string | null }[];
  if (!rows.length) return [];
  const { data: profiles } = await db.from("profiles").select("id,nickname").in("id", [...new Set(rows.map((row) => row.author_id))]);
  const names = new Map(((profiles || []) as { id: string; nickname: string }[]).map((row) => [row.id, row.nickname]));
  return rows.map((row) => {
    const images = Array.isArray(row.images) ? (row.images as unknown[]).filter((item): item is string => typeof item === "string") : [];
    return {
      id: row.id,
      type: "post" as const,
      title: row.title,
      author: names.get(row.author_id) || null,
      cover: mediaUrl(row.cover_url || images[0]),
      meta: row.channel === "ai" ? "AI 作品" : "精选作品",
    };
  });
}
