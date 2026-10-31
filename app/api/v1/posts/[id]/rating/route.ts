import { NextRequest } from "next/server";
import {
  ApiError,
  context,
  dbError,
  jsonBody,
  respond,
} from "@/lib/server/api";

type Params = { params: Promise<{ id: string }> };

async function findPost(db: Awaited<ReturnType<typeof context>>["db"], rawId: string) {
  const clientId = Number(rawId);
  if (!Number.isSafeInteger(clientId) || clientId < 1)
    throw new ApiError(400, "内容编号无效");
  const { data, error } = await db
    .from("posts")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "published")
    .single();
  dbError(error);
  return data!;
}

export async function GET(req: NextRequest, { params }: Params) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const post = await findPost(db, (await params).id);
    const [stats, ownRating] = await Promise.all([
      db
        .from("post_rating_stats")
        .select("rating_count,rating_sum")
        .eq("post_id", post.id)
        .maybeSingle(),
      user
        ? db
            .from("user_interactions")
            .select("rating")
            .eq("post_id", post.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    dbError(stats.error);
    dbError(ownRating.error);
    const count = stats.data?.rating_count || 0;
    return {
      average: count ? Number((stats.data!.rating_sum / count).toFixed(1)) : 0,
      count,
      myRating: ownRating.data?.rating || null,
    };
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new ApiError(400, "评分需要为 1 至 5 星");
    const post = await findPost(db, (await params).id);
    const { error } = await db
      .from("user_interactions")
      .upsert(
        { user_id: user!.id, post_id: post.id, rating },
        { onConflict: "user_id,post_id" },
      );
    dbError(error);
    const { data, error: statsError } = await db
      .from("post_rating_stats")
      .select("rating_count,rating_sum")
      .eq("post_id", post.id)
      .single();
    dbError(statsError);
    if (!data) throw new ApiError(500, "评分汇总暂不可用");
    return {
      average: Number((data.rating_sum / data.rating_count).toFixed(1)),
      count: data.rating_count,
      myRating: rating,
    };
  });
}
