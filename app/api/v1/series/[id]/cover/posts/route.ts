import { NextRequest, NextResponse } from "next/server";
import { ApiError, context, uuid } from "@/lib/server/api";
import { assertSeriesEditor } from "@/lib/server/series-cover-service";

export const dynamic = "force-dynamic";

/**
 * 合集内可用于封面的作品图片。
 * 只返回有图且已发布的章节，权限与封面编辑一致。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await context(req);
    const { id } = await params;
    const seriesId = uuid(id, "合集编号");
    await assertSeriesEditor(db, user!.id, seriesId);

    const { data, error } = await db.from("posts")
      .select("id,title,images,cover_url,series_order,created_at")
      .eq("series_id", seriesId).eq("status", "published")
      .order("series_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(60);
    if (error) throw new ApiError(400, error.message);

    const items = ((data || []) as { id: string; title: string; images: unknown; cover_url: string | null }[])
      .map((row) => {
        const images = Array.isArray(row.images) ? (row.images as unknown[]).filter((item): item is string => typeof item === "string" && item.length > 0) : [];
        const path = row.cover_url || images[0] || null;
        if (!path) return null;
        const url = /^https?:\/\//i.test(path) ? path : `/api/v1/media?path=${encodeURIComponent(path)}&redirect=1`;
        return { id: row.id, title: row.title, image: url, count: images.length };
      })
      .filter((item): item is { id: string; title: string; image: string; count: number } => Boolean(item));

    return NextResponse.json({ data: { items, total: items.length } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[series-cover:posts]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "读取作品失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
