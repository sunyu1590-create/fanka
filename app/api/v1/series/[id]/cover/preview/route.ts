import { NextRequest, NextResponse } from "next/server";
import { ApiError, context, uuid } from "@/lib/server/api";
import { assertSeriesEditor, loadSeriesSource, renderPreview } from "@/lib/server/series-cover-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 封面实时预览：只渲染不入库。
 * 前端用带鉴权的 fetch 取回 blob，未保存的配置因此不会影响任何线上用户。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await context(req);
    const { id } = await params;
    const seriesId = uuid(id, "合集编号");
    await assertSeriesEditor(db, user!.id, seriesId);
    const series = await loadSeriesSource(db, seriesId);
    const query = req.nextUrl.searchParams;
    const variant = Number(query.get("variant") || 0);
    const { png } = await renderPreview(db, series, {
      templateId: query.get("template"),
      title: query.get("title") || undefined,
      subtitle: query.get("subtitle") || undefined,
      palette: query.get("palette"),
      pattern: query.get("pattern"),
      variant: Number.isFinite(variant) ? variant : 0,
      preferredPostId: query.get("post"),
      useImage: query.get("use_image") !== "0",
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Cover-Bytes": String(png.byteLength),
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[series-cover:preview]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "预览生成失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
