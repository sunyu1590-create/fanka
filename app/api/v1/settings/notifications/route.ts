import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data, error } = await db.from("browsing_preferences").select("notification_comments_enabled").eq("user_id", user!.id).maybeSingle();
    dbError(error);
    return { commentsEnabled: data?.notification_comments_enabled ?? true };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    if (typeof body.commentsEnabled !== "boolean") throw new ApiError(400, "通知设置无效");
    const { error } = await db.from("browsing_preferences").upsert({ user_id: user!.id, notification_comments_enabled: body.commentsEnabled });
    dbError(error);
    return { commentsEnabled: body.commentsEnabled };
  });
}
