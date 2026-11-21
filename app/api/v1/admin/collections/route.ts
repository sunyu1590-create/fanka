import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

/** 合公开信息审核：新建合集与已发布合集的公开信息修改都在这里处理。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const status = req.nextUrl.searchParams.get("status") || "pending";
    const { data, error } = await db.from("post_series")
      .select("id,creator_id,title,description,cover_url,kind,channel,category_id,status,review_status,pending_public,pending_review_note,updated_at,created_at,profiles!post_series_creator_id_fkey(nickname)")
      .eq("review_status", status === "all" ? "pending" : status)
      .order("updated_at", { ascending: false })
      .limit(50);
    dbError(error);
    return { items: data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const id = uuid(body.id, "合集");
    const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
    if (!action) throw new ApiError(400, "审核动作无效");
    const { data: series, error } = await db.from("post_series").select("id,creator_id,title,description,cover_url,kind,channel,category_id,pending_public,review_status").eq("id", id).maybeSingle();
    dbError(error);
    if (!series) throw new ApiError(404, "合集不存在");

    const pending = (series.pending_public || {}) as Record<string, unknown>;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
    if (action === "approve") {
      const patch: Record<string, unknown> = {
        review_status: "approved",
        // 通过审核才对外公开；新建与修改期间保持不可见，避免「待审却已公开」。
        is_public: true,
        review_note: note || null,
        pending_public: null,
        pending_review_note: null,
        updated_at: new Date().toISOString(),
      };
      if (pending.title) patch.title = pending.title;
      if (pending.description !== undefined) patch.description = pending.description;
      if (pending.cover_url !== undefined) patch.cover_url = pending.cover_url;
      if (pending.kind) patch.kind = pending.kind;
      if (pending.channel) patch.channel = pending.channel;
      if (pending.category_id !== undefined) patch.category_id = pending.category_id;
      const { error: updateError } = await db.from("post_series").update(patch).eq("id", id);
      dbError(updateError);
    } else {
      const { error: updateError } = await db.from("post_series").update({
        review_status: "rejected",
        review_note: note || "未通过审核",
        pending_public: null,
        pending_review_note: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      dbError(updateError);
    }
    await db.from("moderation_audit_logs").insert({
      actor_id: user!.id,
      action: action === "approve" ? "collection.approve" : "collection.reject",
      target_type: "post_series",
      target_id: id,
      reason: note || null,
      details: { pending },
    });
    return { ok: true };
  });
}
