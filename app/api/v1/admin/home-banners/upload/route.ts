import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import type { Metadata } from "sharp";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { publicUrlFor } from "@/lib/server/home-banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_TYPES: Record<string, { ext: string; magic: (bytes: Uint8Array) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": {
    ext: "webp",
    magic: (b) => String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP",
  },
};
const VIDEO_TYPES: Record<string, { ext: string; magic: (bytes: Uint8Array) => boolean }> = {
  "video/mp4": { ext: "mp4", magic: (b) => String.fromCharCode(b[4], b[5], b[6], b[7]) === "ftyp" },
};

const IMAGE_LIMIT = 8 * 1024 * 1024;
const VIDEO_LIMIT = 20 * 1024 * 1024;

/**
 * 轮播媒体上传。
 * 图片在这里就地解码校验并读取真实尺寸；视频由浏览器在选取文件时读取元数据，
 * 服务端只做容器签名与体积校验，不在请求内做转码（避免长时间占用进程）。
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAdmin(req);
    const form = await req.formData() as unknown as { get: (name: string) => unknown };
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择要上传的文件");
    const kind = String(form.get("kind") || "image");
    const isPoster = kind === "poster";

    let ext: string;
    let contentType: string;
    let width: number | null = null;
    let height: number | null = null;
    let durationMs: number | null = null;
    let buffer: Buffer;
    let storedAs: "image" | "video";

    if (isPoster || kind === "image") {
      const spec = IMAGE_TYPES[file.type];
      if (!spec) throw new ApiError(400, "图片仅支持 JPG、PNG、WebP");
      if (file.size < 1 || file.size > IMAGE_LIMIT) throw new ApiError(413, "图片不能超过 8 MB");
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!spec.magic(head)) throw new ApiError(400, "图片格式与文件内容不一致");
      buffer = Buffer.from(await file.arrayBuffer());
      let meta: Metadata;
      try {
        meta = await sharp(buffer).metadata();
      } catch {
        throw new ApiError(400, "图片无法解码，请重新选择");
      }
      if (!meta.width || !meta.height) throw new ApiError(400, "图片尺寸不可读");
      if (meta.width < 320 || meta.height < 80) throw new ApiError(400, "轮播图片宽度至少 320px、高度至少 80px");
      // 超大图先等比压到 2560 宽，避免首页一次性拉取原图。
      if (meta.width > 2560 || meta.height > 1440) {
        buffer = await sharp(buffer).resize(2560, 1440, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
        const resized = await sharp(buffer).metadata();
        width = resized.width || null;
        height = resized.height || null;
        ext = "jpg";
        contentType = "image/jpeg";
      } else {
        width = meta.width;
        height = meta.height;
        ext = spec.ext;
        contentType = file.type;
      }
      storedAs = "image";
    } else if (kind === "video") {
      const spec = VIDEO_TYPES[file.type] || VIDEO_TYPES["video/mp4"];
      if (file.size < 1 || file.size > VIDEO_LIMIT) throw new ApiError(413, "视频不能超过 20 MB");
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!spec.magic(head)) throw new ApiError(400, "视频仅支持 H.264 编码的 MP4");
      buffer = Buffer.from(await file.arrayBuffer());
      ext = spec.ext;
      contentType = "video/mp4";
      const reportedDuration = Number(form.get("duration_ms"));
      const reportedWidth = Number(form.get("width"));
      const reportedHeight = Number(form.get("height"));
      durationMs = Number.isFinite(reportedDuration) && reportedDuration > 0 ? Math.min(600000, Math.round(reportedDuration)) : null;
      width = Number.isFinite(reportedWidth) && reportedWidth > 0 ? Math.round(reportedWidth) : null;
      height = Number.isFinite(reportedHeight) && reportedHeight > 0 ? Math.round(reportedHeight) : null;
      if (durationMs && durationMs > 120000) throw new ApiError(400, "视频时长请控制在 2 分钟以内");
      if (width && height && (width < 320 || height < 80)) throw new ApiError(400, "视频分辨率过低");
      storedAs = "video";
    } else {
      throw new ApiError(400, "未知的上传类型");
    }

    const admin = adminClient();
    const path = `${user.id}/banner/${randomUUID()}${isPoster ? "-poster" : ""}.${ext}`;
    const upload = await admin.storage.from("home-banners").upload(path, buffer, { contentType, upsert: false, cacheControl: "31536000" });
    if (upload.error) throw new ApiError(502, `上传失败：${upload.error.message}`);

    // 落盘校验：对象真实存在才算上传成功，不拿 HTTP 200 当结论。
    const verify = await admin.storage.from("home-banners").download(path);
    if (verify.error || !verify.data) {
      await admin.storage.from("home-banners").remove([path]).catch(() => null);
      throw new ApiError(502, "存储校验失败，请重试");
    }

    return NextResponse.json({
      data: {
        path,
        url: publicUrlFor(admin, path),
        media_type: storedAs,
        width,
        height,
        duration_ms: durationMs,
        byte_size: buffer.byteLength,
        content_type: contentType,
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[banner-upload]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "上传失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
