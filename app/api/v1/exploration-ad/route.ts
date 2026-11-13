import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const { data, error } = await db.from("exploration_ad_settings")
      .select("enabled,kind,title,body,image_url,post_id")
      .eq("id", 1)
      .maybeSingle();
    dbError(error);
    if (!data?.enabled || !data.post_id) return null;

    // RLS only exposes a placement when its target remains published.
    const target = await db.from("posts").select("client_id")
      .eq("id", data.post_id).eq("status", "published").maybeSingle();
    dbError(target.error);
    if (!target.data) return null;
    return { ...data, post_client_id: target.data.client_id };
  });
}
