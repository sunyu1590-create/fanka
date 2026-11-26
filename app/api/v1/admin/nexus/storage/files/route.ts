import { NextRequest } from "next/server";
import { respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { loadStorageFiles } from "@/lib/server/nexus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 资源城市下钻：真实对象列表，复用既有存储分页函数。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const params = req.nextUrl.searchParams;
    return loadStorageFiles(db, params.get("bucket"), params.get("kind"), Number(params.get("offset") || 0));
  });
}
