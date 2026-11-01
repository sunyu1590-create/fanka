import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  ApiError,
} from "@/lib/server/api";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";
import { cardRarityTier } from "@/lib/progression";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    if (req.nextUrl.searchParams.get("mode") !== "discover") {
      const { data, error } = await db
        .from("posts")
        .select("client_id")
        .eq("status", "published")
        .order("client_id")
        .limit(1000);
      dbError(error);
      return data!.map((row) => ({ id: Number(row.client_id) }));
    }
    const { data, error } = await db
      .from("posts")
      .select(libraryFields)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1000);
    dbError(error);
    return (data as unknown as LibraryRow[]).map(present);
  });
}
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const body = await jsonBody(req);
    const id = Number(body.id);
    if (!Number.isSafeInteger(id)) throw new ApiError(400, "卡片无效");
    const { data, error } = await db
      .from("posts")
      .select(libraryFields)
      .eq("client_id", id)
      .single();
    dbError(error);
    const post = data as unknown as LibraryRow;
    const { data: stats, error: statsError } = await db
      .from("post_rating_stats")
      .select("rating_count,rating_sum")
      .eq("post_id", post.id)
      .maybeSingle();
    dbError(statsError);
    const count = stats?.rating_count || 0;
    const average = count ? stats!.rating_sum / count : 0;
    return { ...present(post), rarityTier: cardRarityTier(average, count) };
  });
}
