import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const creatorId = req.nextUrl.searchParams.get("creator");
    if (creatorId) {
      uuid(creatorId, "创作者");
      const [count, following] = await Promise.all([
        db.from("creator_follows").select("follower_id", { count: "exact", head: true }).eq("creator_id", creatorId),
        user ? db.from("creator_follows").select("follower_id").eq("creator_id", creatorId).eq("follower_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      dbError(count.error); dbError(following.error);
      return { followerCount: count.count || 0, following: Boolean(following.data) };
    }
    if (!user) return { creators: [] };
    const { data, error } = await db.from("creator_follows").select("creator_id,profiles!creator_follows_creator_id_fkey(nickname,avatar_url,bio)").eq("follower_id", user.id).order("created_at", { ascending: false });
    dbError(error);
    return { creators: data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const creatorId = uuid(body.creatorId, "创作者");
    if (creatorId === user!.id) throw new ApiError(400, "不能关注自己");
    const { data: existing, error: readError } = await db.from("creator_follows").select("follower_id").eq("follower_id", user!.id).eq("creator_id", creatorId).maybeSingle();
    dbError(readError);
    if (existing) {
      const { error } = await db.from("creator_follows").delete().eq("follower_id", user!.id).eq("creator_id", creatorId);
      dbError(error);
    } else {
      const { error } = await db.from("creator_follows").insert({ follower_id: user!.id, creator_id: creatorId });
      dbError(error);
    }
    const { count, error } = await db.from("creator_follows").select("follower_id", { count: "exact", head: true }).eq("creator_id", creatorId);
    dbError(error);
    return { following: !existing, followerCount: count || 0 };
  });
}
