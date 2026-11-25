import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { ApiError, context } from "@/lib/server/api";
import { buildSpec, hasCjkFont, renderCover } from "@/lib/server/series-cover";
import { loadTemplates } from "@/lib/server/series-cover-service";

export const dynamic = "force-dynamic";

/**
 * 官方模板缩略图。
 *
 * 模板网格里如果只写设计名，用户只能靠猜；这里用同一套渲染引擎画一张
 * 300×400 的样板图，所见即所得，且和最终产出完全同源。
 * 结果按「模板版本 + 配色」在进程内缓存，同一张图只渲染一次。
 */
const THUMB_WIDTH = 300;
const THUMB_HEIGHT = 400;
const cache = new Map<string, { at: number; body: Buffer }>();
const TTL = 30 * 60 * 1000;

/** 样板文案：只表达版式层次，不冒充任何真实合集。 */
const SAMPLE = {
  id: "00000000-0000-4000-8000-000000000000",
  title: "合集标题",
  description: "一句话说明这个合集在讲什么，最多两行",
  kind: "tutorial",
  channel: "ai",
  chapters: 12,
  tags: [],
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { db } = await context(req, false);
    const templates = await loadTemplates(db, { enabledOnly: true });
    const template = templates.find((item) => item.id === id);
    if (!template) throw new ApiError(404, "模板不存在或已停用");
    if (!hasCjkFont()) throw new ApiError(503, "封面渲染缺少中文字体");

    const key = `${template.id}:${template.version || 1}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) {
      return new NextResponse(new Uint8Array(hit.body), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          "X-Cover-Cache": "hit",
        },
      });
    }

    const spec = buildSpec(SAMPLE, template, { variant: 0 });
    const full = await renderCover(spec);
    const body = await sharp(full)
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 200) {
      // 模板数量有限，这里只是防止长期运行后无限增长。
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 50);
      for (const [stale] of oldest) cache.delete(stale);
    }
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Cover-Cache": "miss",
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[cover-template-preview]", error);
    return NextResponse.json(
      { error: error instanceof ApiError ? error.message : "缩略图生成失败" },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
