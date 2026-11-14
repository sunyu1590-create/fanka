import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const { data, error } = await db.from("app_download_settings")
      .select("enabled,download_url")
      .eq("id", 1)
      .maybeSingle();
    dbError(error);
    if (!data?.enabled || !data.download_url) return null;
    return { download_url: data.download_url };
  });
}
