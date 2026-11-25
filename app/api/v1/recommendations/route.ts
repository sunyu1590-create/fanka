import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { recommendPosts, recommendSeries } from "@/lib/server/recommend";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const surface = req.nextUrl.searchParams.get("surface") || "series";
    const limit = Math.max(4, Math.min(24, Number(req.nextUrl.searchParams.get("limit")) || 12));
    if (surface === "series") {
      const result = await recommendSeries(db, user?.id || null, limit);
      return { surface, ...result };
    }
    const result = await recommendPosts(db, user?.id || null, surface === "ai" ? "ai" : "discover", limit);
    return { surface, ...result };
  });
}
