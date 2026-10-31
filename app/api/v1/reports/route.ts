import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";
import { validateReportInput } from "@/lib/report-validation";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    if (!!body.post_id === !!body.comment_id) throw new ApiError(400, "请选择一个举报对象");
    const checked = validateReportInput(body.reason, body.note);
    if (checked.error) throw new ApiError(400, checked.error);

    let postId: string | null = null;
    let commentId: string | null = null;
    if (body.post_id) {
      postId = uuid(body.post_id, "内容");
      const { data, error } = await db.from("posts").select("id,author_id").eq("id", postId).eq("status", "published").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "内容不存在或不可举报");
      if (data.author_id === user!.id) throw new ApiError(400, "不能举报自己的内容");
    } else {
      commentId = uuid(body.comment_id, "评论");
      const { data, error } = await db.from("comments").select("id,author_id,posts!inner(status)").eq("id", commentId).eq("status", "visible").eq("posts.status", "published").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "评论不存在或不可举报");
      if (data.author_id === user!.id) throw new ApiError(400, "不能举报自己的评论");
    }

    const reason = checked.note ? `${checked.reason} · ${checked.note}` : checked.reason;
    const { error } = await db.from("reports").insert({ reporter_id: user!.id, post_id: postId, comment_id: commentId, reason, status: "open" });
    if (error?.code === "23505") return { submitted: true, duplicate: true };
    dbError(error);
    // Never return reporter_id or report identifiers to the normal user UI.
    return { submitted: true, duplicate: false };
  });
}
