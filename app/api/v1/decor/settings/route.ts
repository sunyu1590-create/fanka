import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { normalizeBottomBar, normalizeCard, DEFAULT_BOTTOM_BAR, DEFAULT_CARD } from "@/lib/decor/types";

const SELECT = "bottom_bar,card,bottom_bar_theme_id,card_theme_id,updated_at";

async function resolvedThemeIds(db: Awaited<ReturnType<typeof context>>["db"], ids: { bottom?: string | null; card?: string | null }) {
  const wanted = [ids.bottom, ids.card].filter(Boolean) as string[];
  if (!wanted.length) return new Map<string, { id: string; title: string; slug: string | null; status: string }>();
  const { data } = await db.from("decor_themes").select("id,title,slug,status").in("id", wanted);
  return new Map((data || []).map((row) => [row.id as string, row as { id: string; title: string; slug: string | null; status: string }]));
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    if (!user) {
      return { signedIn: false, bottomBar: DEFAULT_BOTTOM_BAR, card: DEFAULT_CARD, bottomBarThemeId: null, cardThemeId: null, bottomBarTheme: null, cardTheme: null, updatedAt: null };
    }
    const { data, error } = await db.from("decor_settings").select(SELECT).eq("user_id", user.id).maybeSingle();
    dbError(error);
    const themes = await resolvedThemeIds(db, { bottom: data?.bottom_bar_theme_id, card: data?.card_theme_id });
    return {
      signedIn: true,
      // 未自定义时返回默认值，前端不需要再判断空对象。
      bottomBar: data?.bottom_bar ? normalizeBottomBar(data.bottom_bar) : DEFAULT_BOTTOM_BAR,
      card: data?.card ? normalizeCard(data.card) : DEFAULT_CARD,
      bottomBarThemeId: data?.bottom_bar_theme_id || null,
      cardThemeId: data?.card_theme_id || null,
      bottomBarTheme: data?.bottom_bar_theme_id ? themes.get(data.bottom_bar_theme_id) || null : null,
      cardTheme: data?.card_theme_id ? themes.get(data.card_theme_id) || null : null,
      updatedAt: data?.updated_at || null,
    };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.bottomBar !== undefined) {
      if (body.bottomBar === null) patch.bottom_bar = null;
      else patch.bottom_bar = normalizeBottomBar(body.bottomBar);
    }
    if (body.card !== undefined) {
      if (body.card === null) patch.card = null;
      else patch.card = normalizeCard(body.card);
    }

    // 主题来源：应用整套主题时记录来源 id，用于「使用人数」的真实统计。
    for (const key of ["bottomBarThemeId", "cardThemeId"] as const) {
      if (body[key] === undefined) continue;
      const column = key === "bottomBarThemeId" ? "bottom_bar_theme_id" : "card_theme_id";
      if (body[key] === null) { patch[column] = null; continue; }
      const id = uuid(body[key], "主题");
      const { data: theme, error } = await db.from("decor_themes").select("id,status,author_id").eq("id", id).maybeSingle();
      dbError(error);
      if (!theme) throw new ApiError(404, "主题不存在");
      // 只能应用已上架主题，或自己提交的主题（用于本人预览）。
      if (theme.status !== "approved" && theme.author_id !== user!.id) throw new ApiError(403, "该主题尚未通过审核");
      patch[column] = id;
    }

    if (Object.keys(patch).length === 1) throw new ApiError(400, "没有需要保存的装扮");

    const { data, error } = await db.from("decor_settings")
      .upsert({ user_id: user!.id, ...patch }, { onConflict: "user_id" })
      .select(SELECT).single();
    dbError(error);
    const themes = await resolvedThemeIds(db, { bottom: data?.bottom_bar_theme_id, card: data?.card_theme_id });
    return {
      signedIn: true,
      bottomBar: data?.bottom_bar ? normalizeBottomBar(data.bottom_bar) : DEFAULT_BOTTOM_BAR,
      card: data?.card ? normalizeCard(data.card) : DEFAULT_CARD,
      bottomBarThemeId: data?.bottom_bar_theme_id || null,
      cardThemeId: data?.card_theme_id || null,
      bottomBarTheme: data?.bottom_bar_theme_id ? themes.get(data.bottom_bar_theme_id) || null : null,
      cardTheme: data?.card_theme_id ? themes.get(data.card_theme_id) || null : null,
      updatedAt: data?.updated_at || null,
    };
  });
}
