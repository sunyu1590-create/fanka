import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { signPostMedia } from "@/lib/server/media";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

function applyError(error: { code?: string; message?: string }) {
  const message = error.message || "";
  if (/[\u4e00-\u9fff]/.test(message)) return new ApiError(409, message);
  console.error("[admin-post-review] Revision apply failed", error.code || "unknown");
  if (error.code === "2201B") return new ApiError(409, "作品媒体地址校验失败，原公开作品保持不变；请重试，若仍失败请联系管理员");
  if (error.code === "42501") return new ApiError(403, "管理员审核权限校验失败，请重新登录后重试");
  if (error.code === "23503") return new ApiError(409, "作品关联的分类、系列或图片已失效，请检查后让作者重新提交");
  return new ApiError(409, "修改没有应用成功，请刷新审核项后重试；原公开作品仍保持不变");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(profileError);
    if (profile?.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const body = await jsonBody(req);
    if (body.status !== "published" && body.status !== "hidden") throw new ApiError(400, "审核状态无效");
    const reviewNote = textField(body.review_note, "审核说明", 3, 500);
    const postId = uuid((await params).id);
    const { data: revision, error: revisionError } = await db.from("post_revisions")
      .select("id,payload").eq("post_id", postId).eq("status", "pending").maybeSingle();
    dbError(revisionError);

    if (revision) {
      if (body.status === "published") {
        const paths = Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.filter((path: unknown): path is string => typeof path === "string") : [];
        if (paths.length) {
          const storedMedia = await signPostMedia(db, paths, 60);
          if (storedMedia.error || (storedMedia.data || []).length !== paths.length || storedMedia.data?.some((item) => !item.signedUrl)) {
            throw new ApiError(409, "待审核修改中的图片或视频无法读取，请作者重新上传媒体后再提交");
          }
        }
        const { data, error } = await db.rpc("apply_post_revision", { p_post_id: postId, p_review_note: reviewNote });
        if (error) throw applyError(error);
        await recordModerationAudit(db, { actorId: user!.id, action: "post_revision_approved", targetType: "post", targetId: postId, reason: reviewNote });
        return data;
      }
      const { data, error } = await db.from("post_revisions").update({
        status: "rejected", review_note: reviewNote, reviewed_at: new Date().toISOString(), reviewed_by: user!.id, updated_at: new Date().toISOString(),
      }).eq("id", revision.id).eq("status", "pending").select("post_id,status,reviewed_at").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(409, "修改审核状态已变化，请刷新审核列表后重试");
      await recordModerationAudit(db, { actorId: user!.id, action: "post_revision_rejected", targetType: "post", targetId: postId, reason: reviewNote });
      return { id: data.post_id, status: "published", revision_status: data.status, reviewed_at: data.reviewed_at };
    }

    let update = db.from("posts").update({
      status: body.status,
      moderation_review_note: reviewNote,
      moderation_reviewed_at: new Date().toISOString(),
      moderation_reviewed_by: user!.id,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    update = body.status === "published" ? update.eq("status", "pending_review") : update.in("status", ["pending_review", "published"]);
    const { data, error } = await update.select("id,status,moderation_reviewed_at").maybeSingle();
    dbError(error);
    const result = data || await (async () => {
      const current = await db.from("posts").select("id,status,moderation_reviewed_at").eq("id", postId).maybeSingle();
      dbError(current.error);
      if (current.data?.status === body.status) return current.data;
      throw new ApiError(409, "作品状态已变化，请刷新审核列表后重试");
    })();
    await recordModerationAudit(db, { actorId: user!.id, action: body.status === "published" ? "post_approved" : "post_hidden", targetType: "post", targetId: postId, reason: reviewNote });
    return result;
  });
}
