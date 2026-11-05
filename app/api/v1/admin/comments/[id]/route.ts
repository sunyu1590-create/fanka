import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requireAdmin } from "@/lib/server/require-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    if (body.status !== "visible" && body.status !== "hidden") throw new ApiError(400, "评论状态无效");
    const id = uuid((await params).id);
    const reason = typeof body.review_note === "string" ? textField(body.review_note, "处理说明", 3, 500) : body.status === "hidden" ? "管理员隐藏评论" : "管理员恢复评论";
    const { data, error } = await db.from("comments").update({ status: body.status }).eq("id", id).select("id,status,post_id,author_id").maybeSingle();
    dbError(error);
    const result = data || await (async () => {
      const current = await db.from("comments").select("id,status,post_id,author_id").eq("id", id).maybeSingle();
      dbError(current.error);
      if (current.data?.status === body.status) return current.data;
      throw new ApiError(409, "评论状态已变化，请刷新列表后重试");
    })();
    if (!result) throw new ApiError(404, "评论不存在或已删除");
    await recordModerationAudit(db, { actorId: user.id, action: body.status === "hidden" ? "comment_hidden" : "comment_restored", targetType: "comment", targetId: id, reason, details: { postId: result.post_id, authorId: result.author_id } });
    return result;
  });
}
