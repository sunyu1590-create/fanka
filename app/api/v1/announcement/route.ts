import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** 客户端启动时拉取当前生效的公告；没有开启时返回 null。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const { data, error } = await db.rpc("announcement_get");
    dbError(error);
    return data ?? null;
  });
}
