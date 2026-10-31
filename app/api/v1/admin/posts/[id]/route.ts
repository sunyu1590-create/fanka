import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(profileError);
    if (!profile || profile.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const body = await jsonBody(req);
    if (body.status !== "published" && body.status !== "hidden") throw new ApiError(400, "审核状态无效");
    const reviewNote = textField(body.review_note, "审核说明", 3, 500);
    let update = db.from("posts").update({
      status: body.status,
      moderation_review_note: reviewNote,
      moderation_reviewed_at: new Date().toISOString(),
      moderation_reviewed_by: user!.id,
      updated_at: new Date().toISOString(),
    }).eq("id", uuid((await params).id));
    update = body.status === "published" ? update.eq("status", "pending_review") : update.in("status", ["pending_review", "published"]);
    const { data, error } = await update.select("id,status,moderation_reviewed_at").single();
    dbError(error);
    return data;
  });
}
