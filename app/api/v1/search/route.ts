import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const params = req.nextUrl.searchParams;
    const query = (params.get("q") || "").trim().replace(/[%,_()."\\*]/g, "").slice(0, 60);
    const kind = params.get("kind") === "people" ? "people" : "content";
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(24, Number(params.get("limit")) || 12));
    if (query.length < 1) return { kind, items: [], total: 0, page, limit };

    if (kind === "people") {
      const { data, error, count } = await db
        .from("profiles")
        .select("id,nickname,bio,avatar_url", { count: "exact" })
        .or(`nickname.ilike.%${query}%,bio.ilike.%${query}%`)
        .order("nickname", { ascending: true })
        .order("id", { ascending: true })
        .range((page - 1) * limit, page * limit - 1);
      dbError(error);
      return { kind, items: data || [], total: count || 0, page, limit };
    }

    const { data, error, count } = await db
      .from("posts")
      .select(libraryFields, { count: "exact" })
      .eq("status", "published")
      .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .order("client_id", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    dbError(error);
    return {
      kind,
      items: await presentMany(db, (data || []) as unknown as LibraryRow[]),
      total: count || 0,
      page,
      limit,
    };
  });
}
