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

/** 校验封面资源归属：只允许引用自己 cover/ 目录下的对象，杜绝越权指定他人资源。 */
function ownCoverPath(value: unknown, userId: string): string {
  const path = typeof value === "string" ? value : "";
  if (!path.startsWith(`${userId}/cover/`) || path.includes("..") || !/^[A-Za-z0-9/._-]+$/.test(path)) {
    throw new ApiError(400, "封面资源无效");
  }
  return path;
}

/** 从历史封面地址里还原对象路径；外部地址返回 null（不动）。 */
function coverPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const marker = "/storage/v1/object/public/heika-decor/";
    const index = new URL(url).pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(new URL(url).pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

/** 清理被替换/删除的旧封面文件。必须传入更新「之前」读到的旧地址。 */
async function removeStaleCover(db: Awaited<ReturnType<typeof context>>["db"], userId: string, oldUrl: string | null | undefined, keepPath: string | null) {
  const oldPath = coverPathFromUrl(oldUrl);
  if (oldPath && oldPath.startsWith(`${userId}/cover/`) && oldPath !== keepPath) {
    try { await db.storage.from("heika-decor").remove([oldPath]); } catch { /* 清理失败不影响保存结果 */ }
  }
}

/**
 * 上传封面原图（阶段：图片处理 → 上传）。
 * 只写存储并返回资源标识，不写资料——资料保存在 PUT 里单独进行，
 * 上传成功后保存失败时客户端可复用资源重试，不重复上传（需求 6.3）。
 */
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
    return { cover_url: publicUrl.publicUrl, path, cover_meta: meta };
  });
}

/**
 * 读取封面元数据（不返回图片本身）。
 * 客户端用它和本地缓存做版本比较：云端版本较新才重新下载，
 * 网络异常时继续用本地缓存，不会把旧图反向写回云端。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data, error } = await db
      .from("profiles")
      .select("cover_url,cover_meta,cover_version,cover_updated_at")
      .eq("id", user!.id)
      .maybeSingle();
    dbError(error);
    return {
      cover_url: data?.cover_url ?? null,
      cover_meta: data?.cover_meta ?? {},
      cover_version: Number(data?.cover_version || 0),
      cover_updated_at: data?.cover_updated_at ?? null,
    };
  });
}

/** 保存资料（阶段：保存资料）：把已上传的封面资源写入 profiles。失败时资源保留，可原样重试。 */
export async function PUT(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const path = ownCoverPath(body.path, user!.id);
    const meta = sanitizeMeta(body.meta);
    const { data: publicUrl } = db.storage.from("heika-decor").getPublicUrl(path);
    const { data: current } = await db.from("profiles").select("cover_url,cover_version").eq("id", user!.id).maybeSingle();
    // 换图即递增版本：客户端据此判断本地缓存是否过期，避免旧图长期残留。
    const nextVersion = Math.max(0, Number(current?.cover_version || 0)) + 1;
    const { data, error } = await db.from("profiles").update({
      cover_url: publicUrl.publicUrl,
      cover_meta: meta,
      cover_version: nextVersion,
      cover_updated_at: new Date().toISOString(),
    }).eq("id", user!.id)
      .select("id,cover_url,cover_meta,cover_version,cover_updated_at").single();
    // 保存失败不清除已上传资源：客户端保留 path 重试 PUT 即可（需求 6.3）。
    dbError(error);
    await removeStaleCover(db, user!.id, current?.cover_url, path);
    return data;
  });
}

/** 仅更新取景参数（拖动 / 缩放后不用重新上传图片）。图片没变，版本不变。 */
export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const { data, error } = await db.from("profiles").update({ cover_meta: sanitizeMeta(body.meta) }).eq("id", user!.id)
      .select("id,cover_url,cover_meta,cover_version,cover_updated_at").single();
    dbError(error);
    return data;
  });
}

/**
 * 删除封面；带 ?path= 时只清理「已上传但未保存」的暂存图（用户取消编辑的回收）。
 */
export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const staged = req.nextUrl.searchParams.get("path");
    if (staged) {
      const path = ownCoverPath(staged, user!.id);
      try { await db.storage.from("heika-decor").remove([path]); } catch { /* 清理失败无碍 */ }
      return { cleaned: path };
    }
    const { data: current } = await db.from("profiles").select("cover_url,cover_version").eq("id", user!.id).maybeSingle();
    // 删除也是一次版本变更：本地缓存必须能识别「云端已删除」，否则旧图会重新出现。
    const nextVersion = Math.max(0, Number(current?.cover_version || 0)) + 1;
    const { data, error } = await db.from("profiles").update({
      cover_url: null,
      cover_meta: {},
      cover_version: nextVersion,
      cover_updated_at: new Date().toISOString(),
    }).eq("id", user!.id)
      .select("id,cover_url,cover_meta,cover_version,cover_updated_at").single();
    dbError(error);
    await removeStaleCover(db, user!.id, current?.cover_url, null);
    return data;
  });
}
