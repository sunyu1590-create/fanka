import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { attachAuthorBadges, libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: Params) {
  return respond(async () => {
    const { db } = await context(req, false);
    const id = (await params).id;
    if (!UUID.test(id)) throw new ApiError(400, "用户编号无效");
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id,nickname,bio,avatar_url,cover_url,cover_meta,show_bookmarks")
      .eq("id", id)
      .maybeSingle();
    dbError(profileError);
    if (!profile) throw new ApiError(404, "用户不存在");

    const [details, posts, bookmarks, likes, badges] = await Promise.all([
      db.from("profile_attributes").select("attribute,value,is_public").eq("user_id", id).eq("is_public", true),
      db.from("posts").select(libraryFields).eq("author_id", id).eq("status", "published").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30),
      profile.show_bookmarks
        ? db.from("bookmarks").select("post_id,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [], error: null }),
      // 点赞与收藏共用「公开收藏」这一个开关。这里用服务端读取而不是直连表，
      // 是为了只暴露 post_id / liked_at，不把评分、浏览等私有字段带给访客。
      profile.show_bookmarks
        ? db.from("user_interactions").select("post_id,liked_at").eq("user_id", id).eq("liked", true).order("liked_at", { ascending: false, nullsFirst: false }).limit(30)
        : Promise.resolve({ data: [], error: null }),
      db.from("user_badge_awards").select("granted_at,profile_badge_types!inner(id,label,description,color)").eq("user_id", id).is("revoked_at", null).eq("profile_badge_types.active", true).order("granted_at", { ascending: false }),
    ]);
    dbError(details.error); dbError(posts.error); dbError(bookmarks.error); dbError(badges.error); dbError(likes.error);
    const bookmarkIds = (bookmarks.data || []).map((row) => row.post_id);
    const likeIds = (likes.data || []).map((row) => row.post_id);
    const [savedPosts, likedPosts] = await Promise.all([
      bookmarkIds.length
        ? db.from("posts").select(libraryFields).in("id", bookmarkIds).eq("status", "published")
        : Promise.resolve({ data: [], error: null }),
      likeIds.length
        ? db.from("posts").select(libraryFields).in("id", likeIds).eq("status", "published")
        : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(savedPosts.error); dbError(likedPosts.error);
    const published = (posts.data || []) as unknown as LibraryRow[];
    const saved = (savedPosts.data || []) as unknown as LibraryRow[];
    const liked = (likedPosts.data || []) as unknown as LibraryRow[];
    const [publishedItems, savedItems, likedItems] = await Promise.all([
      attachAuthorBadges(db, await presentMany(db, published)),
      attachAuthorBadges(db, await presentMany(db, saved)),
      attachAuthorBadges(db, await presentMany(db, liked)),
    ]);
    const byId = new Map(savedItems.map((item) => [item.cloudId, item]));
    const orderedBookmarks = bookmarkIds.flatMap((postId) => byId.has(postId) ? [byId.get(postId)!] : []);
    const likedById = new Map(likedItems.map((item) => [item.cloudId, item]));
    const likedAt = new Map((likes.data || []).map((row) => [row.post_id, row.liked_at || null]));
    const orderedLikes = likeIds.flatMap((postId) => likedById.has(postId)
      ? [{ ...likedById.get(postId)!, likedAt: likedAt.get(postId) || null }]
      : []);
    return {
      profile,
      badges: (badges.data || []).map((row) => ({ ...row.profile_badge_types, awardedAt: row.granted_at })),
      details: details.data || [],
      posts: publishedItems,
      bookmarks: profile.show_bookmarks ? orderedBookmarks : [],
      likes: profile.show_bookmarks ? orderedLikes : [],
    };
  });
}
