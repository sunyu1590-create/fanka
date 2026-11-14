import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const [summary, claims, flips] = await Promise.all([
      db.rpc("my_experience_summary"),
      db.from("experience_reward_claims").select("level").eq("user_id", user!.id),
      db.rpc("get_daily_flip_state"),
    ]);
    dbError(summary.error);
    dbError(claims.error);
    dbError(flips.error);
    return {
      ...(summary.data || { total: 0, events: [] }),
      dailyAllowance: Number(flips.data?.baseAllowance) || 5,
      claimedLevels: (claims.data || []).map((claim) => claim.level),
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    const level = Number(body.level);
    if (!Number.isInteger(level) || level < 1 || level > 10)
      throw new ApiError(400, "奖励等级无效");
    const { data, error } = await db.rpc("claim_experience_reward", { p_level: level });
    dbError(error);
    return data;
  });
}
