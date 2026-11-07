import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { validateFeedbackInput } from "@/lib/feedback-validation";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const form = await req.formData();
    if (String(form.get("website") || "").trim()) throw new ApiError(400, "反馈内容无效");
    const checked = validateFeedbackInput(form.get("category"), form.get("message"));
    if (checked.error || !checked.value) throw new ApiError(400, checked.error || "反馈内容无效");
    const recent = await db.from("user_feedback").select("id").eq("user_id", user!.id)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString()).limit(1);
    dbError(recent.error);
    if (recent.data?.length) throw new ApiError(429, "请稍后再提交反馈");
    const file = form.get("attachment");
    let attachmentPath: string | null = null;
    if (file !== null) {
      if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) throw new ApiError(400, "图片须为 5 MB 以内的 JPG、PNG 或 WebP");
      const bytes = Buffer.from(await file.arrayBuffer());
      const valid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : file.type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
      if (!valid) throw new ApiError(400, "图片内容与格式不符");
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      attachmentPath = `${user!.id}/${randomUUID()}_${randomUUID()}.${ext}`;
      const upload = await db.storage.from("user-feedback").upload(attachmentPath, bytes, { contentType: file.type, upsert: false, cacheControl: "3600" });
      dbError(upload.error);
    }

    const { data, error } = await db.from("user_feedback").insert({
      user_id: user!.id,
      category: checked.value.category,
      message: checked.value.message,
      attachment_path: attachmentPath,
    }).select("id,created_at").single();
    if (error) {
      if (attachmentPath) await db.storage.from("user-feedback").remove([attachmentPath]);
      dbError(error);
    }
    return { submitted: true, ...data };
  });
}
