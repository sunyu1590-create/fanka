import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(profileError);
    if (!profile || profile.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const body = await jsonBody(req);
    if (body.status !== "resolved" && body.status !== "dismissed") throw new ApiError(400, "处理状态无效");
    const reviewNote = textField(body.review_note, "处理说明", 3, 500);
    const { data, error } = await db.from("reports").update({
      status: body.status,
      review_note: reviewNote,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user!.id,
    }).eq("id", uuid((await params).id)).select("id,status,review_note,reviewed_at").single();
    dbError(error);
    return data;
  });
}
