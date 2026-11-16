import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { adminClient } from "@/lib/server/admin-client";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET = "heika-ads";

export async function POST(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const form = await req.formData() as unknown as { get: (name: string) => unknown };
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择一张广告图片");
    if (!allowedTypes.has(file.type)) throw new ApiError(400, "广告图片仅支持 JPG、PNG 或 WebP");
    if (file.size < 1 || file.size > 4 * 1024 * 1024) throw new ApiError(413, "广告图片不能超过 4 MB");
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const validSignature = file.type === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : file.type === "image/png"
        ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
        : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!validSignature) throw new ApiError(400, "图片格式与文件内容不一致");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `exploration-ad/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    // Storage bucket policies do not grant admin writes, so the upload uses the
    // service-role client after the caller has already been verified as admin.
    const storage = adminClient().storage.from(BUCKET);
    const uploaded = await storage.upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    dbError(uploaded.error);
    const { data: publicUrl } = storage.getPublicUrl(path);
    return { url: publicUrl.publicUrl, path };
  });
}
