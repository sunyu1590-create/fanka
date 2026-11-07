export type NativePost = {
  id: number;
  cloudId: string;
  title: string;
  body: string;
  tag: string;
  topics: string[];
  image?: string;
  images: string[];
  author: string;
  authorId?: string;
  date: string;
  likeCount: number;
  viewCount: number;
  channel: "community" | "ai";
  contentType?: string;
  resourceData?: Record<string, unknown>;
  rarityTier?: string;
  isDemo: boolean;
  status?: string;
};

export function normalizePost(value: unknown): NativePost | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const cloudId = typeof row.cloudId === "string" ? row.cloudId : typeof row.id === "string" ? row.id : "";
  const clientId = Number(row.id ?? row.client_id);
  if (!cloudId || !Number.isSafeInteger(clientId)) return null;
  const images = Array.isArray(row.thumbnailImages) ? row.thumbnailImages.filter((image): image is string => typeof image === "string") : Array.isArray(row.images) ? row.images.filter((image): image is string => typeof image === "string") : [];
  const image = typeof row.image === "string" ? row.image : typeof row.image_url === "string" ? row.image_url : images[0];
  const date = typeof row.date === "string" ? row.date : typeof row.created_at === "string" ? row.created_at.slice(0, 10) : "";
  return {
    id: clientId,
    cloudId,
    title: typeof row.title === "string" && row.title.trim() ? row.title : "未命名内容",
    body: typeof row.body === "string" ? row.body : typeof row.body_excerpt === "string" ? row.body_excerpt : "",
    tag: typeof row.tag === "string" ? row.tag : "生活",
    topics: Array.isArray(row.topics) ? row.topics.filter((topic): topic is string => typeof topic === "string") : [],
    image,
    images,
    author: typeof row.author === "string" ? row.author : "黑卡探索者",
    authorId: typeof row.authorId === "string" ? row.authorId : undefined,
    date,
    likeCount: Math.max(0, Number(row.likeCount ?? row.like_count) || 0),
    viewCount: Math.max(0, Number(row.viewCount ?? row.view_count) || 0),
    channel: row.channel === "ai" ? "ai" : "community",
    contentType: typeof row.contentType === "string" ? row.contentType : typeof row.content_type === "string" ? row.content_type : undefined,
    resourceData: row.resourceData && typeof row.resourceData === "object" && !Array.isArray(row.resourceData) ? row.resourceData as Record<string, unknown> : row.resource_data && typeof row.resource_data === "object" && !Array.isArray(row.resource_data) ? row.resource_data as Record<string, unknown> : undefined,
    rarityTier: typeof row.rarityTier === "string" ? row.rarityTier : undefined,
    isDemo: Boolean(row.isDemo),
    status: typeof row.status === "string" ? row.status : undefined,
  };
}

export function normalizePosts(value: unknown): NativePost[] {
  return Array.isArray(value) ? value.map(normalizePost).filter((post): post is NativePost => Boolean(post)) : [];
}

export function mergePosts(current: NativePost[], incoming: NativePost[]) {
  const byId = new Map(current.map((post) => [post.cloudId, post]));
  for (const post of incoming) if (!byId.has(post.cloudId)) byId.set(post.cloudId, post);
  return [...byId.values()];
}

export function pairPosts(posts: NativePost[]) {
  const pairs: Array<{ key: string; left: NativePost; right?: NativePost }> = [];
  for (let index = 0; index < posts.length; index += 2) {
    const left = posts[index];
    const right = posts[index + 1];
    pairs.push({ key: `${left.cloudId}:${right?.cloudId || "end"}`, left, right });
  }
  return pairs;
}
