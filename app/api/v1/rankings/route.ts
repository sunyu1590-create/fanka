import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { getRankings, type RankingKey } from "@/lib/server/distribution";

export const dynamic = "force-dynamic";

const ALLOWED: RankingKey[] = ["global", "ai", "series", "rising", "long"];

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const raw = (req.nextUrl.searchParams.get("keys") || "global,ai,series,rising,long").split(",");
    const keys = raw.filter((key): key is RankingKey => (ALLOWED as string[]).includes(key));
    const { rankings, computedAt } = await getRankings(db, keys.length ? keys : ALLOWED, {});
    return { rankings, computedAt };
  });
}
