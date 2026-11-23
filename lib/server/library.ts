import type { SupabaseClient } from "@supabase/supabase-js";
import { signPostMedia } from "./media";

const isVideoMediaPath = (path: string) => /\.(?:mp4|webm)$/i.test(path);
const mediaRoute = (path: string) => `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
const mediaVariantPath = (path: string, width: 480 | 960) => {
  const match = path.match(/^(.*\/)([^/]+)\.(?:jpg|png|webp)$/i);
  return match ? `${match[1]}${match[2]}-${width}.webp` : null;
};

type PostMediaRow = {
  storage_path: string;
  thumbnail_path?: string | null;
  retina_thumbnail_path?: string | null;
  /** 原图像素尺寸：详情页据此预留占位高度，图片到达前后不产生布局位移。 */
  width?: number | null;
  height?: number | null;
  sort_order: number;
};

export type LibraryRow = {
  id: string;
  client_id: number;
  title: string;
  body?: string;
  body_excerpt?: string | null;
  channel?: "community" | "ai";
  content_type?: "community_post" | "knowledge_article" | "agent" | "skill" | "prompt" | "ai_tool" | "tutorial";
  resource_data?: Record<string, unknown>;
  usage_scenarios?: string[];
  featured_at?: string | null;
  view_count?: number;
  cover_text: string | null;
  image_url: string | null;
  author_id: string | null;
  series_id?: string | null;
  post_series?: { title: string } | null;
  created_at: string;
  is_demo: boolean;
  status?: "draft" | "pending_review" | "published" | "hidden";
  interest_tags: { name: string } | null;
  profiles: { nickname: string; avatar_url?: string | null; bio?: string | null } | null;
  post_media?: PostMediaRow[];
  post_like_stats?: { like_count?: number } | { like_count?: number }[] | null;
  post_topics?: { interest_tags: { name: string } | null }[];
};

export const libraryFields =
  "id,client_id,title,body,channel,content_type,resource_data,usage_scenarios,featured_at,view_count,cover_text,image_url,author_id,series_id,post_series(title),created_at,is_demo,status,interest_tags!posts_tag_id_fkey(name),profiles!posts_author_id_fkey(nickname,avatar_url,bio),post_media(storage_path,thumbnail_path,retina_thumbnail_path,width,height,sort_order),post_topics(interest_tags!post_topics_topic_id_fkey(name)),post_like_stats(like_count)";
export const libraryFeedFields =
  "id,client_id,title,body_excerpt,channel,content_type,resource_data,usage_scenarios,featured_at,view_count,cover_text,image_url,author_id,series_id,post_series(title),created_at,is_demo,status,interest_tags!posts_tag_id_fkey(name),profiles!posts_author_id_fkey(nickname,avatar_url,bio),post_media(storage_path,thumbnail_path,retina_thumbnail_path,width,height,sort_order),post_topics(interest_tags!post_topics_topic_id_fkey(name)),post_like_stats(like_count)";

export function present(row: LibraryRow, mediaUrls?: Map<string, string>, partial = false) {
  const media = (row.post_media || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const imagesOnly = media.filter((item) => !isVideoMediaPath(item.storage_path));
  const videosOnly = media.filter((item) => isVideoMediaPath(item.storage_path));
  const thumbnailPath = (item: PostMediaRow) => item.thumbnail_path || mediaVariantPath(item.storage_path, 480);
  const retinaPath = (item: PostMediaRow) => item.retina_thumbnail_path || mediaVariantPath(item.storage_path, 960);
  const originalUrl = (item: PostMediaRow) => mediaUrls?.get(item.storage_path) || mediaRoute(item.storage_path);
  const thumbnailUrl = (item: PostMediaRow) => {
    const path = thumbnailPath(item);
    return path ? mediaUrls?.get(path) : undefined;
  };
  const retinaUrl = (item: PostMediaRow) => {
    const path = retinaPath(item);
    return path ? mediaUrls?.get(path) : undefined;
  };
  const imageUrl = (item: PostMediaRow) => {
    if (partial) return thumbnailUrl(item) || mediaRoute(item.storage_path);
    return originalUrl(item);
  };
  const images = [
    ...(row.image_url ? [row.image_url] : []),
    ...imagesOnly.map(imageUrl),
  ];
  const thumbnailImages = [
    ...(row.image_url ? [row.image_url] : []),
    ...imagesOnly.map((item) => thumbnailUrl(item) || originalUrl(item)),
  ];
  const retinaImages = [
    ...(row.image_url ? [undefined] : []),
    ...imagesOnly.map(retinaUrl),
  ];
  const videos = videosOnly.map((item) => mediaUrls?.get(item.storage_path) || mediaRoute(item.storage_path));
  // 与 images 一一对应的像素尺寸。老数据（直接存绝对地址的 image_url）没有尺寸，
  // 用 null 占位，前端据此退回统一比例而不是猜一个错误的宽高比。
  const imageSizes = [
    ...(row.image_url ? [null] : []),
    ...imagesOnly.map((item) => item.width && item.height ? { width: Number(item.width), height: Number(item.height) } : null),
  ];
  const firstImage = imagesOnly[0];
  const image = row.image_url || (firstImage ? imageUrl(firstImage) : undefined);
  const imageRetina = !row.image_url && firstImage ? retinaUrl(firstImage) : undefined;
  return {
    id: Number(row.client_id),
    cloudId: row.id,
    tag: row.interest_tags?.name || "生活",
    topics: (row.post_topics || []).flatMap((item) => item.interest_tags?.name ? [item.interest_tags.name] : []),
    title: row.title,
    body: row.body ?? row.body_excerpt ?? "",
    channel: row.channel || "community",
    contentType: row.content_type || "community_post",
    resourceData: row.resource_data || {},
    usageScenarios: row.usage_scenarios || [],
    featuredAt: row.featured_at || null,
    viewCount: Number(row.view_count || 0),
    likeCount: Number(Array.isArray(row.post_like_stats) ? row.post_like_stats[0]?.like_count || 0 : row.post_like_stats?.like_count || 0),
    cover: row.cover_text || row.title.slice(0, 12),
    image,
    imageRetina,
    images: images.length ? images : undefined,
    thumbnailImages: thumbnailImages.length ? thumbnailImages : undefined,
    retinaImages: retinaImages.length ? retinaImages : undefined,
    imageSizes: imageSizes.some(Boolean) ? imageSizes : undefined,
    isPartial: partial,
    mediaResolved: !partial,
    video: videos[0],
    videos: videos.length ? videos : undefined,
    author: row.profiles?.nickname || "黑卡编辑部",
    authorId: row.author_id || undefined,
    authorAvatar: row.profiles?.avatar_url || undefined,
    authorBio: row.profiles?.bio || undefined,
    seriesId: row.series_id || undefined,
    seriesTitle: row.post_series?.title || undefined,
    date: row.created_at.slice(0, 10),
    isDemo: row.is_demo,
    status: row.status || "published",
  };
}

export async function presentMany(db: SupabaseClient, rows: LibraryRow[]) {
  const media = rows.flatMap((row) => row.post_media || []);
  const originalPaths = [...new Set(media.map((item) => item.storage_path))];
  const variantPaths = [...new Set(media.flatMap((item) => isVideoMediaPath(item.storage_path) ? [] : [
    item.thumbnail_path || mediaVariantPath(item.storage_path, 480),
    item.retina_thumbnail_path || mediaVariantPath(item.storage_path, 960),
  ].filter((path): path is string => Boolean(path))))];
  const [originals, variants] = await Promise.all([
    signPostMedia(db, originalPaths, 604800),
    signPostMedia(db, variantPaths, 604800),
  ]);
  // Media is optional content. A storage signing error must not turn an
  // otherwise readable post into a 500; `present` will emit the same
  // first-party media route used by the feed, which can retry signing per file.
  if (originals.error) return rows.map((row) => present(row));
  const urls = new Map([
    ...(originals.data || []),
    ...(variants.data || []),
  ].flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
  return rows.map((row) => present(row, urls));
}

export async function presentFeedMany(db: SupabaseClient, rows: LibraryRow[]) {
  const media = rows.flatMap((row) => row.post_media || []);
  const originalPaths = [...new Set(media.map((item) => item.storage_path))];
  const variantPaths = [...new Set(media.flatMap((item) => isVideoMediaPath(item.storage_path) ? [] : [
    item.thumbnail_path || mediaVariantPath(item.storage_path, 480),
    item.retina_thumbnail_path || mediaVariantPath(item.storage_path, 960),
  ].filter((path): path is string => Boolean(path))))];
  const [originals, variants] = await Promise.all([
    signPostMedia(db, originalPaths, 604800),
    signPostMedia(db, variantPaths, 604800),
  ]);
  const urls = new Map([
    ...(originals.data || []),
    ...(variants.data || []),
  ].flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
  return rows.map((row) => present(row, urls, true));
}

export type PresentedBadge = { id: string; label: string; description: string | null; color: string | null };

/** Attach only currently active, server-awarded identity marks to displayed authors. */
export async function attachAuthorBadges<T extends { authorId?: string }>(db: SupabaseClient, items: T[]) {
  const userIds = [...new Set(items.flatMap((item) => item.authorId ? [item.authorId] : []))];
  if (!userIds.length) return items.map((item) => ({ ...item, authorBadges: [] as PresentedBadge[] }));
  const { data, error } = await db.from("user_badge_awards")
    .select("user_id,granted_at,profile_badge_types!inner(id,label,description,color,active)")
    .in("user_id", userIds)
    .is("revoked_at", null)
    .eq("profile_badge_types.active", true)
    .order("granted_at", { ascending: true });
  // Certification display is optional metadata: an awards-table read issue
  // must not make otherwise public content disappear.
  const byUser = new Map<string, PresentedBadge[]>();
  if (!error) for (const row of data || []) {
    const raw = row.profile_badge_types;
    const badge = Array.isArray(raw) ? raw[0] : raw;
    if (!badge?.active) continue;
    const badges = byUser.get(row.user_id) || [];
    if (!badges.some((existing) => existing.id === badge.id)) {
      badges.push({ id: badge.id, label: badge.label, description: badge.description, color: badge.color });
      byUser.set(row.user_id, badges);
    }
  }
  return items.map((item) => ({ ...item, authorBadges: item.authorId ? byUser.get(item.authorId) || [] : [] }));
}
