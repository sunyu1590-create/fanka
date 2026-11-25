import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, context, jsonBody, uuid } from "@/lib/server/api";
import { loadSeriesSource, loadTemplates, persistCover, readCoverRecord, resolveTemplate, assertSeriesEditor, suggestTemplateId, deriveSubtitle } from "@/lib/server/series-cover-service";
import { paletteOptions } from "@/lib/server/series-cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 合集封面读取：返回当前封面来源、参数、可选模板与配色。
 * 编辑器首屏只需一次请求即可完成初始化。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await context(req, false);
    const { id } = await params;
    const seriesId = uuid(id, "合集编号");
    const series = await loadSeriesSource(db, seriesId);
    const [record, templates] = await Promise.all([readCoverRecord(db, seriesId), loadTemplates(db, { enabledOnly: false })]);

    const recommended = resolveTemplateById(templates, suggestTemplateId(series));
    const active = record?.template_id ? resolveTemplateById(templates, record.template_id) : recommended;
    const canEdit = Boolean(user && (user.id === series.creatorId || (await isAdmin(db, user.id))));

    return NextResponse.json({
      data: {
        series: { id: series.id, title: series.title, subtitle: deriveSubtitle(series), kind: series.kind, chapters: series.chapters || 0 },
        cover: record
          ? {
              source: record.source,
              version: record.version,
              templateId: record.template_id,
              title: record.title,
              subtitle: record.subtitle,
              palette: record.palette,
              pattern: record.pattern,
              crop: record.crop,
              storagePath: record.storage_path,
              sourcePostId: record.source_post_id,
              updatedAt: record.updated_at,
              url: record.storage_path ? adminClient().storage.from("series-covers").getPublicUrl(record.storage_path).data.publicUrl : null,
            }
          : null,
        templates: templates.map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          renderType: template.render_type,
          editable: template.editable,
          enabled: template.enabled !== false,
          previewPath: template.previewPath || null,
        })),
        palettes: paletteOptions(active?.palette || { bg: "#F4F1EA", ink: "#141414", accent: "#1F4EF5", muted: "#8A8578" }),
        recommendedTemplateId: recommended?.id || null,
        canEdit,
      },
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[series-cover:get]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "读取封面失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

function resolveTemplateById<T extends { id: string }>(templates: T[], id: string | null | undefined) {
  if (id) {
    const found = templates.find((template) => template.id === id);
    if (found) return found;
  }
  return templates[0] || null;
}

async function isAdmin(db: Awaited<ReturnType<typeof context>>["db"], userId: string) {
  const { data } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

/**
 * 保存封面。四类来源在这里收口：
 * - auto / template：程序化排版，参数可覆盖
 * - upload：已经过 /cover/upload 暂存并裁切的自定义图
 * - post：直接使用合集内某篇作品的图片
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await context(req);
    const { id } = await params;
    const seriesId = uuid(id, "合集编号");
    const series = await assertSeriesEditor(db, user!.id, seriesId);
    const body = await jsonBody(req);

    const source = ["auto", "template", "upload", "post"].includes(String(body.source)) ? String(body.source) as "auto" | "template" | "upload" | "post" : "auto";
    const templateId = body.template_id ? String(body.template_id).slice(0, 48) : null;
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 40) : undefined;
    const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim().slice(0, 60) : undefined;
    const palette = typeof body.palette === "string" && /^[a-z]{1,16}$/.test(body.palette) ? body.palette : null;
    const pattern = typeof body.pattern === "string" && /^[a-z]{1,4}$/.test(body.pattern) ? body.pattern : null;
    const variant = Number.isFinite(Number(body.variant)) ? Math.max(0, Math.min(99, Math.round(Number(body.variant)))) : 0;
    const crop = body.crop && typeof body.crop === "object"
      ? {
          focusX: Math.max(0, Math.min(100, Number((body.crop as Record<string, unknown>).focusX ?? 50))),
          focusY: Math.max(0, Math.min(100, Number((body.crop as Record<string, unknown>).focusY ?? 50))),
          zoom: Math.max(1, Math.min(3, Number((body.crop as Record<string, unknown>).zoom ?? 1))),
        }
      : null;

    if (title !== undefined && title.length < 1) throw new ApiError(400, "封面主标题不能为空");

    const admin = adminClient();
    const seriesSource = await loadSeriesSource(db, seriesId);
    let imageBuffer: Buffer | null = null;
    let sourcePostId: string | null = null;
    let plainImage = false;

    if (source === "upload") {
      const uploadPath = String(body.upload_path || "");
      if (!uploadPath.startsWith(`${seriesId}/upload-`) || uploadPath.includes("..")) throw new ApiError(400, "上传资源无效");
      const { data: file, error } = await admin.storage.from("series-covers").download(uploadPath);
      if (error || !file) throw new ApiError(404, "上传的图片已过期，请重新上传");
      imageBuffer = Buffer.from(await file.arrayBuffer());
      plainImage = true;
    } else if (source === "post") {
      const postId = body.source_post_id ? uuid(body.source_post_id, "作品编号") : null;
      const { pickPostImage } = await import("@/lib/server/series-cover-service");
      const picked = await pickPostImage(db, seriesId, postId);
      if (!picked) throw new ApiError(400, "该作品没有可用图片，请换一篇或改用其它封面来源");
      imageBuffer = picked.buffer;
      sourcePostId = picked.postId;
      // 带杂志类模板时组合排版，否则直接裁切成封面。
      const template = await resolveTemplate(db, templateId);
      plainImage = template.render_type !== "magazine";
    }

    const result = await persistCover(admin, db, {
      seriesId,
      source,
      series: seriesSource,
      overrides: { templateId, title, subtitle, palette, pattern, variant, crop, preferredPostId: sourcePostId, useImage: source !== "upload" },
      imageBuffer,
      sourcePostId,
      userId: user!.id,
      plainImage,
    });

    if (source === "upload" && body.upload_path) {
      await admin.storage.from("series-covers").remove([String(body.upload_path)]).catch(() => null);
    }

    return NextResponse.json({ data: { ...result, title: series.title, source } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[series-cover:put]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "保存封面失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

/** 恢复自动生成：重新按推荐模板渲染一张，并覆盖此前的手动封面。 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await context(req);
    const { id } = await params;
    const seriesId = uuid(id, "合集编号");
    await assertSeriesEditor(db, user!.id, seriesId);
    const series = await loadSeriesSource(db, seriesId);
    const result = await persistCover(adminClient(), db, { seriesId, source: "auto", series, userId: user!.id });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[series-cover:delete]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "恢复自动封面失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
