import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const seriesId = uuid((await params).id, "系列");
    const [{ data: series, error: seriesError }, { data: subscription, error }] = await Promise.all([
      db.from("post_series").select("id,title,description,creator_id").eq("id", seriesId).maybeSingle(),
      db.from("series_subscriptions").select("series_id").eq("user_id", user!.id).eq("series_id", seriesId).maybeSingle(),
    ]);
    dbError(seriesError); dbError(error);
    if (!series) throw new ApiError(404, "作品系列不存在");
    return { series, subscribed: Boolean(subscription) };
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const seriesId = uuid((await params).id, "系列");
    const body = await jsonBody(req);
    if (typeof body.subscribe !== "boolean") throw new ApiError(400, "订阅操作无效");
    const series = await db.from("post_series").select("id,creator_id").eq("id", seriesId).maybeSingle();
    dbError(series.error);
    if (!series.data) throw new ApiError(404, "作品系列不存在");
    if (series.data.creator_id === user!.id && body.subscribe) throw new ApiError(400, "不能订阅自己的系列");
    if (body.subscribe) {
      const { error } = await db.from("series_subscriptions").upsert({ user_id: user!.id, series_id: seriesId }, { onConflict: "user_id,series_id", ignoreDuplicates: true });
      dbError(error);
    } else {
      const { error } = await db.from("series_subscriptions").delete().eq("user_id", user!.id).eq("series_id", seriesId);
      dbError(error);
    }
    return { subscribed: body.subscribe };
  });
}
