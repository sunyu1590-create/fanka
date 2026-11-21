import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { normalizeDecor, type DecorConfig } from "@/lib/decor/types";
import { presetConfig } from "@/lib/decor/official";

const LIST_FIELDS = "id,slug,title,description,origin,kind,author_id,author_name,status,version,tags,config,published_config,review_note,published_at,created_at,updated_at";

type Row = {
  id: string; slug: string | null; title: string; description: string; origin: "official" | "community";
  kind: "bundle" | "bottom" | "card"; author_id: string | null; author_name: string | null;
  status: "pending" | "approved" | "rejected" | "delisted"; version: number; tags: string[];
  config: unknown; published_config: unknown; review_note: string | null;
  published_at: string | null; created_at: string; updated_at: string;
};

function present(row: Row, viewerId: string | null, favorite: boolean, favoriteCount: number, installCount: number) {
  const mine = Boolean(viewerId && row.author_id === viewerId);
  const official = row.origin === "official" ? presetConfig(row.slug) : null;
  const live = official || (row.published_config ? normalizeDecor(row.published_config) : null);
  const draft = official || normalizeDecor(row.config);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    origin: row.origin,
    kind: row.kind,
    authorId: row.author_id,
    authorName: row.author_name,
    status: row.status,
    version: row.version,
    tags: row.tags || [],
    // 作者本人看到自己最新的提交（便于预览），其他人只看到线上版本。
    config: mine || !live ? draft : live,
    liveConfig: live,
    reviewNote: mine ? row.review_note : null,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favorite,
    favoriteCount,
    installCount,
    mine,
    hasLiveVersion: Boolean(live),
  };
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const scope = req.nextUrl.searchParams.get("scope") || "official";
    const kind = req.nextUrl.searchParams.get("kind") || "all";
    const query = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 40);

    let builder = db.from("decor_themes").select(LIST_FIELDS);
    if (scope === "official") builder = builder.eq("origin", "official").eq("status", "approved");
    else if (scope === "community") builder = builder.eq("origin", "community").eq("status", "approved");
    else if (scope === "mine") {
      if (!user) return { items: [], signedIn: false };
      builder = builder.eq("author_id", user.id);
    } else if (scope === "favorites") {
      if (!user) return { items: [], signedIn: false };
      const { data: favorites, error } = await db.from("decor_favorites").select("theme_id").eq("user_id", user.id);
      dbError(error);
      const ids = (favorites || []).map((row) => row.theme_id as string);
      if (!ids.length) return { items: [], signedIn: true };
      builder = builder.in("id", ids);
    } else {
      builder = builder.in("status", ["approved"]);
    }
    if (kind !== "all") builder = builder.eq("kind", kind);
    if (query) builder = builder.or(`title.ilike.%${query.replace(/[%_]/g, "")}%,description.ilike.%${query.replace(/[%_]/g, "")}%`);

    const { data, error } = await builder.order("origin", { ascending: true }).order("published_at", { ascending: false, nullsFirst: false }).limit(60);
    dbError(error);
    const rows = (data || []) as unknown as Row[];
    if (!rows.length) return { items: [], signedIn: Boolean(user) };

    const ids = rows.map((row) => row.id);
    const [favoriteRows, installRows, myFavorites] = await Promise.all([
      db.from("decor_favorites").select("theme_id").in("theme_id", ids),
      db.from("decor_settings").select("bottom_bar_theme_id,card_theme_id").or(`bottom_bar_theme_id.in.(${ids.join(",")}),card_theme_id.in.(${ids.join(",")})`),
      user ? db.from("decor_favorites").select("theme_id").eq("user_id", user.id).in("theme_id", ids) : Promise.resolve({ data: [] as { theme_id: string }[] }),
    ]);
    const favoriteCounts = new Map<string, number>();
    for (const row of favoriteRows.data || []) favoriteCounts.set(row.theme_id as string, (favoriteCounts.get(row.theme_id as string) || 0) + 1);
    const installCounts = new Map<string, number>();
    for (const row of installRows.data || []) {
      const bottom = (row as { bottom_bar_theme_id?: string | null }).bottom_bar_theme_id;
      const card = (row as { card_theme_id?: string | null }).card_theme_id;
      if (bottom) installCounts.set(bottom, (installCounts.get(bottom) || 0) + 1);
      if (card) installCounts.set(card, (installCounts.get(card) || 0) + 1);
    }
    const mineFavorites = new Set((myFavorites.data || []).map((row) => row.theme_id as string));

    return {
      signedIn: Boolean(user),
      items: rows.map((row) => present(row, user?.id || null, mineFavorites.has(row.id), favoriteCounts.get(row.id) || 0, installCounts.get(row.id) || 0)),
    };
  });
}

/** 从自己保存的方案发起投稿。官方预设不允许通过此接口创建。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const title = textField(body.title, "主题名称", 2, 24);
    const description = textField(body.description, "简介", 4, 120);
    const tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).slice(0, 4) : [];
    const kind = body.kind === "bottom" || body.kind === "card" ? body.kind : "bundle";
    const config: DecorConfig = normalizeDecor(body.config);
    // 至少要有一项真实配置，避免空主题上架。
    const raw = (body.config && typeof body.config === "object" ? body.config : {}) as Record<string, unknown>;
    if (!raw.bottomBar && !raw.card) throw new ApiError(400, "主题内容为空");

    const { data: profile } = await db.from("profiles").select("nickname").eq("id", user!.id).maybeSingle();
    const { data, error } = await db.from("decor_themes").insert({
      title, description, kind,
      origin: "community",
      author_id: user!.id,
      author_name: profile?.nickname || "探索者",
      status: "pending",
      version: 1,
      tags,
      config: config as unknown as Record<string, unknown>,
      published_config: null,
    }).select(LIST_FIELDS).single();
    dbError(error);
    return present(data as unknown as Row, user!.id, false, 0, 0);
  });
}
