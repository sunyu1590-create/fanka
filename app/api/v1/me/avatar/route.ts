import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const form = await req.formData() as unknown as { get: (name: string) => unknown };
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择一张头像图片");
    if (!allowedTypes.has(file.type)) throw new ApiError(400, "头像只支持 JPEG、PNG 或 WebP 图片");
    if (file.size < 1 || file.size > 2 * 1024 * 1024) throw new ApiError(413, "头像图片不能超过 2 MB");
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const validSignature = file.type === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : file.type === "image/png"
        ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
        : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!validSignature) throw new ApiError(400, "图片格式与文件内容不一致");
    const current = await db.from("profiles").select("avatar_url").eq("id", user!.id).single();
    dbError(current.error);
    if (!current.data) throw new ApiError(404, "用户资料不存在");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `${user!.id}/${randomUUID()}.${extension}`;
    const uploaded = await db.storage.from("heika-avatars").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    dbError(uploaded.error);
    const { data: publicUrl } = db.storage.from("heika-avatars").getPublicUrl(path);
    const updated = await db.from("profiles").update({ avatar_url: publicUrl.publicUrl }).eq("id", user!.id)
      .select("id,nickname,bio,timezone,avatar_url,show_bookmarks,role,membership_tier").single();
    if (updated.error) {
      await db.storage.from("heika-avatars").remove([path]);
      dbError(updated.error);
    }
    if (current.data.avatar_url) {
      try {
        const oldUrl = new URL(current.data.avatar_url);
        const marker = "/storage/v1/object/public/heika-avatars/";
        const markerIndex = oldUrl.pathname.indexOf(marker);
        if (markerIndex >= 0) {
          const oldPath = decodeURIComponent(oldUrl.pathname.slice(markerIndex + marker.length));
          if (oldPath.startsWith(`${user!.id}/`) && oldPath !== path) await db.storage.from("heika-avatars").remove([oldPath]);
        }
      } catch { /* A non-storage avatar URL is left untouched. */ }
    }
    return updated.data;
  });
}
