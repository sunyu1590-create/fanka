import { NextRequest } from "next/server";
import { respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { buildNexusSnapshot } from "@/lib/server/nexus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** HEIKA Nexus 初始快照（SSE 不可用时的降级轮询入口）。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "audit.read");
    return buildNexusSnapshot(db);
  });
}
