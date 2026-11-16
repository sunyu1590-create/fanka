import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

const missionError = (message: string) => {
  if (/not complete/i.test(message)) return "任务还没完成，完成后再来领取";
  if (/already claimed/i.test(message)) return "今天的奖励已经领取过了";
  if (/no mission|unknown/i.test(message)) return "每日任务无效";
  return "";
};

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const { data, error } = await db.rpc("my_daily_missions");
    if (error) {
      const friendly = missionError(error.message);
      if (friendly) throw new ApiError(400, friendly);
      dbError(error);
    }
    return data;
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    if (!["flip_two", "rate_one", "save_one"].includes(String(body.missionKey))) throw new ApiError(400, "每日任务无效");
    const { data, error } = await db.rpc("claim_daily_mission", { p_mission_key: body.missionKey });
    if (error) {
      const friendly = missionError(error.message);
      if (friendly) throw new ApiError(400, friendly);
      dbError(error);
    }
    return data;
  });
}
