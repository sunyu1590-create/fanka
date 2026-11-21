import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": { ext: "webp", magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};

type CoverMeta = { focusX: number; focusY: number; zoom: number; ratio: number; collapsedHeight: number };

function sanitizeMeta(value: unknown): CoverMeta {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const clamp = (input: unknown, min: number, max: number, fallback: number) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  return {
    focusX: Math.round(clamp(source.focusX, 0, 100, 50)),
    focusY: Math.round(clamp(source.focusY, 0, 100, 50)),
    zoom: Math.round(clamp(source.zoom, 1, 3, 1) * 100) / 100,
    ratio: Math.round(clamp(source.ratio, 0.2, 5, 16 / 9) * 1000) / 1000,
    collapsedHeight: Math.round(clamp(source.collapsedHeight, 120, 260, 176)),
  };
}

/** 上传个人封面原图。保留完整画面，取景参数单独存 cover_meta。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const form = await req.formData() as unknown as { get: (name: string) => unknown };
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择一张封面图片");
    const spec = TYPES[file.type];
    if (!spec) throw new ApiError(400, "封面只支持 JPEG、PNG 或 WebP 图片");
    if (file.size < 1 || file.size > 12 * 1024 * 1024) throw new ApiError(413, "封面图片不能超过 12 MB");
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!spec.magic(bytes)) throw new ApiError(400, "图片格式与文件内容不一致");

    const meta = sanitizeMeta(typeof form.get("meta") === "string" ? JSON.parse(String(form.get("meta")) || "{}") : {});
    const path = `${user!.id}/cover/${randomUUID()}.${spec.ext}`;
    const uploaded = await db.storage.from("heika-decor").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    dbError(uploaded.error);
    const { data: publicUrl } = db.storage.from("heika-decor").getPublicUrl(path);

    const { data: current } = await db.from("profiles").select("cover_url").eq("id", user!.id).maybeSingle();
    const { data, error } = await db.from("profiles").update({ cover_url: publicUrl.publicUrl, cover_meta: meta }).eq("id", user!.id)
      .select("id,cover_url,cover_meta").single();
    if (error) {
      await db.storage.from("heika-decor").remove([path]);
      dbError(error);
    }
    if (current?.cover_url) {
      try {
        const oldUrl = new URL(current.cover_url);
        const marker = "/storage/v1/object/public/heika-decor/";
        const index = oldUrl.pathname.indexOf(marker);
        if (index >= 0) {
          const oldPath = decodeURIComponent(oldUrl.pathname.slice(index + marker.length));
          if (oldPath.startsWith(`${user!.id}/cover/`) && oldPath !== path) await db.storage.from("heika-decor").remove([oldPath]);
        }
      } catch { /* 外部或历史地址不动 */ }
    }
    return data;
  });
}

/** 仅更新取景参数（拖动 / 缩放后不用重新上传图片）。 */
export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const { data, error } = await db.from("profiles").update({ cover_meta: sanitizeMeta(body.meta) }).eq("id", user!.id)
      .select("id,cover_url,cover_meta").single();
    dbError(error);
    return data;
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: current } = await db.from("profiles").select("cover_url").eq("id", user!.id).maybeSingle();
    const { data, error } = await db.from("profiles").update({ cover_url: null, cover_meta: {} }).eq("id", user!.id)
      .select("id,cover_url,cover_meta").single();
    dbError(error);
    if (current?.cover_url) {
      try {
        const oldUrl = new URL(current.cover_url);
        const marker = "/storage/v1/object/public/heika-decor/";
        const index = oldUrl.pathname.indexOf(marker);
        if (index >= 0) {
          const oldPath = decodeURIComponent(oldUrl.pathname.slice(index + marker.length));
          if (oldPath.startsWith(`${user!.id}/cover/`)) await db.storage.from("heika-decor").remove([oldPath]);
        }
      } catch { /* ignore */ }
    }
    return data;
  });
}
