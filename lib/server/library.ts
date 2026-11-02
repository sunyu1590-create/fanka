import type { SupabaseClient } from "@supabase/supabase-js";

export type LibraryRow = {
  id: string;
  client_id: number;
  title: string;
  body: string;
  cover_text: string | null;
  image_url: string | null;
  author_id: string | null;
  created_at: string;
  is_demo: boolean;
  status?: "draft" | "pending_review" | "published" | "hidden";
  interest_tags: { name: string } | null;
  profiles: { nickname: string } | null;
  post_media?: { storage_path: string; sort_order: number }[];
  post_topics?: { interest_tags: { name: string } | null }[];
};
export const libraryFields =
  "id,client_id,title,body,cover_text,image_url,author_id,created_at,is_demo,status,interest_tags!posts_tag_id_fkey(name),profiles!posts_author_id_fkey(nickname),post_media(storage_path,sort_order),post_topics(interest_tags!post_topics_topic_id_fkey(name))";
export function present(row: LibraryRow, mediaUrls?: Map<string, string>) {
  const images = [
    ...(row.image_url ? [row.image_url] : []),
    ...(row.post_media || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((media) => mediaUrls?.get(media.storage_path) || `/api/v1/media?path=${encodeURIComponent(media.storage_path)}&redirect=1`),
  ];
  return {
    id: Number(row.client_id),
    cloudId: row.id,
    tag: row.interest_tags?.name || "生活",
    topics: (row.post_topics || []).flatMap((item) => item.interest_tags?.name ? [item.interest_tags.name] : []),
    title: row.title,
    body: row.body,
    cover: row.cover_text || row.title.slice(0, 12),
    image: row.image_url || images[0],
    images: images.length ? images : undefined,
    author: row.profiles?.nickname || "黑卡编辑部",
    authorId: row.author_id || undefined,
    date: row.created_at.slice(0, 10),
    isDemo: row.is_demo,
    status: row.status || "published",
  };
}
export async function presentMany(db: SupabaseClient, rows: LibraryRow[]) {
  const paths = [...new Set(rows.flatMap((row) => (row.post_media || []).map((media) => media.storage_path)))];
  const batches = Array.from({ length: Math.ceil(paths.length / 100) }, (_, index) => paths.slice(index * 100, (index + 1) * 100));
  const signed = await Promise.all(batches.map((batch) => db.storage.from("post-covers").createSignedUrls(batch, 3600)));
  if (signed.some((result) => result.error)) throw new Error("投稿图片加载失败");
  const urls = new Map(signed.flatMap((result) => (result.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  return rows.map((row) => present(row, urls));
}
