import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { normalizeDecor } from "@/lib/decor/types";
import { presetConfig } from "@/lib/decor/official";

const FIELDS = "id,slug,title,description,origin,kind,author_id,author_name,status,version,tags,config,published_config,review_note,published_at,created_at,updated_at";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const id = uuid((await params).id, "主题");
    const { data, error } = await db.from("decor_themes").select(FIELDS).eq("id", id).maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "主题不存在");
    const row = data as Record<string, unknown>;
    const mine = Boolean(user && row.author_id === user.id);
    if (row.status !== "approved" && !mine) throw new ApiError(403, "该主题尚未上架");
    const official = row.origin === "official" ? presetConfig(row.slug as string | null) : null;
    const live = official || (row.published_config ? normalizeDecor(row.published_config) : null);
    const [favoriteCount, installBottom, installCard, favorite] = await Promise.all([
      db.from("decor_favorites").select("user_id", { count: "exact", head: true }).eq("theme_id", id),
      db.from("decor_settings").select("user_id", { count: "exact", head: true }).eq("bottom_bar_theme_id", id),
      db.from("decor_settings").select("user_id", { count: "exact", head: true }).eq("card_theme_id", id),
      user ? db.from("decor_favorites").select("theme_id").eq("user_id", user.id).eq("theme_id", id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return {
      id,
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
      config: official || (mine || !live ? normalizeDecor(row.config) : live),
      liveConfig: live,
      reviewNote: mine ? row.review_note : null,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      favoriteCount: favoriteCount.count || 0,
      installCount: (installBottom.count || 0) + (installCard.count || 0),
      favorite: Boolean(favorite.data),
      mine,
      hasLiveVersion: Boolean(live),
    };
  });
}

/** 作者更新已上架主题：新版本进入审核，旧版本继续对外可用。 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const id = uuid((await params).id, "主题");
    const body = await jsonBody(req);
    const { data: current, error } = await db.from("decor_themes").select(FIELDS).eq("id", id).maybeSingle();
    dbError(error);
    if (!current) throw new ApiError(404, "主题不存在");
    if (current.author_id !== user!.id) throw new ApiError(403, "只能修改自己的主题");
    if (current.status === "delisted") throw new ApiError(403, "已下架的主题需要联系管理员处理");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length < 2 || body.title.trim().length > 24) throw new ApiError(400, "主题名称长度须为 2-24");
      patch.title = body.title.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.trim().length < 4 || body.description.trim().length > 120) throw new ApiError(400, "简介长度须为 4-120");
      patch.description = body.description.trim();
    }
    if (body.tags !== undefined) {
      patch.tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).slice(0, 4) : [];
    }
    if (body.config !== undefined) {
      const raw = (body.config && typeof body.config === "object" ? body.config : {}) as Record<string, unknown>;
      if (!raw.bottomBar && !raw.card) throw new ApiError(400, "主题内容为空");
      patch.config = normalizeDecor(raw);
    }
    // 已上架主题的任何修改都要重新审核；审核期间 published_config 保持旧版本可用。
    if (current.status === "approved" || current.status === "rejected" || current.status === "pending") {
      patch.status = "pending";
      patch.review_note = null;
    }

    const { data, error: updateError } = await db.from("decor_themes").update(patch).eq("id", id).select(FIELDS).single();
    dbError(updateError);
    const row = data as Record<string, unknown>;
    return {
      id,
      status: row.status,
      version: row.version,
      publishedConfig: row.published_config ? normalizeDecor(row.published_config) : null,
      config: normalizeDecor(row.config),
      reviewNote: row.review_note,
    };
  });
}

/** 作者撤回投稿（仅未上架、无线上版本时允许），避免误上架内容长期占位。 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const id = uuid((await params).id, "主题");
    const { data: current, error } = await db.from("decor_themes").select("author_id,status,published_config").eq("id", id).maybeSingle();
    dbError(error);
    if (!current) throw new ApiError(404, "主题不存在");
    if (current.author_id !== user!.id) throw new ApiError(403, "只能撤回自己的投稿");
    if (current.published_config) throw new ApiError(400, "已上架过的主题不能直接删除，请提交下架申请");
    const { error: deleteError } = await db.from("decor_themes").delete().eq("id", id);
    dbError(deleteError);
    return { deleted: true };
  });
}
