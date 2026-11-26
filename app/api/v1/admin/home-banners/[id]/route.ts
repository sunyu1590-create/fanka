import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonBody, uuid } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { sanitizeBannerBody, assertVideoQuota } from "@/lib/server/home-banners";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await requireAdmin(req);
    const { id } = await params;
    const bannerId = uuid(id, "推荐位编号");
    const body = await jsonBody(req);
    const values = sanitizeBannerBody(body, { partial: true });
    if (!Object.keys(values).length) throw new ApiError(400, "没有需要保存的修改");

    const { data: current, error: readError } = await db.from("home_banners").select("*").eq("id", bannerId).maybeSingle();
    if (readError) throw new ApiError(400, readError.message);
    if (!current) throw new ApiError(404, "推荐位不存在");

    const merged = { ...current, ...values } as Record<string, unknown>;
    if (merged.media_type === "image" && !merged.image_path) throw new ApiError(400, "图片推荐位缺少图片资源");
    if (merged.media_type === "video" && !merged.video_path) throw new ApiError(400, "视频推荐位缺少视频资源");
    await assertVideoQuota(db, {
      addingVideo: merged.media_type === "video",
      live: merged.status === "published" && merged.enabled !== false,
      excludeId: bannerId,
    });

    const { data, error } = await db.from("home_banners").update({ ...values, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", bannerId).select("*").single();
    if (error) throw new ApiError(400, error.message);
    return NextResponse.json({ data });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-banners:patch]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "保存失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

/**
 * 删除推荐位。资源文件只有在没有任何其他推荐位引用时才会真正删除，
 * 避免「同一张图被两条轮播共用」时误删正在使用的资源。
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireAdmin(req);
    const { id } = await params;
    const bannerId = uuid(id, "推荐位编号");
    const { data: current, error: readError } = await db.from("home_banners").select("image_path,video_path,poster_path").eq("id", bannerId).maybeSingle();
    if (readError) throw new ApiError(400, readError.message);
    if (!current) throw new ApiError(404, "推荐位不存在");

    const { error } = await db.from("home_banners").delete().eq("id", bannerId);
    if (error) throw new ApiError(400, error.message);

    const candidates = [current.image_path, current.video_path, current.poster_path].filter((path): path is string => Boolean(path));
    if (candidates.length) {
      const { data: others } = await db.from("home_banners").select("image_path,video_path,poster_path")
        .or(candidates.map((path) => `image_path.eq.${path},video_path.eq.${path},poster_path.eq.${path}`).join(","));
      const inUse = new Set<string>();
      for (const row of (others || []) as { image_path: string | null; video_path: string | null; poster_path: string | null }[]) {
        for (const path of [row.image_path, row.video_path, row.poster_path]) if (path) inUse.add(path);
      }
      const removable = candidates.filter((path) => !inUse.has(path));
      if (removable.length) {
        const admin = (await import("@/lib/server/admin-client")).adminClient();
        await admin.storage.from("home-banners").remove(removable).catch(() => null);
      }
    }
    return NextResponse.json({ data: { removed: true, released: candidates.length } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-banners:delete]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "删除失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
