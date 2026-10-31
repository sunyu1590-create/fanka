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
  interest_tags: { name: string } | null;
  profiles: { nickname: string } | null;
  post_media?: { storage_path: string; sort_order: number }[];
};
export const libraryFields =
  "id,client_id,title,body,cover_text,image_url,author_id,created_at,is_demo,interest_tags(name),profiles!posts_author_id_fkey(nickname),post_media(storage_path,sort_order)";
export function present(row: LibraryRow) {
  const images = [
    ...(row.image_url ? [row.image_url] : []),
    ...(row.post_media || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((media) => `/api/v1/media?path=${encodeURIComponent(media.storage_path)}&redirect=1`),
  ];
  return {
    id: Number(row.client_id),
    cloudId: row.id,
    tag: row.interest_tags?.name || "生活",
    title: row.title,
    body: row.body,
    cover: row.cover_text || row.title.slice(0, 12),
    image: row.image_url || undefined,
    images: images.length ? images : undefined,
    author: row.profiles?.nickname || "黑卡编辑部",
    authorId: row.author_id || undefined,
    date: row.created_at.slice(0, 10),
    isDemo: row.is_demo,
  };
}
