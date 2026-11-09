import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { topicDescriptions } from "@/lib/topics";

type TopicRow = { id: number; name: string };
type TopicStats = { topic_id: number; post_count: number | string; participant_count: number | string };

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const query = (req.nextUrl.searchParams.get("q") || "").trim().toLocaleLowerCase("zh-CN");
    const [topics, stats] = await Promise.all([
      db.from("interest_tags").select("id,name").eq("channel", "community").eq("active", true).is("merged_into_id", null).order("sort_order").order("id"),
      db.rpc("get_topic_stats"),
    ]);
    dbError(topics.error);
    dbError(stats.error);
    const counts = new Map((stats.data as TopicStats[]).map((item) => [Number(item.topic_id), item]));
    const results = (topics.data as TopicRow[])
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
    if (req.nextUrl.searchParams.get("featured") === "1") {
      return results.sort((a, b) => b.postCount - a.postCount || b.participantCount - a.participantCount || a.id - b.id).slice(0, 6);
    }
    return results;
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const name = textField(body.name, "话题名称", 2, 24).replace(/^#+/, "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 24 || !/^[\p{L}\p{N} _-]+$/u.test(name)) {
      throw new ApiError(400, "话题请使用 2–24 个中英文、数字、空格、下划线或短横线");
    }
    const { data, error } = await db.rpc("create_custom_topic", { p_name: name });
    dbError(error);
    const topic = Array.isArray(data) ? data[0] : data;
    const topicId = topic?.topic_id ?? topic?.id;
    const topicName = topic?.topic_name ?? topic?.name;
    if (!topicId || !topicName) throw new ApiError(400, "话题未能创建，请换一个名称");
    return {
      id: Number(topicId),
      name: topicName,
      description: topicDescriptions[topicName] || "围绕这个话题，发现新的内容与观察。",
      postCount: 0,
      participantCount: 0,
      createdBy: user!.id,
    };
  });
}
