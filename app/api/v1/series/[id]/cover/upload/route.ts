import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, context, uuid } from "@/lib/server/api";
import { assertSeriesEditor, normalizeUploadedImage } from "@/lib/server/series-cover-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP",
};

/**
 * 自定义封面上传（暂存）。
 * 上传即统一裁成 3:4 并转 PNG，用户在编辑器里看到的预览与最终封面完全一致。
 * 未保存就离开的暂存图会在保存/取消时清理，不会被任何合集引用。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await context(req);
    const { id } = await params;
    const seriesId = uuid(id, "合集编号");
    await assertSeriesEditor(db, user!.id, seriesId);

    const form = await req.formData() as unknown as { get: (name: string) => unknown };
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择封面图片");
    const validator = TYPES[file.type];
    if (!validator) throw new ApiError(400, "封面仅支持 JPG、PNG、WebP");
    if (file.size < 1 || file.size > MAX_BYTES) throw new ApiError(413, "封面图片不能超过 10 MB");
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!validator(head)) throw new ApiError(400, "图片格式与文件内容不一致");

    const source = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeUploadedImage(source);
    const path = `${seriesId}/upload-${randomUUID()}.png`;
    const admin = adminClient();
    const upload = await admin.storage.from("series-covers").upload(path, normalized, { contentType: "image/png", upsert: false, cacheControl: "3600" });
    if (upload.error) throw new ApiError(502, `上传失败：${upload.error.message}`);

    const { data: publicUrl } = admin.storage.from("series-covers").getPublicUrl(path);
    return NextResponse.json({ data: { path, url: publicUrl.publicUrl, width: 600, height: 800, byte_size: normalized.byteLength } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[series-cover:upload]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "上传失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

/** 取消编辑时回收暂存资源。 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await context(req);
    const { id } = await params;
    const seriesId = uuid(id, "合集编号");
    await assertSeriesEditor(db, user!.id, seriesId);
    const path = req.nextUrl.searchParams.get("path") || "";
    if (!path.startsWith(`${seriesId}/upload-`) || path.includes("..")) throw new ApiError(400, "暂存资源无效");
    await adminClient().storage.from("series-covers").remove([path]).catch(() => null);
    return NextResponse.json({ data: { cleaned: path } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[series-cover:upload-delete]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "清理失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
