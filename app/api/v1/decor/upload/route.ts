import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";

const TYPES: Record<string, { ext: string; limit: number; magic: (b: Uint8Array) => boolean }> = {
  "image/png": {
    ext: "png", limit: 4 * 1024 * 1024,
    magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  "image/webp": {
    ext: "webp", limit: 4 * 1024 * 1024,
    magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  "image/jpeg": {
    ext: "jpg", limit: 4 * 1024 * 1024,
    magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
};

const KINDS = new Set(["icon", "card-back", "content-image", "publish-icon"]);

/**
 * 装扮资源上传。只接受真实图片文件的魔数与 MIME 双重校验，
 * 不接受 SVG/HTML（避免脚本注入），也不代理外部地址。
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const form = await req.formData() as unknown as { get: (name: string) => unknown };
    const file = form.get("file");
    const kind = String(form.get("kind") || "icon");
    if (!(file instanceof File)) throw new ApiError(400, "请选择一张图片");
    if (!KINDS.has(kind)) throw new ApiError(400, "资源类型无效");
    const spec = TYPES[file.type];
    if (!spec) throw new ApiError(400, "只支持 PNG、WebP 或 JPEG 图片");
    if (file.size < 1 || file.size > spec.limit) throw new ApiError(413, "图片不能超过 4 MB");
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!spec.magic(bytes)) throw new ApiError(400, "图片格式与文件内容不一致");

    const path = `${user!.id}/${kind}/${randomUUID()}.${spec.ext}`;
    const uploaded = await db.storage.from("heika-decor").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    dbError(uploaded.error);
    const { data } = db.storage.from("heika-decor").getPublicUrl(path);
    return { url: data.publicUrl, path, width: null, height: null, kind };
  });
}
