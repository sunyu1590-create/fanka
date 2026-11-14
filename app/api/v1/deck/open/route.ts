import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    const slot = Number(body.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 23) throw new ApiError(400, "卡牌序号无效");
    const { data, error } = await db.rpc("open_daily_card_with_result", { p_card_slot: slot });
    if (error?.message.includes("daily_flip_limit_reached")) throw new ApiError(429, "今日翻卡次数已用完");
    dbError(error);
    return data;
  });
}
