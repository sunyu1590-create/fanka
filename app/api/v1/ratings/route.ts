import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const values = (req.nextUrl.searchParams.get("ids") || "")
      .split(",")
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    const ids = [...new Set(values)].slice(0, 100);
    if (!ids.length) return {};

    const { db } = await context(req, false);
    const { data: posts, error: postError } = await db
      .from("posts")
      .select("id,client_id")
      .eq("status", "published")
      .in("client_id", ids);
    dbError(postError);
    if (!posts?.length) return {};

    const { data: stats, error: statsError } = await db
      .from("post_rating_stats")
      .select("post_id,rating_count,rating_sum")
      .in("post_id", posts.map((post) => post.id));
    dbError(statsError);
    const byPost = new Map(stats?.map((item) => [item.post_id, item]));
    return Object.fromEntries(
      posts.map((post) => {
        const stat = byPost.get(post.id);
        return [
          post.client_id,
          {
            average: stat ? Number((stat.rating_sum / stat.rating_count).toFixed(1)) : 0,
            count: stat?.rating_count || 0,
          },
        ];
      }),
    );
  });
}
