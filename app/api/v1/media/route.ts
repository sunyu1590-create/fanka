import { NextRequest, NextResponse } from "next/server";
import { context, respond, ApiError, dbError, uuid } from "@/lib/server/api";
import { mediaBucketForPath } from "@/lib/media-path";
import { createMediaThumbnails } from "@/lib/server/media-thumbnails";

const validImage = async (file: File) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024 || !file.size) throw new ApiError(400, "仅支持不超过 4 MB 的 JPG、PNG、WebP 图片");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/jpeg" && jpg || file.type === "image/png" && png || file.type === "image/webp" && webp)) throw new ApiError(400, "图片内容与格式不符");
};

const imagePaths = (path: string) => {
  const match = path.match(/^(.*\/)([^/]+)\.(jpg|png|webp)$/i);
  if (!match) throw new ApiError(400, "图片路径无效");
  const [, folder, basename] = match;
  return { original: path, thumbnail: `${folder}${basename}-480.webp`, retina: `${folder}${basename}-960.webp` };
};
const validMediaPath = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(?:480|960))?\.(?:jpg|png|webp|mp4|webm)$/i;

async function findMedia(db: Awaited<ReturnType<typeof context>>["db"], path: string) {
  if (!validMediaPath.test(path)) throw new ApiError(400, "媒体路径无效");
  const { data, error } = await db.from("post_media")
    .select("post_id,posts!inner(status)")
    .or(`storage_path.eq.${path},thumbnail_path.eq.${path},retina_thumbnail_path.eq.${path}`)
    .maybeSingle();
  dbError(error);
  return data;
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("redirect") === "1") {
    try {
      const { db } = await context(req, false);
      const path = req.nextUrl.searchParams.get("path") || "";
      const media = await findMedia(db, path);
      if (!media) throw new ApiError(404, "媒体不存在");
      const { data, error } = await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path, 3600);
      dbError(error);
      if (!data?.signedUrl) throw new ApiError(404, "媒体不存在");
      return NextResponse.redirect(data.signedUrl, 302);
    } catch (error) {
      return NextResponse.json({ error: error instanceof ApiError ? error.message : "媒体加载失败" }, { status: error instanceof ApiError ? error.status : 500 });
    }
  }
  return respond(async () => {
    const { db } = await context(req, false);
    const path = req.nextUrl.searchParams.get("path") || "";
    const media = await findMedia(db, path);
    if (!media) throw new ApiError(404, "媒体不存在");
    const { data, error } = await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path, 3600);
    dbError(error);
    return { url: data?.signedUrl, expires_in: 3600 };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const form = await req.formData() as unknown as { get: (name: string) => unknown; has: (name: string) => boolean };
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择图片");
    await validImage(file);
    const revisionMode = form.has("revision_post_id");
    const postId = uuid(revisionMode ? form.get("revision_post_id") : form.get("post_id"), revisionMode ? "内容" : "草稿");
    const uploadId = uuid(form.get("upload_id"), "上传编号");
    const sortOrder = Number(form.get("sort_order") || 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 8) throw new ApiError(400, "图片顺序无效");
    const { data: post, error: postError } = await db.from("posts").select("id,status").eq("id", postId).eq("author_id", user!.id).single();
    dbError(postError);
    if (!post || (revisionMode ? post.status !== "published" : !["draft", "pending_review", "published", "hidden"].includes(post.status))) throw new ApiError(403, "无权为此内容上传图片");

    const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const paths = imagePaths(`${user!.id}/${uploadId}.${ext}`);
    const { data: linked, error: linkedError } = await db.from("post_media").select("post_id,thumbnail_path,retina_thumbnail_path").eq("storage_path", paths.original).maybeSingle();
    dbError(linkedError);
    if (revisionMode && linked) throw new ApiError(409, "图片已关联公开内容，请重新选择后再上传");
    if (linked?.post_id && linked.post_id !== postId) throw new ApiError(409, "该图片已关联其他内容");
    if (linked?.post_id === postId && linked.thumbnail_path && linked.retina_thumbnail_path) {
      const { error } = await db.from("post_media").update({ sort_order: sortOrder }).eq("post_id", postId).eq("storage_path", paths.original);
      dbError(error);
      return { path: paths.original, thumbnail_path: linked.thumbnail_path, retina_thumbnail_path: linked.retina_thumbnail_path };
    }
    if (!revisionMode && !linked) {
      const { count, error: countError } = await db.from("post_media").select("id", { count: "exact", head: true }).eq("post_id", postId);
      dbError(countError);
      if ((count || 0) >= 9) throw new ApiError(400, "一篇内容最多添加 9 张图片");
    }

    const source = Buffer.from(await file.arrayBuffer());
    let thumbnail: Buffer;
    let retina: Buffer;
    try {
      ({ thumbnail, retina } = await createMediaThumbnails(source));
    } catch {
      throw new ApiError(400, "图片无法解码，请重新选择 JPG、PNG 或 WebP 图片");
    }
    const uploads = await Promise.all([
      ...(linked ? [] : [db.storage.from("post-covers").upload(paths.original, source, { contentType: file.type, upsert: true, cacheControl: "31536000" })]),
      db.storage.from("post-covers").upload(paths.thumbnail, thumbnail, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
      db.storage.from("post-covers").upload(paths.retina, retina, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
    ]);
    const failedUpload = uploads.find((upload) => upload.error);
    if (failedUpload?.error) dbError(failedUpload.error);
    if (revisionMode) return { path: paths.original, thumbnail_path: paths.thumbnail, retina_thumbnail_path: paths.retina };

    const mediaValues = { thumbnail_path: paths.thumbnail, retina_thumbnail_path: paths.retina, sort_order: sortOrder };
    if (linked?.post_id === postId) {
      const { error } = await db.from("post_media").update(mediaValues).eq("post_id", postId).eq("storage_path", paths.original);
      dbError(error);
    } else {
      const { error: linkError } = await db.from("post_media").insert({ post_id: postId, storage_path: paths.original, ...mediaValues });
      if (linkError) {
        const { data: retryLink } = await db.from("post_media").select("post_id").eq("storage_path", paths.original).maybeSingle();
        if (retryLink?.post_id === postId) {
          const { error } = await db.from("post_media").update(mediaValues).eq("post_id", postId).eq("storage_path", paths.original);
          dbError(error);
        } else dbError(linkError);
      }
    }
    return { path: paths.original, thumbnail_path: paths.thumbnail, retina_thumbnail_path: paths.retina };
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw new ApiError(400, "请求内容无效"); }
    const uploadId = uuid(body.upload_id, "上传编号");
    const type = String(body.file_type || "");
    const imageExt = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : null;
    const videoExt = type === "video/mp4" ? "mp4" : type === "video/webm" ? "webm" : null;
    const ext = imageExt || videoExt;
    if (!ext) throw new ApiError(400, "媒体格式无效");
    const path = `${user!.id}/${uploadId}.${ext}`;
    const bucket = mediaBucketForPath(path);
    const postId = body.post_id ? uuid(body.post_id, "草稿") : null;
    const { data: linked, error: linkedError } = await db.from("post_media").select("post_id,thumbnail_path,retina_thumbnail_path").eq("storage_path", path).maybeSingle();
    dbError(linkedError);
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
    return { removed: true };
  });
}
