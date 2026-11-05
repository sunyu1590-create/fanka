import { NextRequest, NextResponse } from "next/server";
import { context, respond, ApiError, dbError, uuid } from "@/lib/server/api";
import { mediaBucketForPath } from "@/lib/media-path";

const validImage = async (file: File) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024 || !file.size) throw new ApiError(400, "仅支持不超过 4 MB 的 JPG、PNG、WebP 图片");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/jpeg" && jpg || file.type === "image/png" && png || file.type === "image/webp" && webp)) throw new ApiError(400, "图片内容与格式不符");
};

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("redirect") === "1") {
    try {
      const { db } = await context(req, false);
      const path = req.nextUrl.searchParams.get("path");
      if (!path || path.length > 300 || path.includes("..")) throw new ApiError(400, "图片路径无效");
      const { data: media, error: mediaError } = await db.from("post_media").select("post_id,posts!inner(status)").eq("storage_path", path).single();
      dbError(mediaError);
      if (!media) throw new ApiError(404, "图片不存在");
      const { data, error } = await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path, 600);
      dbError(error);
      if (!data?.signedUrl) throw new ApiError(404, "图片不存在");
      return NextResponse.redirect(data.signedUrl, 302);
    } catch (error) {
      return NextResponse.json({ error: error instanceof ApiError ? error.message : "图片加载失败" }, { status: error instanceof ApiError ? error.status : 500 });
    }
  }
  return respond(async () => {
    const { db } = await context(req, false);
    const path = req.nextUrl.searchParams.get("path");
    if (!path || path.length > 300 || path.includes("..")) throw new ApiError(400, "图片路径无效");
    const { data: media, error: mediaError } = await db.from("post_media").select("post_id,posts!inner(status)").eq("storage_path", path).single();
    dbError(mediaError);
    if (!media) throw new ApiError(404, "图片不存在");
    const { data, error } = await db.storage.from(mediaBucketForPath(path)).createSignedUrl(path, 600);
    dbError(error);
    return { url: data?.signedUrl, expires_in: 600 };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const form = await req.formData();
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
    const path = `${user!.id}/${uploadId}.${ext}`;
    const { data: linked, error: linkedError } = await db.from("post_media").select("post_id").eq("storage_path", path).maybeSingle();
    dbError(linkedError);
    if (revisionMode && linked) throw new ApiError(409, "图片已关联公开内容，请重新选择后再上传");
    if (!revisionMode && linked?.post_id && linked.post_id !== postId) throw new ApiError(409, "该图片已关联其他内容");
    if (!revisionMode && linked?.post_id === postId) {
      const { error } = await db.from("post_media").update({ sort_order: sortOrder }).eq("post_id", postId).eq("storage_path", path);
      dbError(error);
      return { path };
    }
    if (!revisionMode) {
      const { count, error: countError } = await db.from("post_media").select("id", { count: "exact", head: true }).eq("post_id", postId);
      dbError(countError);
      if ((count || 0) >= 9) throw new ApiError(400, "一篇内容最多添加 9 张图片");
    }
    const folder = await db.storage.from("post-covers").list(user!.id, { search: `${uploadId}.${ext}`, limit: 10 });
    dbError(folder.error);
    const exists = (folder.data || []).some((item) => item.name === `${uploadId}.${ext}`);
    if (!exists) {
      const { error: uploadError } = await db.storage.from("post-covers").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) dbError(uploadError);
    }
    if (revisionMode) return { path };
    const { error: linkError } = await db.from("post_media").insert({ post_id: postId, storage_path: path, sort_order: sortOrder });
    if (linkError) {
      const { data: retryLink } = await db.from("post_media").select("post_id").eq("storage_path", path).maybeSingle();
      if (retryLink?.post_id === postId) return { path };
      dbError(linkError);
    }
    return { path };
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
    const { data: linked, error: linkedError } = await db.from("post_media").select("post_id").eq("storage_path", path).maybeSingle();
    dbError(linkedError);
    if (linked?.post_id && postId !== linked.post_id) throw new ApiError(403, "图片与草稿不匹配");
    if (postId && !linked) {
      const { data: post, error } = await db.from("posts").select("id").eq("id", postId).eq("author_id", user!.id).maybeSingle();
      dbError(error);
      if (!post) throw new ApiError(403, "无权清理此草稿图片");
    }
    const { error: storageError } = await db.storage.from(bucket).remove([path]);
    dbError(storageError);
    if (linked) {
      const { error } = await db.from("post_media").delete().eq("post_id", linked.post_id).eq("storage_path", path);
      dbError(error);
    }
    return { removed: true };
  });
}
