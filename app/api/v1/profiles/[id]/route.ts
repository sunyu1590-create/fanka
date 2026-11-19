import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: Params) {
  return respond(async () => {
    const { db } = await context(req, false);
    const id = (await params).id;
    if (!UUID.test(id)) throw new ApiError(400, "用户编号无效");
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id,nickname,bio,avatar_url,show_bookmarks")
      .eq("id", id)
      .maybeSingle();
    dbError(profileError);
    if (!profile) throw new ApiError(404, "用户不存在");

    const [details, posts, bookmarks, badges] = await Promise.all([
      db.from("profile_attributes").select("attribute,value,is_public").eq("user_id", id).eq("is_public", true),
      db.from("posts").select(libraryFields).eq("author_id", id).eq("status", "published").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30),
      profile.show_bookmarks
        ? db.from("bookmarks").select("post_id,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [], error: null }),
      db.from("user_badge_awards").select("granted_at,profile_badge_types!inner(id,label,description,color)").eq("user_id", id).is("revoked_at", null).eq("profile_badge_types.active", true).order("granted_at", { ascending: false }),
    ]);
    dbError(details.error); dbError(posts.error); dbError(bookmarks.error); dbError(badges.error);
    const bookmarkIds = (bookmarks.data || []).map((row) => row.post_id);
    const savedPosts = bookmarkIds.length
      ? await db.from("posts").select(libraryFields).in("id", bookmarkIds).eq("status", "published")
      : { data: [], error: null };
    dbError(savedPosts.error);
    const published = (posts.data || []) as unknown as LibraryRow[];
    const saved = (savedPosts.data || []) as unknown as LibraryRow[];
    const [publishedItems, savedItems] = await Promise.all([
      presentMany(db, published),
      presentMany(db, saved),
    ]);
    const byId = new Map(savedItems.map((item) => [item.cloudId, item]));
    const orderedBookmarks = bookmarkIds.flatMap((postId) => byId.has(postId) ? [byId.get(postId)!] : []);
    return {
      profile,
      badges: (badges.data || []).map((row) => ({ ...row.profile_badge_types, awardedAt: row.granted_at })),
      details: details.data || [],
      posts: publishedItems,
      bookmarks: profile.show_bookmarks ? orderedBookmarks : [],
    };
  });
}
