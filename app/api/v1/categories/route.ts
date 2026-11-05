import { NextRequest } from "next/server";
import { context, dbError, respond, ApiError } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const params = req.nextUrl.searchParams;
    const channel = params.get("channel") || "community";
    if (channel !== "community" && channel !== "ai") throw new ApiError(400, "频道无效");
    const kind = params.get("kind");
    const queryText = (params.get("q") || "").trim().replace(/[%,_()."\\*]/g, "").slice(0, 24);
    let query = db.from("interest_tags")
      .select("id,name,channel,parent_id,kind,sort_order,description,is_featured,aliases")
      .eq("channel", channel).eq("active", true).is("merged_into_id", null)
      .eq("moderation_status", "approved")
      .order("sort_order").order("id");
    if (kind === "category" || kind === "tag") query = query.eq("kind", kind);
    if (queryText) query = query.ilike("name", `%${queryText}%`);
    const { data, error } = await query;
    dbError(error);
    return { items: data || [] };
  });
}
