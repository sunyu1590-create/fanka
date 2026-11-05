import { NextRequest } from "next/server";
import { context, dbError, respond, ApiError } from "@/lib/server/api";
import { libraryFeedFields, presentFeedMany, type LibraryRow } from "@/lib/server/library";

type Cursor = { created_at: string; id: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof parsed.created_at !== "string" || !Number.isFinite(Date.parse(parsed.created_at)) || typeof parsed.id !== "string" || !UUID.test(parsed.id)) throw new Error("cursor");
    return { created_at: new Date(parsed.created_at).toISOString(), id: parsed.id };
  } catch {
    throw new ApiError(400, "搜索游标无效");
  }
}

function encodeCursor(row: Pick<LibraryRow, "created_at" | "id">) {
  return Buffer.from(JSON.stringify({ created_at: row.created_at, id: row.id })).toString("base64url");
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const kind = params.get("kind") === "people" ? "people" : "content";
  const response = await respond(async () => {
    const { db } = await context(req, false);
    const query = (params.get("q") || "").trim().replace(/[%,_()."\\*,]/g, "").slice(0, 60);
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(24, Number(params.get("limit")) || 12));
    if (query.length < 1) return { kind, items: [], total: 0, has_more: false, next_cursor: null, page, limit };

    if (kind === "people") {
      const { data, error, count } = await db
        .from("profiles")
        .select("id,nickname,bio,avatar_url", { count: "exact" })
        .or(`nickname.ilike.%${query}%,bio.ilike.%${query}%`)
        .order("nickname", { ascending: true })
        .order("id", { ascending: true })
        .range((page - 1) * limit, page * limit - 1);
      dbError(error);
      return { kind, items: data || [], total: count || 0, has_more: false, next_cursor: null, page, limit };
    }

    const cursor = decodeCursor(params.get("cursor"));
    const textFilter = `title.ilike.%${query}%,body.ilike.%${query}%`;
    let request = db
      .from("posts")
      .select(libraryFeedFields)
      .eq("status", "published")
      .eq("channel", "community")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) request = request.or(`and(or(${textFilter}),or(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})))`);
    else request = request.or(textFilter);
    const { data, error } = await request;
    dbError(error);
    const fetched = (data || []) as unknown as LibraryRow[];
    const hasMore = fetched.length > limit;
    const rows = fetched.slice(0, limit);
    return {
      kind,
      items: await presentFeedMany(db, rows),
      total: null,
      has_more: hasMore,
      next_cursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1]) : null,
      page,
      limit,
    };
  });
  if (response.ok && kind === "content") response.headers.set("Cache-Control", "public, max-age=0, s-maxage=20, stale-while-revalidate=60");
  return response;
}
