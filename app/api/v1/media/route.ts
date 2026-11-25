import { NextRequest, NextResponse } from "next/server";
import { context, respond, ApiError, dbError, publicStorageUrl, uuid } from "@/lib/server/api";
import { mediaBucketForPath } from "@/lib/media-path";
import { createMediaThumbnails } from "@/lib/server/media-thumbnails";
import { createFeedThumbnail } from "@/lib/server/feed-thumbnail";
import { verifyStoredMedia, upsertMediaAsset, sha256Hex } from "@/lib/server/media-assets";
import { requireFeature } from "@/lib/server/feature-flags";

export const runtime = "nodejs";

const validImage = async (file: File) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024 || !file.size) throw new ApiError(400, "仅支持不超过 4 MB 的 JPG、PNG、WebP 图片");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const gif = String.fromCharCode(...bytes.slice(0, 3)) === "GIF";
  if (!(file.type === "image/jpeg" && jpg || file.type === "image/png" && png || file.type === "image/webp" && webp || file.type === "image/gif" && gif)) throw new ApiError(400, "图片内容与格式不符");
};

const imagePaths = (path: string) => {
  const match = path.match(/^(.*\/)([^/]+)\.(jpg|png|webp|gif)$/i);
  if (!match) throw new ApiError(400, "图片路径无效");
  const [, folder, basename] = match;
  return { original: path, thumbnail: `${folder}${basename}-480.webp`, retina: `${folder}${basename}-960.webp` };
};
const validMediaPath = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(?:480|960))?\.(?:jpg|png|webp|gif|mp4|webm)$/i;

async function findMedia(db: Awaited<ReturnType<typeof context>>["db"], path: string, publishedOnly = false) {
  if (!validMediaPath.test(path)) throw new ApiError(400, "媒体路径无效");
  let query = db.from("post_media")
    .select("post_id,posts!inner(status)")
    .or(`storage_path.eq.${path},thumbnail_path.eq.${path},retina_thumbnail_path.eq.${path}`)
    .limit(1);
  if (publishedOnly) query = query.eq("posts.status", "published");
  const { data, error } = await query;
  dbError(error);
  if (data && data.length) return data[0];
  // staging 预览兜底：未挂接的媒体资产（草稿/发布任务中的图片）也要能取回，
  // 否则 staging 上传的草稿图在预览时会 404。只对鉴权读取生效，不进 feed。
  if (!publishedOnly) {
    const { data: assets, error: assetError } = await db
      .from("media_assets")
      .select("storage_path")
      .or(`storage_path.eq.${path},thumbnail_path.eq.${path},retina_thumbnail_path.eq.${path}`)
      .limit(1);
    dbError(assetError);
    if (assets && assets.length) return { post_id: assets[0].storage_path, posts: { status: "staging" } };
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("redirect") === "1") {
    try {
      const { db } = await context(req, false);
      const path = req.nextUrl.searchParams.get("path") || "";
      const variant = req.nextUrl.searchParams.get("variant");
      // card 是「卡片原图」：与不传 variant 等价，保留参数只为让缓存地址自解释；
      // 只有 feed 会走缩略图重绘，其他值一律视为非法。
      if (variant && variant !== "feed" && variant !== "card") throw new ApiError(400, "图片尺寸无效");
      const media = await findMedia(db, path, variant === "feed");
      if (!media) throw new ApiError(404, "媒体不存在");
      const { data, error } = await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path, 604800);
      dbError(error);
      if (!data?.signedUrl) throw new ApiError(404, "媒体不存在");
      if (variant === "feed") {
        try {
          const original = await fetch(data.signedUrl, { signal: AbortSignal.timeout(10000) });
          if (!original.ok) throw new Error("原图读取失败");
          const contentLength = Number(original.headers.get("content-length") || 0);
          if (contentLength > 5 * 1024 * 1024) throw new Error("原图超过处理限制");
          const bytes = Buffer.from(await original.arrayBuffer());
          if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("原图超过处理限制");
          const thumbnail = await createFeedThumbnail(bytes);
          return new NextResponse(new Uint8Array(thumbnail), {
            headers: {
              "Content-Type": "image/webp",
              "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          console.warn("[media] feed thumbnail fallback", error instanceof Error ? error.name : "unknown");
          return NextResponse.redirect(publicStorageUrl(data.signedUrl), 302);
        }
      }
      return NextResponse.redirect(publicStorageUrl(data.signedUrl), 302);
    } catch (error) {
      return NextResponse.json({ error: error instanceof ApiError ? error.message : "媒体加载失败" }, { status: error instanceof ApiError ? error.status : 500 });
    }
  }
  return respond(async () => {
    const { db } = await context(req, false);
    const path = req.nextUrl.searchParams.get("path") || "";
    const media = await findMedia(db, path);
    if (!media) throw new ApiError(404, "媒体不存在");
    const { data, error } = await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path, 604800);
    dbError(error);
    return { url: data?.signedUrl, expires_in: 604800 };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    await requireFeature("upload");
    const { db, user } = await context(req);
    const form = await req.formData() as unknown as { get: (name: string) => unknown; has: (name: string) => boolean };
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择图片");
    await validImage(file);
    const revisionMode = form.has("revision_post_id");
    const stagingMode = !revisionMode && !form.has("post_id") && form.get("staging") === "1";
    const postId = stagingMode ? null : uuid(revisionMode ? form.get("revision_post_id") : form.get("post_id"), revisionMode ? "内容" : "草稿");
    const uploadId = uuid(form.get("upload_id"), "上传编号");
    const sortOrder = Number(form.get("sort_order") || 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 8) throw new ApiError(400, "图片顺序无效");
    if (postId) {
      const { data: post, error: postError } = await db.from("posts").select("id,status").eq("id", postId).eq("author_id", user!.id).single();
      dbError(postError);
      if (!post || (revisionMode ? post.status !== "published" : !["draft", "pending_review", "published", "hidden"].includes(post.status))) throw new ApiError(403, "无权为此内容上传图片");
    }

    const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : file.type === "image/gif" ? "gif" : "webp";
    const paths = imagePaths(`${user!.id}/${uploadId}.${ext}`);
    const { data: linked, error: linkedError } = await db.from("post_media").select("post_id,thumbnail_path,retina_thumbnail_path,width,height").eq("storage_path", paths.original).maybeSingle();
    dbError(linkedError);
    if ((revisionMode || stagingMode) && linked) throw new ApiError(409, "图片已关联其他内容，请重新选择后再上传");
    if (linked?.post_id && linked.post_id !== postId) throw new ApiError(409, "该图片已关联其他内容");
    if (linked?.post_id === postId && linked.thumbnail_path && linked.retina_thumbnail_path) {
      const { error } = await db.from("post_media").update({ sort_order: sortOrder }).eq("post_id", postId).eq("storage_path", paths.original);
      dbError(error);
      return { path: paths.original, thumbnail_path: linked.thumbnail_path, retina_thumbnail_path: linked.retina_thumbnail_path, width: linked.width, height: linked.height };
    }
    if (postId && !revisionMode && !stagingMode && !linked) {
      const { count, error: countError } = await db.from("post_media").select("id", { count: "exact", head: true }).eq("post_id", postId);
      dbError(countError);
      if ((count || 0) >= 9) throw new ApiError(400, "一篇内容最多添加 9 张图片");
    }

    const source = Buffer.from(await file.arrayBuffer());
    const checksum = sha256Hex(source);
    let thumbnail: Buffer;
    let retina: Buffer;
    // 尺寸随缩略图一起落库：详情页拿到列表数据就能预留图片高度，不必等图片下载完。
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;
    try {
      ({ thumbnail, retina, width: imageWidth, height: imageHeight } = await createMediaThumbnails(source));
    } catch {
      throw new ApiError(400, "图片无法解码，请重新选择 JPG、PNG 或 WebP 图片");
    }
    const sizeValues = imageWidth && imageHeight ? { width: imageWidth, height: imageHeight } : {};
    const uploads = await Promise.all([
      ...(linked ? [] : [db.storage.from("post-covers").upload(paths.original, source, { contentType: file.type, upsert: true, cacheControl: "31536000" })]),
      db.storage.from("post-covers").upload(paths.thumbnail, thumbnail, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
      db.storage.from("post-covers").upload(paths.retina, retina, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
    ]);
    const failedUpload = uploads.find((upload) => upload.error);
    if (failedUpload?.error) dbError(failedUpload.error);

    // ---- 完整性校验：对象真实落盘才算上传完成（不以 HTTP 200 充当成功）----
    const verify = await verifyStoredMedia(db, [paths.original, paths.thumbnail, paths.retina]);
    const clientType = typeof form.get("client_type") === "string" ? String(form.get("client_type")).slice(0, 32) : null;
    const clientVersion = typeof form.get("client_version") === "string" ? String(form.get("client_version")).slice(0, 32) : null;
    const taskKey = typeof form.get("task_key") === "string" ? String(form.get("task_key")).slice(0, 120) : `${user!.id}:${uploadId}`;
    const nowIso = new Date().toISOString();
    if (!verify.ok) {
      await db.from("upload_tasks").upsert({
        user_id: user!.id, task_key: taskKey, media_upload_id: uploadId, post_id: postId,
        file_name: file.name || null, file_size: file.size, mime_type: file.type,
        client_type: clientType, client_version: clientVersion,
        status: "failed", progress: 100, bytes_sent: file.size, attempts: 1,
        error_code: "verify_failed", error_message: `存储对象缺失: ${verify.missing.join(", ")}`,
        storage_path: paths.original, checksum_sha256: checksum, verify_result: "missing_object",
        started_at: nowIso, finished_at: nowIso, updated_at: nowIso,
      }, { onConflict: "user_id,task_key" });
      throw new ApiError(502, "图片存储校验失败，请重试");
    }
    const { error: assetError } = await upsertMediaAsset(db, {
      userId: user!.id, uploadId, storagePath: paths.original,
      thumbnailPath: paths.thumbnail, retinaPath: paths.retina,
      width: imageWidth, height: imageHeight,
      byteSize: file.size, mimeType: file.type, checksum,
      clientType, clientVersion,
    });
    dbError(assetError);
    await db.from("upload_tasks").upsert({
      user_id: user!.id, task_key: taskKey, media_upload_id: uploadId, post_id: postId,
      file_name: file.name || null, file_size: file.size, mime_type: file.type,
      client_type: clientType, client_version: clientVersion,
      status: "ready", progress: 100, bytes_sent: file.size, attempts: 1,
      storage_path: paths.original, checksum_sha256: checksum, verify_result: "ok",
      started_at: nowIso, finished_at: nowIso, duration_ms: null,
      updated_at: nowIso,
    }, { onConflict: "user_id,task_key" });

    const result = { path: paths.original, thumbnail_path: paths.thumbnail, retina_thumbnail_path: paths.retina, ...sizeValues, verified: true, checksum_sha256: checksum, byte_size: file.size };
    if (revisionMode) return result;
    // Save selected media as an authenticated, unlinked object. The publish API
    // attaches it only when the user submits the content.
    if (stagingMode) return { ...result, staged: true };
    const linkedPostId = postId;
    if (!linkedPostId) throw new ApiError(400, "内容编号无效");

    const mediaValues = { thumbnail_path: paths.thumbnail, retina_thumbnail_path: paths.retina, sort_order: sortOrder, ...sizeValues };
    if (linked?.post_id === linkedPostId) {
      const { error } = await db.from("post_media").update(mediaValues).eq("post_id", linkedPostId).eq("storage_path", paths.original);
      dbError(error);
    } else {
      const { error: linkError } = await db.from("post_media").insert({ post_id: linkedPostId, storage_path: paths.original, ...mediaValues });
      if (linkError) {
        const { data: retryLink } = await db.from("post_media").select("post_id").eq("storage_path", paths.original).maybeSingle();
        if (retryLink?.post_id === linkedPostId) {
          const { error } = await db.from("post_media").update(mediaValues).eq("post_id", linkedPostId).eq("storage_path", paths.original);
          dbError(error);
        } else dbError(linkError);
      }
    }
    return { path: paths.original, thumbnail_path: paths.thumbnail, retina_thumbnail_path: paths.retina, ...sizeValues, verified: true, checksum_sha256: checksum, byte_size: file.size };
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw new ApiError(400, "请求内容无效"); }
    const uploadId = uuid(body.upload_id, "上传编号");
    const type = String(body.file_type || "");
    const imageExt = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/gif" ? "gif" : null;
    const videoExt = type === "video/mp4" ? "mp4" : type === "video/webm" ? "webm" : null;
    const ext = imageExt || videoExt;
    if (!ext) throw new ApiError(400, "媒体格式无效");
    const path = `${user!.id}/${uploadId}.${ext}`;
    const bucket = mediaBucketForPath(path);
    const postId = body.post_id ? uuid(body.post_id, "草稿") : null;
    const { data: linked, error: linkedError } = await db.from("post_media").select("post_id,thumbnail_path,retina_thumbnail_path").eq("storage_path", path).maybeSingle();
    dbError(linkedError);
    if (linked?.post_id) {
      const { data: linkedPost, error: linkedPostError } = await db.from("posts").select("status").eq("id", linked.post_id).eq("author_id", user!.id).maybeSingle();
      dbError(linkedPostError);
      if (linkedPost?.status === "published") throw new ApiError(409, "已发布作品的图片不能作为草稿资源删除");
    }
    if (linked?.post_id && postId !== linked.post_id) throw new ApiError(403, "图片与草稿不匹配");
    if (postId && !linked) {
      const { data: post, error } = await db.from("posts").select("id").eq("id", postId).eq("author_id", user!.id).maybeSingle();
      dbError(error);
      if (!post) throw new ApiError(403, "无权清理此草稿图片");
    }
    const paths = imageExt ? imagePaths(path) : { original: path, thumbnail: null, retina: null };
    const storedPaths = [paths.original, paths.thumbnail, paths.retina, linked?.thumbnail_path, linked?.retina_thumbnail_path].filter((item): item is string => Boolean(item));
    const { error: storageError } = await db.storage.from(bucket).remove([...new Set(storedPaths)]);
    dbError(storageError);
    if (linked) {
      const { error } = await db.from("post_media").delete().eq("post_id", linked.post_id).eq("storage_path", path);
      dbError(error);
    }
    // 清理媒体资产登记，避免删除后仍被 staging 预览命中。
    await db.from("media_assets").delete().eq("storage_path", path).eq("user_id", user!.id);
    return { removed: true };
  });
}
