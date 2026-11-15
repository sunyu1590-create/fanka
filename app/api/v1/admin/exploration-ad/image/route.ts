import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

const ALLOWED = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择广告图片");
    const ext = ALLOWED.get(file.type);
    if (!ext || file.size < 1 || file.size > 4 * 1024 * 1024) throw new ApiError(400, "图片仅支持 4 MB 以内的 JPG、PNG 或 WebP");
    const path = `${user.id}/${randomUUID()}.${ext}`;
    const upload = await db.storage.from("exploration-ads").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    dbError(upload.error);
    const publicUrl = db.storage.from("exploration-ads").getPublicUrl(path).data?.publicUrl;
    if (!publicUrl) {
      await db.storage.from("exploration-ads").remove([path]);
      throw new ApiError(503, "广告图片地址生成失败");
    }
    return { url: publicUrl, path };
  });
}
