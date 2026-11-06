import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";
import { validateFeedbackInput } from "@/lib/feedback-validation";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    if (typeof body.website === "string" && body.website.trim()) throw new ApiError(400, "反馈内容无效");
    const checked = validateFeedbackInput(body.category, body.message);
    if (checked.error || !checked.value) throw new ApiError(400, checked.error || "反馈内容无效");

    const recent = await db.from("user_feedback").select("id").eq("user_id", user!.id)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString()).limit(1);
    dbError(recent.error);
    if (recent.data?.length) throw new ApiError(429, "请稍后再提交反馈");

    const { data, error } = await db.from("user_feedback").insert({
      user_id: user!.id,
      category: checked.value.category,
      message: checked.value.message,
    }).select("id,created_at").single();
    dbError(error);
    return { submitted: true, ...data };
  });
}
