import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const { data, error } = await db.rpc("my_experience_summary");
    dbError(error);
    return data || { total: 0, events: [] };
  });
}
