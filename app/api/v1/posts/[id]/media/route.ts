import { NextRequest } from "next/server";
import { context, jsonBody, textField, uuid, dbError, respond, ApiError } from "@/lib/server/api";
import { mediaBucketForPath, isVideoMediaPath } from "@/lib/media-path";

const allowedImagePath = (path: string) => /\.(?:jpg|png|webp)$/i.test(path);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const id = uuid((await params).id);
    const path = textField(body.path, "媒体路径", 1, 300);
    if (!path.startsWith(`${user!.id}/`) || path.includes("..")) throw new ApiError(403, "媒体不属于当前用户");
    const video = isVideoMediaPath(path);
    if (video && process.env.NEXT_PUBLIC_VIDEO_UPLOAD_BETA !== "1") throw new ApiError(404, "视频上传 Beta 暂未开放");
    if (!video && !allowedImagePath(path)) throw new ApiError(400, "媒体格式无效");
    if (body.media_type && body.media_type !== (video ? "video" : "image")) throw new ApiError(400, "媒体类型与文件格式不符");
    const sortOrder = Number(body.sort_order || 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9) throw new ApiError(400, "媒体顺序无效");

    const { data: post, error: postError } = await db.from("posts").select("id,status").eq("id", id).eq("author_id", user!.id).single();
    dbError(postError);
    if (!post || (body.revision === true ? post.status !== "published" : !["draft", "pending_review", "published", "hidden"].includes(post.status))) {
      throw new ApiError(403, "无权为此内容添加媒体");
    }

    const bucket = mediaBucketForPath(path);
    const basename = path.split("/").at(-1)!;
    const { data: objects, error: objectError } = await db.storage.from(bucket).list(user!.id, { search: basename, limit: 20 });
    dbError(objectError);
    const object = (objects || []).find((item) => item.name === basename);
    if (!object) throw new ApiError(400, "上传文件尚未完成，请等待上传成功");
    const mime = typeof object.metadata?.mimetype === "string" ? object.metadata.mimetype : null;
    const expectedMimes = video ? ["video/mp4", "video/webm"] : ["image/jpeg", "image/png", "image/webp"];
    if (mime && !expectedMimes.includes(mime)) throw new ApiError(400, "媒体内容类型无效");
    if (video && Number(object.metadata?.size || 0) > 50 * 1024 * 1024) throw new ApiError(400, "视频不能超过 50 MB");

    const { data: linked, error: linkedError } = await db.from("post_media").select("post_id").eq("storage_path", path).maybeSingle();
    dbError(linkedError);
    if (body.revision === true) {
      if (linked) throw new ApiError(409, "媒体已关联公开内容，请重新选择后上传修改");
      return { path };
    }
    if (linked?.post_id && linked.post_id !== id) throw new ApiError(409, "媒体已关联其他内容");

    const { data: media, error: mediaError } = await db.from("post_media").select("storage_path").eq("post_id", id);
    dbError(mediaError);
    const existing = (media || []).map((item) => item.storage_path).filter((item) => item !== path);
    if (video && existing.some((item) => !isVideoMediaPath(item))) throw new ApiError(400, "视频与图片暂不能放在同一篇内容中，请先移除图片");
    if (!video && existing.some(isVideoMediaPath)) throw new ApiError(400, "视频与图片暂不能放在同一篇内容中，请先移除视频");
    const limit = video ? 1 : 9;
    if (existing.length >= limit) throw new ApiError(400, video ? "一篇内容最多添加 1 个视频" : "一篇内容最多添加 9 张图片");

    const { data, error } = await db.from("post_media").upsert({ post_id: id, storage_path: path, sort_order: sortOrder }, { onConflict: "storage_path" }).select().single();
    dbError(error);
    return data;
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const id = uuid((await params).id);
    const path = textField(body.path, "媒体路径", 1, 300);
    if (!path.startsWith(`${user!.id}/`) || path.includes("..")) throw new ApiError(403, "媒体不属于当前用户");
    const { data: owned, error: ownedError } = await db.from("post_media").select("storage_path,posts!inner(author_id)").eq("post_id", id).eq("storage_path", path).eq("posts.author_id", user!.id).single();
    dbError(ownedError);
    if (!owned) throw new ApiError(404, "媒体不存在");
    const { error: storageError } = await db.storage.from(mediaBucketForPath(path)).remove([path]);
    dbError(storageError);
    const { error: unlinkError } = await db.from("post_media").delete().eq("post_id", id).eq("storage_path", path);
    dbError(unlinkError);
    return { removed: true };
  });
}
