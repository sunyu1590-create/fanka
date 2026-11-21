import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const id = uuid((await params).id, "主题");
    const body = await jsonBody(req).catch(() => ({} as Record<string, unknown>));
    const { data: theme, error } = await db.from("decor_themes").select("id,status,author_id").eq("id", id).maybeSingle();
    dbError(error);
    if (!theme) throw new ApiError(404, "主题不存在");
    if (theme.status !== "approved" && theme.author_id !== user!.id) throw new ApiError(403, "该主题尚未上架");

    const existing = await db.from("decor_favorites").select("theme_id").eq("user_id", user!.id).eq("theme_id", id).maybeSingle();
    dbError(existing.error);
    const next = typeof body.favorite === "boolean" ? body.favorite : !existing.data;
    if (next) {
      const { error: insertError } = await db.from("decor_favorites").upsert({ user_id: user!.id, theme_id: id }, { onConflict: "user_id,theme_id" });
      dbError(insertError);
    } else {
      const { error: deleteError } = await db.from("decor_favorites").delete().eq("user_id", user!.id).eq("theme_id", id);
      dbError(deleteError);
    }
    const count = await db.from("decor_favorites").select("user_id", { count: "exact", head: true }).eq("theme_id", id);
    return { favorite: next, favoriteCount: count.count || 0 };
  });
}
