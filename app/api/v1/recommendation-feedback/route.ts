import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data, error } = await db.from("user_recommendation_filters").select("id,filter_type,target_author_id,target_topic_id,created_at,profiles!user_recommendation_filters_target_author_id_fkey(nickname),interest_tags!user_recommendation_filters_target_topic_id_fkey(name)").eq("user_id", user!.id).order("created_at", { ascending: false });
    dbError(error);
    return { items: data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    if (body.action === "mute_author") {
      const authorId = uuid(body.authorId, "作者");
      if (authorId === user!.id) throw new ApiError(400, "不能屏蔽自己的内容");
      const { error } = await db.from("user_recommendation_filters").insert({ user_id: user!.id, filter_type: "author", target_author_id: authorId, target_topic_id: null });
      if (error?.code !== "23505") dbError(error);
      return { saved: true, filter: "author" };
    }
    if (body.action === "mute_topic") {
      const name = typeof body.topic === "string" ? body.topic.trim().replace(/^#+/, "").slice(0, 32) : "";
      if (!name) throw new ApiError(400, "话题无效");
      const topic = await db.from("interest_tags").select("id").eq("name", name).eq("active", true).maybeSingle();
      dbError(topic.error);
      if (!topic.data) throw new ApiError(404, "话题不存在");
      const { error } = await db.from("user_recommendation_filters").insert({ user_id: user!.id, filter_type: "topic", target_author_id: null, target_topic_id: topic.data.id });
      if (error?.code !== "23505") dbError(error);
      return { saved: true, filter: "topic" };
    }
    throw new ApiError(400, "推荐反馈无效");
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const id = uuid(req.nextUrl.searchParams.get("id"), "推荐设置");
    const { data, error } = await db.from("user_recommendation_filters").delete().eq("id", id).eq("user_id", user!.id).select("id").maybeSingle();
    dbError(error);
    return { deleted: Boolean(data) };
  });
}
