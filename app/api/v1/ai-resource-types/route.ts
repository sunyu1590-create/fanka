import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const { data, error } = await db.from("ai_resource_types")
      .select("resource_type,label,description,sort_order")
      .eq("enabled", true).order("sort_order").order("resource_type");
    dbError(error);
    const types = data || [];
    const counts = await Promise.all(types.map(async (item) => {
      const result = await db.from("posts").select("id", { count: "exact", head: true })
        .eq("channel", "ai").eq("status", "published").eq("content_type", item.resource_type);
      dbError(result.error);
      return [item.resource_type, result.count || 0] as const;
    }));
    const countByType = new Map(counts);
    return { items: types.map((item) => ({ ...item, published_count: countByType.get(item.resource_type) || 0 })) };
  });
}
