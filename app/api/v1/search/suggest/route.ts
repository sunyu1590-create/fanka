import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { getSuggestions } from "@/lib/server/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    return getSuggestions(db, req.nextUrl.searchParams.get("q") || "");
  });
}
