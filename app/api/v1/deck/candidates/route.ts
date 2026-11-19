import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";
import { rankBalancedDailyCandidates } from "@/lib/daily";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const response = await respond(async () => {
    const { db, user } = await context(req, false);
    const [postsResult, interestsResult, interactionsResult, profileResult] = await Promise.all([
      db.from("posts")
        .select("id,client_id,channel,created_at,featured_at,view_count,interest_tags!posts_tag_id_fkey(name)")
        .eq("status", "published")
        .in("channel", ["community", "ai"])
        .order("created_at", { ascending: false })
        .limit(1000),
      user
        ? db.from("user_interests").select("interest_tags(name)").eq("user_id", user.id)
        : Promise.resolve({ data: [], error: null }),
      user
        ? db.from("user_interactions").select("post_id,opened_at,viewed_at,skipped_at").eq("user_id", user.id)
            .or(`opened_at.gte.${new Date(Date.now() - 21 * 86_400_000).toISOString()},viewed_at.gte.${new Date(Date.now() - 21 * 86_400_000).toISOString()},skipped_at.gte.${new Date(Date.now() - 21 * 86_400_000).toISOString()}`)
            .limit(5000)
        : Promise.resolve({ data: [], error: null }),
      user ? db.from("profiles").select("timezone").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    dbError(postsResult.error);
    dbError(interestsResult.error);
    dbError(interactionsResult.error);
    dbError(profileResult.error);

    const posts = (postsResult.data || []) as unknown as Array<{
      id: string;
      client_id: number;
      channel: "community" | "ai";
      created_at: string;
      featured_at: string | null;
      view_count: number | null;
      interest_tags: { name: string } | { name: string }[] | null;
    }>;
    if (!posts.length) return [];
    const { data: ratings, error: ratingError } = await db.from("post_rating_stats")
      .select("post_id,rating_count,rating_sum")
      .in("post_id", posts.map((post) => post.id));
    dbError(ratingError);
    const ratingsById = new Map((ratings || []).map((row) => [row.post_id, row]));
    const interestRows = (interestsResult.data || []) as unknown as Array<{ interest_tags: { name: string } | { name: string }[] | null }>;
    const interestNames = interestRows.flatMap((row) => {
      const topic = row.interest_tags;
      const value = Array.isArray(topic) ? topic[0]?.name : topic?.name;
      return typeof value === "string" ? [value] : [];
    });
    const clientIdByPostId = new Map(posts.map((post) => [post.id, Number(post.client_id)]));
    const recentIds = (interactionsResult.data || []).flatMap((row) => {
      const clientId = clientIdByPostId.get(row.post_id);
      return clientId ? [clientId] : [];
    });
    const timezone = profileResult.data?.timezone || "Asia/Shanghai";
    let seed = "";
    try {
      seed = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
    } catch {
      seed = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
    }
    const ids = rankBalancedDailyCandidates(posts.map((post) => {
      const rating = ratingsById.get(post.id);
      const count = Number(rating?.rating_count || 0);
      return {
        id: Number(post.client_id),
        channel: post.channel === "ai" ? "ai" as const : "community" as const,
        tag: Array.isArray(post.interest_tags) ? post.interest_tags[0]?.name : post.interest_tags?.name,
        createdAt: post.created_at,
        featuredAt: post.featured_at,
        viewCount: Number(post.view_count || 0),
        ratingAverage: count ? Number(rating!.rating_sum || 0) / count : 0,
        ratingCount: count,
      };
    }), interestNames, recentIds.filter(Number.isSafeInteger), 50, seed);
    return ids.map((id) => ({ id }));
  });
  if (response.ok) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
