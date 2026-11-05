import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { signPostMedia } from "@/lib/server/media";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(profileError);
    if (!profile || profile.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const body = await jsonBody(req);
    if (body.status !== "published" && body.status !== "hidden") throw new ApiError(400, "审核状态无效");
    const reviewNote = textField(body.review_note, "审核说明", 3, 500);
    const postId = uuid((await params).id);
    const { data: revision, error: revisionError } = await db.from("post_revisions").select("id,payload").eq("post_id", postId).eq("status", "pending").maybeSingle();
    dbError(revisionError);
    if (revision) {
      if (body.status === "published") {
        const paths = Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.filter((path: unknown): path is string => typeof path === "string") : [];
        if (paths.length) {
          const storedMedia = await signPostMedia(db, paths, 60);
          dbError(storedMedia.error);
          if ((storedMedia.data || []).length !== paths.length || storedMedia.data?.some((item) => !item.signedUrl)) throw new ApiError(409, "待审核修改包含无法读取的媒体，请联系作者重新提交");
        }
        const { data, error } = await db.rpc("apply_post_revision", { p_post_id: postId, p_review_note: reviewNote });
        dbError(error);
        return data;
      }
      const { data, error } = await db.from("post_revisions").update({ status: "rejected", review_note: reviewNote, reviewed_at: new Date().toISOString(), reviewed_by: user!.id, updated_at: new Date().toISOString() }).eq("id", revision.id).eq("status", "pending").select("post_id,status,reviewed_at").single();
      dbError(error);
      if (!data) throw new ApiError(404, "待审核修改不存在");
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
    const { data, error } = await update.select("id,status,moderation_reviewed_at").single();
    dbError(error);
    return data;
  });
}
