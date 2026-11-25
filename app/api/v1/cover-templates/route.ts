import { NextRequest, NextResponse } from "next/server";
import { ApiError, context } from "@/lib/server/api";
import { loadTemplates } from "@/lib/server/series-cover-service";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  swiss: "瑞士编辑",
  glass: "光学玻璃",
  magazine: "沉浸杂志",
  minimal: "极简文字",
  literary: "文学艺术",
  creative: "创作实践",
};

/**
 * 官方封面模板目录（公开读）。
 * 客户端不内置任何模板清单，运营新增或停用模板后无需重新发版。
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await context(req, false);
    const templates = await loadTemplates(db, { enabledOnly: true });
    return NextResponse.json({
      data: {
        categories: Object.entries(CATEGORY_LABEL).map(([key, label]) => ({ key, label })),
        templates: templates.map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          categoryLabel: CATEGORY_LABEL[template.category] || template.category,
          renderType: template.render_type,
          editable: template.editable,
          previewPath: template.previewPath || null,
          isDefault: template.isDefault === true,
        })),
        total: templates.length,
      },
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[cover-templates]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "模板读取失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
