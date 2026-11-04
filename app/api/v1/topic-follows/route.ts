import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data, error } = await db.from("topic_follows").select("topic_id,created_at,interest_tags(name)").eq("user_id", user!.id).order("created_at", { ascending: false });
    dbError(error);
    return { items: data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const topicId = Number(body.topicId);
    if (!Number.isSafeInteger(topicId) || topicId < 1 || typeof body.follow !== "boolean") throw new ApiError(400, "话题关注操作无效");
    if (body.follow) {
      const topic = await db.from("interest_tags").select("id").eq("id", topicId).eq("active", true).maybeSingle();
      dbError(topic.error);
      if (!topic.data) throw new ApiError(404, "话题不存在");
      const { error } = await db.from("topic_follows").upsert({ user_id: user!.id, topic_id: topicId }, { onConflict: "user_id,topic_id", ignoreDuplicates: true });
      dbError(error);
    } else {
      const { error } = await db.from("topic_follows").delete().eq("user_id", user!.id).eq("topic_id", topicId);
      dbError(error);
    }
    return { following: body.follow };
  });
}
