import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const [insights, missions] = await Promise.all([
      db.rpc("my_creator_insights"),
      db.rpc("my_creator_missions"),
    ]);
    dbError(insights.error);
    dbError(missions.error);
    return { insights: insights.data, ...missions.data };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    if (![
      "explore_days",
      "publish_post",
      "curate_posts",
    ].includes(String(body.missionKey))) throw new ApiError(400, "任务无效");
    const { data, error } = await db.rpc("claim_creator_mission", { p_mission_key: body.missionKey });
    dbError(error);
    return data;
  });
}
