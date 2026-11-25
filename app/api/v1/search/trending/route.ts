import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { getTrendingSearches } from "@/lib/server/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    return getTrendingSearches(db);
  });
}
