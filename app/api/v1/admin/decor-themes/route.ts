import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { normalizeDecor } from "@/lib/decor/types";

const FIELDS = "id,slug,title,description,origin,kind,author_id,author_name,status,version,tags,config,published_config,review_note,published_at,created_at,updated_at";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const status = req.nextUrl.searchParams.get("status") || "pending";
    let builder = db.from("decor_themes").select(FIELDS).eq("origin", "community");
    if (status !== "all") builder = builder.eq("status", status);
    const { data, error } = await builder.order("updated_at", { ascending: false }).limit(60);
    dbError(error);
    return { items: data || [] };
  });
}

/**
 * 审核动作：
 * - approve：把当前 config 发布为线上版本（旧版本在审核期间一直可用）
 * - reject：退回并写明原因
 * - delist：下架（保留 published_config，已应用的用户不会被静默替换）
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const body = await jsonBody(req);
    const id = uuid(body.id, "主题");
    const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : body.action === "delist" ? "delist" : null;
    if (!action) throw new ApiError(400, "审核动作无效");
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";

    const { data: theme, error } = await db.from("decor_themes").select("id,config,published_config,version,status").eq("id", id).maybeSingle();
    dbError(error);
    if (!theme) throw new ApiError(404, "主题不存在");

    if (action === "reject" && !note) throw new ApiError(400, "退回时必须填写原因");
    if (action === "approve") {
      const config = normalizeDecor(theme.config);
      const nextVersion = theme.published_config ? Number(theme.version || 1) + 1 : Number(theme.version || 1);
      const { data, error: updateError } = await db.from("decor_themes").update({
        status: "approved",
        published_config: config as unknown as Record<string, unknown>,
        version: nextVersion,
        review_note: note || null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id).select(FIELDS).single();
      dbError(updateError);
      return data;
    }

    const patch = action === "reject"
      ? { status: "rejected", review_note: note, updated_at: new Date().toISOString() }
      : { status: "delisted", review_note: note || "内容不符合上架规范", updated_at: new Date().toISOString() };
    const { data, error: updateError } = await db.from("decor_themes").update(patch).eq("id", id).select(FIELDS).single();
    dbError(updateError);
    return data;
  });
}
