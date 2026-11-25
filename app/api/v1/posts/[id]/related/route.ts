import { NextRequest } from "next/server";
import { context, respond, uuid } from "@/lib/server/api";

export const dynamic = "force-dynamic";

type Row = {
  id: string; title: string; image_url: string | null; channel: string; content_type: string;
  tag_id: number; author_id: string | null; series_id: string | null; created_at: string;
  profiles?: { nickname: string } | { nickname: string }[] | null;
  interest_tags?: { name: string } | { name: string }[] | null;
  post_media?: { storage_path: string }[] | null;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? (value[0] || null) : (value || null);
const mediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
};

function card(row: Row) {
  const author = one(row.profiles);
  const tag = one(row.interest_tags);
  const media = (row.post_media || [])[0];
  return {
    id: row.id,
    title: row.title,
    cover: mediaUrl(row.image_url) || mediaUrl(media?.storage_path),
    channel: row.channel,
    contentType: row.content_type,
    tag: tag?.name || null,
    author: author?.nickname || null,
    date: String(row.created_at).slice(0, 10),
  };
}

const FIELDS = "id,title,image_url,channel,content_type,tag_id,author_id,series_id,created_at,profiles!posts_author_id_fkey(nickname),interest_tags!posts_tag_id_fkey(name),post_media(storage_path)";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db } = await context(req, false);
    const id = uuid((await params).id);
    const { data } = await db.from("posts").select(`${FIELDS},body_excerpt`).eq("id", id).eq("status", "published").maybeSingle();
    if (!data) return { series: null, sameTag: [], authorPosts: [], aiResources: [], topics: [], position: null };
    const post = data as unknown as Row & { body_excerpt: string | null };

    let series: { id: string; title: string; chapters: number; position: number; prev: { id: string; title: string } | null; next: { id: string; title: string } | null } | null = null;
    if (post.series_id) {
      const [{ data: seriesRow }, { data: chapterRows }] = await Promise.all([
        db.from("post_series").select("id,title,is_public,review_status").eq("id", post.series_id).maybeSingle(),
        db.from("posts").select("id,title,series_order,created_at").eq("series_id", post.series_id).eq("status", "published")
          .order("series_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
      ]);
      const visible = seriesRow && (seriesRow as { review_status: string }).review_status === "approved";
      if (visible) {
        const chapters = (chapterRows || []) as { id: string; title: string }[];
        const index = chapters.findIndex((chapter) => chapter.id === id);
        series = {
          id: (seriesRow as { id: string }).id,
          title: (seriesRow as { title: string }).title,
          chapters: chapters.length,
          position: index + 1,
          prev: index > 0 ? chapters[index - 1] : null,
          next: index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null,
        };
      }
    }

    const topicIds: number[] = [];
    const { data: topicRows } = await db.from("post_topics").select("topic_id,interest_tags(name)").eq("post_id", id);
    for (const row of (topicRows || []) as { topic_id: number; interest_tags: { name: string } | { name: string }[] | null }[]) topicIds.push(Number(row.topic_id));

    const [sameTagRes, authorRes, aiRes] = await Promise.all([
      db.from("posts").select(FIELDS).eq("status", "published").eq("tag_id", post.tag_id).neq("id", id).order("created_at", { ascending: false }).limit(6),
      post.author_id
        ? db.from("posts").select(FIELDS).eq("status", "published").eq("author_id", post.author_id).neq("id", id).order("created_at", { ascending: false }).limit(4)
        : Promise.resolve({ data: [] }),
      db.from("posts").select(FIELDS).eq("status", "published").eq("channel", "ai").neq("id", id).neq("tag_id", post.tag_id).order("created_at", { ascending: false }).limit(5),
    ]);

    const topics = topicIds.length
      ? await db.from("interest_tags").select("id,name").in("id", topicIds)
      : { data: [] };

    return {
      series,
      sameTag: ((sameTagRes.data || []) as unknown as Row[]).map(card),
      authorPosts: ((authorRes.data || []) as unknown as Row[]).map(card),
      aiResources: ((aiRes.data || []) as unknown as Row[]).filter((row) => row.channel === "ai").map(card).slice(0, 4),
      topics: ((topics.data || []) as { id: number; name: string }[]).map((row) => ({ id: Number(row.id), name: row.name })),
      position: series ? { current: series.position, total: series.chapters } : null,
    };
  });
}
