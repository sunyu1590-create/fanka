import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const secret = process.env.CRON_SECRET;
    const received = req.headers.get("authorization") || "";
    const expected = secret ? Buffer.from(`Bearer ${secret}`) : Buffer.alloc(0);
    const supplied = Buffer.from(received);
    if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ApiError(401, "未授权");
    const { data, error } = await adminClient().rpc("sync_expired_memberships");
    if (error) throw new ApiError(503, "会员状态同步失败");
    return { updatedProfiles: data };
  });
}
