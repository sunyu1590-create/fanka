import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "ai.review");
    const id = uuid((await params).id);
    const body = await jsonBody(req);
    const postResult = await db.from("posts").select("id,title,status,channel,featured_at").eq("id", id).eq("channel", "ai").maybeSingle();
    dbError(postResult.error);
    if (!postResult.data) throw new ApiError(404, "AI 内容不存在");
    if (body.action === "feature") {
      const featuredAt = body.featured === true ? new Date().toISOString() : null;
      const updated = await db.from("posts").update({ featured_at: featuredAt, updated_at: new Date().toISOString() }).eq("id", id).select("id,featured_at").single();
      dbError(updated.error);
      await recordModerationAudit(db, { actorId: user.id, action: featuredAt ? "ai_resource_featured" : "ai_resource_unfeatured", targetType: "post", targetId: id, reason: featuredAt ? "设为 AI 专区精选" : "取消 AI 专区精选" });
      return updated.data;
    }
    if (body.status !== "published" && body.status !== "hidden") throw new ApiError(400, "审核状态无效");
    const reviewNote = textField(body.review_note, "审核说明", 3, 500);
    const revision = await db.from("post_revisions").select("id").eq("post_id", id).eq("status", "pending").maybeSingle();
    dbError(revision.error);
    if (revision.data) {
      if (body.status === "published") {
        const { data, error } = await db.rpc("apply_ai_post_revision", { p_post_id: id, p_review_note: reviewNote });
        dbError(error);
        await recordModerationAudit(db, { actorId: user.id, action: "ai_resource_revision_approved", targetType: "post", targetId: id, reason: reviewNote });
        return data;
      }
      const rejected = await db.from("post_revisions").update({ status: "rejected", review_note: reviewNote, reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", revision.data.id).eq("status", "pending").select("id,status").maybeSingle();
      dbError(rejected.error);
      if (!rejected.data) throw new ApiError(409, "待审核修改状态已变化，请刷新后重试");
      await recordModerationAudit(db, { actorId: user.id, action: "ai_resource_revision_rejected", targetType: "post", targetId: id, reason: reviewNote });
      return { id, status: "published", revision_status: "rejected" };
    }
    const updated = await db.from("posts").update({ status: body.status, moderation_review_note: reviewNote, moderation_reviewed_by: user.id, moderation_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).in("status", body.status === "published" ? ["pending_review", "hidden"] : ["pending_review", "published"]).select("id,status").maybeSingle();
    dbError(updated.error);
    if (!updated.data) throw new ApiError(409, "内容状态已变化，请刷新后重试");
    await recordModerationAudit(db, { actorId: user.id, action: body.status === "published" ? "ai_resource_approved" : "ai_resource_hidden", targetType: "post", targetId: id, reason: reviewNote });
    return updated.data;
  });
}
