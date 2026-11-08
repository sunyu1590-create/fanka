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

function isSignedStorageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.includes("/storage/v1/object/sign/post-covers/") && url.searchParams.has("token");
  } catch {
    return false;
  }
}

function mediaSource(path: string) {
  return `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1&variant=card`;
}

export function present(row: LibraryRow) {
  const mediaImages = (row.post_media || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((media) => mediaSource(media.storage_path));
  // Signed Supabase URLs expire. The associated post_media path is the durable identity.
  const stableImageUrl = row.image_url && !isSignedStorageUrl(row.image_url)
    ? row.image_url
    : undefined;
  const images = [...new Set([...(stableImageUrl ? [stableImageUrl] : []), ...mediaImages])];
  return {
    id: Number(row.client_id),
    cloudId: row.id,
    tag: row.interest_tags?.name || "生活",
    topics: (row.post_topics || []).flatMap((item) => item.interest_tags?.name ? [item.interest_tags.name] : []),
    title: row.title,
    body: row.body,
    cover: row.cover_text || row.title.slice(0, 12),
    image: stableImageUrl || mediaImages[0],
    images: images.length ? images : undefined,
    author: row.profiles?.nickname || "黑卡编辑部",
    authorId: row.author_id || undefined,
    date: row.created_at.slice(0, 10),
    isDemo: row.is_demo,
    status: row.status || "published",
  };
}
