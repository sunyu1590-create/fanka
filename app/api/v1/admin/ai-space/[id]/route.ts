import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "ai.review");
    const id = uuid((await params).id);
    const body = await jsonBody(req);
    const postResult = await db.from("posts").select("id,title,status,channel,featured_at,content_type,usage_scenarios").eq("id", id).eq("channel", "ai").maybeSingle();
    dbError(postResult.error);
    if (!postResult.data) throw new ApiError(404, "AI 内容不存在");
    if (body.action === "feature") {
      const featuredAt = body.featured === true ? new Date().toISOString() : null;
      const updated = await db.from("posts").update({ featured_at: featuredAt, updated_at: new Date().toISOString() }).eq("id", id).select("id,featured_at").single();
      dbError(updated.error);
      await recordModerationAudit(db, { actorId: user.id, action: featuredAt ? "ai_resource_featured" : "ai_resource_unfeatured", targetType: "post", targetId: id, reason: featuredAt ? "设为 AI 专区精选" : "取消 AI 专区精选" });
      return updated.data;
    }
    if (body.action === "classify") {
      const resourceType = typeof body.resourceType === "string" ? body.resourceType : "";
      const usageScenarios = Array.isArray(body.usageScenarios)
        ? [...new Set(body.usageScenarios.filter((value): value is string => typeof value === "string"))]
        : [];
      const validScenarios = new Set(["learning", "programming", "writing", "office", "creation", "life"]);
      if (usageScenarios.length > 6 || usageScenarios.some((value) => !validScenarios.has(value))) {
        throw new ApiError(400, "使用场景无效");
      }
      const catalog = await db.from("ai_resource_types").select("resource_type,enabled").eq("resource_type", resourceType).maybeSingle();
      dbError(catalog.error);
      if (!catalog.data?.enabled) throw new ApiError(400, "资源类型不存在或已停用");
      const updated = await db.from("posts").update({
        content_type: resourceType,
        usage_scenarios: usageScenarios,
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("channel", "ai").select("id,content_type,usage_scenarios").single();
      dbError(updated.error);
      await recordModerationAudit(db, { actorId: user.id, action: "ai_resource_classified", targetType: "post", targetId: id, reason: `资源类型：${resourceType}；使用场景：${usageScenarios.join(",") || "无"}` });
      return updated.data;
    }
    if (body.status !== "published" && body.status !== "hidden") throw new ApiError(400, "审核状态无效");
    const reviewNote = textField(body.review_note, "审核说明", 3, 500);
    if (body.status === "published") {
      // 版本更新已改为 AI 自动审核：管理员不再参与已发布作品的版本通过/驳回，
      // 只保留对已发布违规作品的下架与恢复能力。
      const revision = await db.from("post_revisions").select("id").eq("post_id", id).eq("status", "pending").maybeSingle();
      dbError(revision.error);
      if (revision.data) throw new ApiError(409, "该作品的版本更新由 AI 自动审核，无需人工通过；如需处置违规内容请使用下架");
    }
    const updated = await db.from("posts").update({ status: body.status, moderation_review_note: reviewNote, moderation_reviewed_by: user.id, moderation_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).in("status", body.status === "published" ? ["pending_review", "hidden"] : ["pending_review", "published"]).select("id,status").maybeSingle();
    dbError(updated.error);
    if (!updated.data) throw new ApiError(409, "内容状态已变化，请刷新后重试");
    await recordModerationAudit(db, { actorId: user.id, action: body.status === "published" ? "ai_resource_approved" : "ai_resource_hidden", targetType: "post", targetId: id, reason: reviewNote });
    return updated.data;
  });
}
