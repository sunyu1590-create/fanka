import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";
import { topicDescriptions } from "@/lib/topics";

type TopicRow = { id: number; name: string };
type TopicStats = { topic_id: number; post_count: number | string; participant_count: number | string };

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const query = (req.nextUrl.searchParams.get("q") || "").trim().toLocaleLowerCase("zh-CN");
    const [topics, stats] = await Promise.all([
      db.from("interest_tags").select("id,name").eq("active", true).order("id"),
      db.rpc("get_topic_stats"),
    ]);
    dbError(topics.error);
    dbError(stats.error);
    const counts = new Map((stats.data as TopicStats[]).map((item) => [Number(item.topic_id), item]));
    return (topics.data as TopicRow[])
      .filter((topic) => !query || topic.name.toLocaleLowerCase("zh-CN").includes(query))
      .map((topic) => {
        const count = counts.get(topic.id);
        return {
          id: topic.id,
          name: topic.name,
          description: topicDescriptions[topic.name] || "围绕这个话题，发现新的内容与观察。",
          postCount: Number(count?.post_count || 0),
          participantCount: Number(count?.participant_count || 0),
        };
      });
  });
}
