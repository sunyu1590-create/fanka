import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { mediaBucketForPath, isVideoMediaPath } from "@/lib/media-path";

export type MediaAssetRow = {
  id: string;
  user_id: string;
  upload_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  retina_thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  mime_type: string | null;
  checksum_sha256: string | null;
  status: string;
  post_id: string | null;
};

/** 命名约定派生的变体路径（与 lib/server/library.ts 的 mediaVariantPath 一致）。 */
export function derivedVariantPaths(path: string): { thumbnail: string; retina: string } | null {
  if (isVideoMediaPath(path)) return null;
  const match = path.match(/^(.*\/)([^/]+)\.(jpg|jpeg|png|webp|gif)$/i);
  if (!match) return null;
  const [, folder, basename] = match;
  return { thumbnail: `${folder}${basename}-480.webp`, retina: `${folder}${basename}-960.webp` };
}

export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * 媒体完整性校验：对象真实存在 + 大小一致。
 * 不依赖 createSignedUrl 的计数比对（storage-api 对不存在对象也可能签出 URL），
 * 走 storage.list 拿真实元数据，与附件链路（lib/server/post-attachments.ts）同强度。
 */
export async function verifyStoredMedia(
  db: SupabaseClient,
  paths: readonly string[],
): Promise<{ ok: boolean; missing: string[]; sizeMismatch: string[]; details: Map<string, { size: number }> }> {
  const missing: string[] = [];
  const sizeMismatch: string[] = [];
  const details = new Map<string, { size: number }>();
  const byBucket = new Map<string, string[]>();
  for (const path of [...new Set(paths)]) {
    const bucket = mediaBucketForPath(path);
    byBucket.set(bucket, [...(byBucket.get(bucket) || []), path]);
  }
  for (const [bucket, bucketPaths] of byBucket) {
    // storage.list(prefix) 按「目录」列举；逐条按目录批量取后精确匹配。
    const byFolder = new Map<string, string[]>();
    for (const path of bucketPaths) {
      const idx = path.lastIndexOf("/");
      const folder = idx >= 0 ? path.slice(0, idx) : "";
      const name = idx >= 0 ? path.slice(idx + 1) : path;
      byFolder.set(folder, [...(byFolder.get(folder) || []), name]);
    }
    for (const [folder, names] of byFolder) {
      const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000 });
      if (error) {
        for (const name of names) missing.push(folder ? `${folder}/${name}` : name);
        continue;
      }
      const found = new Map((data || []).map((item) => [item.name, item]));
      for (const name of names) {
        const full = folder ? `${folder}/${name}` : name;
        const item = found.get(name);
        if (!item) {
          missing.push(full);
          continue;
        }
        const size = Number((item.metadata as { size?: number } | null)?.size ?? 0);
        details.set(full, { size });
      }
    }
  }
  return { ok: missing.length === 0 && sizeMismatch.length === 0, missing, sizeMismatch, details };
}

export type UpsertMediaAssetInput = {
  userId: string;
  uploadId: string;
  storagePath: string;
  thumbnailPath: string | null;
  retinaPath: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  mimeType: string;
  checksum: string;
  clientType?: string | null;
  clientVersion?: string | null;
};

/** 上传完成后登记/更新媒体资产（幂等，按 storage_path 或 user+upload_id 命中）。 */
export async function upsertMediaAsset(db: SupabaseClient, input: UpsertMediaAssetInput) {
  const values = {
    user_id: input.userId,
    upload_id: input.uploadId,
    storage_path: input.storagePath,
    thumbnail_path: input.thumbnailPath,
    retina_thumbnail_path: input.retinaPath,
    width: input.width,
    height: input.height,
    byte_size: input.byteSize,
    mime_type: input.mimeType,
    checksum_sha256: input.checksum,
    status: "verified",
    client_type: input.clientType || null,
    client_version: input.clientVersion || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("media_assets").upsert(values, { onConflict: "storage_path" });
  return { error };
}

/**
 * 发布/保存时重建 post_media 行：保留缩略图路径与像素尺寸。
 *
 * 历史缺陷：发布只回写 storage_path/thumbnail 三列，staging 图的缩略图与宽高
 * 全部被清空，导致缩略图路由 404、详情页高度错位。这里统一从 media_assets
 * 「认领」元数据，缺失时按命名约定派生缩略图路径，宽高退回上一行或 null。
 * 同时用 storage.list 核验对象真实落盘（不信 createSignedUrl 的计数）。
 */
export async function rebuildPostMedia(
  db: SupabaseClient,
  userId: string,
  postId: string,
  mediaPaths: readonly string[],
): Promise<{ error: { message: string; code?: string } | null; verified: boolean; missing: string[] }> {
  const paths = [...new Set(mediaPaths)];
  const images = paths.filter((path) => !isVideoMediaPath(path));
  const verifyTargets = images.flatMap((path) => {
    const derived = derivedVariantPaths(path);
    return derived ? [path, derived.thumbnail, derived.retina] : [path];
  });
  const verify = await verifyStoredMedia(db, verifyTargets);
  const { rows: assetRows, error: claimError } = await claimMediaAssets(db, userId, postId, images);
  if (claimError) return { error: claimError as { message: string; code?: string }, verified: false, missing: verify.missing };

  const previous = await db.from("post_media").select("storage_path,thumbnail_path,retina_thumbnail_path,width,height").eq("post_id", postId);
  if (previous.error) return { error: previous.error as { message: string; code?: string }, verified: false, missing: verify.missing };
  const previousByPath = new Map((previous.data || []).map((item) => [item.storage_path, item]));
  const { error: clearError } = await db.from("post_media").delete().eq("post_id", postId);
  if (clearError) return { error: clearError as { message: string; code?: string }, verified: false, missing: verify.missing };

  if (paths.length) {
    const rows = paths.map((storage_path, sort_order) => {
      if (isVideoMediaPath(storage_path)) return { post_id: postId, storage_path, sort_order };
      const asset = assetRows.get(storage_path);
      const prev = previousByPath.get(storage_path);
      const derived = derivedVariantPaths(storage_path);
      return {
        post_id: postId,
        storage_path,
        sort_order,
        thumbnail_path: asset?.thumbnail_path || prev?.thumbnail_path || derived?.thumbnail || null,
        retina_thumbnail_path: asset?.retina_thumbnail_path || prev?.retina_thumbnail_path || derived?.retina || null,
        width: asset?.width ?? prev?.width ?? null,
        height: asset?.height ?? prev?.height ?? null,
      };
    });
    const { error: insertError } = await db.from("post_media").insert(rows);
    if (insertError) return { error: insertError as { message: string; code?: string }, verified: false, missing: verify.missing };
  }
  return { error: null as { message: string; code?: string } | null, verified: verify.ok, missing: verify.missing };
}

/**
 * 发布时「认领」媒体资产：把 verified 未挂接的 staging 对象挂到 post 上，
 * 并返回可用于 post_media 行的完整元数据（缩略图路径 + 宽高）。
 */
export async function claimMediaAssets(
  db: SupabaseClient,
  userId: string,
  postId: string,
  paths: readonly string[],
): Promise<{ rows: Map<string, { thumbnail_path: string | null; retina_thumbnail_path: string | null; width: number | null; height: number | null }>; error: { message: string; code?: string } | null }> {
  const rows = new Map<string, { thumbnail_path: string | null; retina_thumbnail_path: string | null; width: number | null; height: number | null }>();
  const { data, error } = await db
    .from("media_assets")
    .select("storage_path,thumbnail_path,retina_thumbnail_path,width,height,user_id,status")
    .in("storage_path", [...new Set(paths)]);
  if (error) return { rows, error: error as { message: string; code?: string } };
  for (const item of data || []) {
    if (item.user_id !== userId) continue;
    rows.set(item.storage_path, {
      thumbnail_path: item.thumbnail_path,
      retina_thumbnail_path: item.retina_thumbnail_path,
      width: item.width,
      height: item.height,
    });
  }
  const claimable = (data || []).filter((item) => item.user_id === userId && (!item.status || item.status === "verified")).map((item) => item.storage_path);
  if (claimable.length) {
    const { error: claimError } = await db
      .from("media_assets")
      .update({ status: "claimed", post_id: postId, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("storage_path", claimable)
      .eq("user_id", userId);
    if (claimError) return { rows, error: claimError as { message: string; code?: string } };
  }
  return { rows, error: null as { message: string; code?: string } | null };
}
