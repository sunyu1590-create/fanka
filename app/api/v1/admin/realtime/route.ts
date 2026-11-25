import { NextRequest } from "next/server";
import { respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";
import { realtimeSnapshot } from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 管理员统一实时快照（唯一实时入口）。
 * 前端每秒只发这一个请求，服务端 900ms 单飞缓存；
 * 仪表、任务、告警、流量、进程都从这里取，避免每个卡片各自轮询。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "audit.read");
    const snapshot = await realtimeSnapshot(adminClient());
    return snapshot;
  });
}
