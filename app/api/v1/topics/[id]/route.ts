import { NextRequest } from "next/server";
import { context, dbError, respond, ApiError } from "@/lib/server/api";
import { libraryFields, present, presentMany, type LibraryRow } from "@/lib/server/library";
import { topicDescriptions } from "@/lib/topics";

type TopicStats = { topic_id: number; post_count: number | string; participant_count: number | string };
type PostLink = { post_id: string };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db } = await context(req, false);
    const topicId = Number((await params).id);
    if (!Number.isSafeInteger(topicId) || topicId < 1) throw new ApiError(400, "话题无效");
    const page = Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(24, Number(req.nextUrl.searchParams.get("limit")) || 12));
    const [topic, statRows, links] = await Promise.all([
      db.from("interest_tags").select("id,name").eq("id", topicId).eq("active", true).maybeSingle(),
      db.rpc("get_topic_stats"),
      db.from("post_topics")
        .select("post_id,posts!inner(created_at,status)", { count: "exact" })
        .eq("topic_id", topicId)
        .eq("posts.status", "published")
        .order("created_at", { referencedTable: "posts", ascending: false })
        .order("post_id", { ascending: false })
        .range((page - 1) * limit, page * limit - 1),
    ]);
    dbError(topic.error);
    dbError(statRows.error);
    dbError(links.error);
    if (!topic.data) throw new ApiError(404, "话题不存在");
    const stat = (statRows.data as TopicStats[]).find((item) => Number(item.topic_id) === topicId);
    const ids = (links.data as unknown as PostLink[]).map((item) => item.post_id);
    let items: ReturnType<typeof present>[] = [];
    if (ids.length) {
      const posts = await db.from("posts").select(libraryFields).in("id", ids).eq("status", "published");
      dbError(posts.error);
      const byId = new Map((await presentMany(db, posts.data as unknown as LibraryRow[])).map((post) => [post.cloudId, post]));
      items = ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
    }
    return {
      topic: {
        id: topic.data.id,
        name: topic.data.name,
        description: topicDescriptions[topic.data.name] || "围绕这个话题，发现新的内容与观察。",
        postCount: Number(stat?.post_count || 0),
        participantCount: Number(stat?.participant_count || 0),
      },
      items,
      total: links.count || 0,
      page,
      limit,
    };
  });
}
