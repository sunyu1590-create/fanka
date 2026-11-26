import { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import {
  buildNexusSnapshot, loadAiScene, loadContentScene, loadGlobeScene,
  loadSecurityScene, loadStorageScene,
} from "@/lib/server/nexus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCENES = new Set(["overview", "globe", "server", "storage", "ai", "content", "security"]);

/** 各场景的按需数据。重型统计（存储/内容/AI）不进入每秒快照。 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ scene: string }> }) {
  return respond(async () => {
    const { db } = await requirePermission(req, "audit.read");
    const scene = (await params).scene;
    if (!SCENES.has(scene)) throw new ApiError(404, "未知场景");
    switch (scene) {
      case "globe": return loadGlobeScene(db);
      case "storage": return loadStorageScene(db);
      case "ai": return loadAiScene(db);
      case "content": return loadContentScene(db);
      case "security": return loadSecurityScene(db);
      case "server":
      case "overview":
      default: return buildNexusSnapshot(db);
    }
  });
}
