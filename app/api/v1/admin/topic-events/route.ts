import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

async function requireAdmin(req: NextRequest) {
  const { db, user } = await context(req);
  const { data: profile, error } = await db.from("profiles").select("role").eq("id", user!.id).single();
  dbError(error);
  if (profile?.role !== "admin") throw new ApiError(403, "需要管理员权限");
  return { db, user: user! };
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const [events, topics] = await Promise.all([
      db.from("topic_events").select("id,topic_id,title,description,starts_at,ends_at,is_active,interest_tags(name)").order("starts_at", { ascending: false }),
      db.from("interest_tags").select("id,name").eq("active", true).order("name"),
    ]);
    dbError(events.error); dbError(topics.error);
    return { items: events.data || [], topics: topics.data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const id = body.id ? uuid(body.id, "活动") : null;
    const topicName = typeof body.topic === "string" ? body.topic.trim().replace(/^#+/, "").slice(0, 40) : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
    const startsAt = typeof body.starts_at === "string" ? new Date(body.starts_at) : new Date(NaN);
    const endsAt = typeof body.ends_at === "string" ? new Date(body.ends_at) : new Date(NaN);
    if (!topicName || title.length < 4 || description.length < 8) throw new ApiError(400, "请填写话题、至少 4 字的标题和至少 8 字的活动说明");
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) throw new ApiError(400, "活动时间无效，结束时间需要晚于开始时间");
    if (typeof body.is_active !== "boolean") throw new ApiError(400, "活动上下线状态无效");
    const { data: topic, error: topicError } = await db.from("interest_tags").select("id").eq("name", topicName).eq("active", true).maybeSingle();
    dbError(topicError);
    if (!topic) throw new ApiError(400, "请选择一个有效话题");
    const values = { topic_id: topic.id, title, description, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), is_active: body.is_active };
    const result = id
      ? await db.from("topic_events").update(values).eq("id", id).select("id,topic_id,title,description,starts_at,ends_at,is_active").single()
      : await db.from("topic_events").insert({ ...values, created_by: user.id }).select("id,topic_id,title,description,starts_at,ends_at,is_active").single();
    dbError(result.error);
    return result.data;
  });
}
