import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const { data, error } = await db.rpc("my_daily_missions");
    dbError(error);
    return data;
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    if (!["flip_two", "rate_one", "save_one"].includes(String(body.missionKey))) throw new ApiError(400, "每日任务无效");
    const { data, error } = await db.rpc("claim_daily_mission", { p_mission_key: body.missionKey });
    dbError(error);
    return data;
  });
}
