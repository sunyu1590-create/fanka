import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumBytes = 4 * 1024 * 1024;

function matchesImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const role = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(role.error);
    if (role.data?.role !== "admin") throw new ApiError(403, "需要管理员权限");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择一张广告图片");
    if (!allowedTypes.has(file.type)) throw new ApiError(400, "只支持 JPG、PNG 或 WebP 图片");
    if (file.size < 1 || file.size > maximumBytes) throw new ApiError(413, "广告图片不能超过 4 MB");

    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!matchesImageSignature(file.type, signature)) throw new ApiError(400, "图片内容与文件格式不一致");

    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `admin/${user!.id}/${randomUUID()}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const storage = db.storage.from("heika-ad-assets");
    const upload = await storage.upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000",
    });
    dbError(upload.error);
    const { data } = storage.getPublicUrl(path);
    return { image_url: data.publicUrl, storage_path: path };
  });
}
