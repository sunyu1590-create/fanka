/**
 * 合集封面的服务端编排：读取模板、挑图、渲染、入库、回写兼容字段。
 * 所有写入都通过 service role 完成，权限判定放在调用方（创作者本人或管理员）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/api";
import { cropRect } from "@/lib/cover-crop";
import {
  buildSpec,
  coverThumbnails,
  deriveSubtitle,
  renderCover,
  suggestTemplateId,
  type CoverSourceSeries,
  type CoverTemplate,
} from "@/lib/server/series-cover";

export const COVER_BUCKET = "series-covers";

export type SeriesCoverRecord = {
  series_id: string;
  source: "auto" | "template" | "upload" | "post";
  template_id: string | null;
  template_version: number | null;
  title: string | null;
  subtitle: string | null;
  palette: string | null;
  pattern: string | null;
  crop: { focusX?: number; focusY?: number; zoom?: number } | null;
  params: Record<string, unknown> | null;
  source_post_id: string | null;
  storage_path: string | null;
  version: number;
  updated_at: string;
};

const TEMPLATE_FIELDS = "id,name,category,render_type,palette,params,editable,version,sort_order,enabled,is_default,usage_count,preview_path";

function asTemplate(row: Record<string, unknown>): CoverTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    render_type: String(row.render_type),
    palette: (row.palette as CoverTemplate["palette"]) || null,
    params: (row.params as Record<string, unknown>) || {},
    editable: (row.editable as Record<string, boolean>) || {},
    version: Number(row.version || 1),
    enabled: row.enabled !== false,
    sortOrder: Number(row.sort_order || 0),
    isDefault: row.is_default === true,
    previewPath: (row.preview_path as string | null) || null,
  };
}

export async function loadTemplates(db: SupabaseClient, options: { enabledOnly?: boolean } = {}) {
  let query = db.from("cover_templates").select(TEMPLATE_FIELDS).order("sort_order", { ascending: true });
  if (options.enabledOnly !== false) query = query.eq("enabled", true);
  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return (data || []).map((row) => asTemplate(row as Record<string, unknown>));
}

export async function resolveTemplate(db: SupabaseClient, id: string | null | undefined) {
  const templates = await loadTemplates(db, { enabledOnly: false });
  if (!templates.length) throw new ApiError(503, "封面模板尚未配置");
  // 已停用的模板仍可用于历史封面重渲染，但不作为默认推荐。
  const found = id ? templates.find((template) => template.id === id) : null;
  if (found) return found;
  const fallback = templates.find((template) => template.category === "swiss") || templates[0];
  return fallback;
}

export async function loadSeriesSource(db: SupabaseClient, seriesId: string): Promise<CoverSourceSeries & { creatorId: string; reviewStatus: string; isPublic: boolean }> {
  const { data, error } = await db
    .from("post_series")
    .select("id,creator_id,title,description,kind,channel,category_id,review_status,is_public,cover_url")
    .eq("id", seriesId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!data) throw new ApiError(404, "合集不存在或已删除");

  const [chapterRes, categoryRes, tagRes] = await Promise.all([
    db.from("posts").select("id", { count: "exact", head: true }).eq("series_id", seriesId).eq("status", "published"),
    data.category_id ? db.from("interest_tags").select("name").eq("id", data.category_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("posts").select("tag").eq("series_id", seriesId).eq("status", "published").limit(20),
  ]);
  const tags = [...new Set(((tagRes.data || []) as { tag: string | null }[]).map((row) => row.tag).filter((tag): tag is string => Boolean(tag)))];
  return {
    id: data.id,
    creatorId: data.creator_id,
    reviewStatus: data.review_status,
    isPublic: Boolean(data.is_public),
    title: data.title,
    description: data.description,
    kind: data.kind,
    channel: data.channel,
    categoryName: (categoryRes.data as { name?: string } | null)?.name || null,
    chapters: chapterRes.count || 0,
    tags,
  };
}

/** 取合集内第一篇有图作品的封面作为视觉素材；没有则返回 null。 */
export async function pickPostImage(db: SupabaseClient, seriesId: string, preferredPostId?: string | null) {
  const fetchImage = async (path: string | null | undefined) => {
    if (!path) return null;
    try {
      if (/^https?:\/\//i.test(path)) {
        const response = await fetch(path, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return null;
        const length = Number(response.headers.get("content-length") || 0);
        if (length > 12 * 1024 * 1024) return null;
        return Buffer.from(await response.arrayBuffer());
      }
      const { data, error } = await db.storage.from("post-covers").download(path);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    } catch {
      return null;
    }
  };

  const pickFrom = async (row: { id: string; images: unknown; cover_url: string | null } | null) => {
    if (!row) return null;
    const images = Array.isArray(row.images) ? (row.images as unknown[]).filter((item): item is string => typeof item === "string" && item.length > 0) : [];
    const candidates = [row.cover_url, images[0]].filter((item): item is string => Boolean(item));
    for (const candidate of candidates) {
      const buffer = await fetchImage(candidate);
      if (buffer && buffer.length > 512) return { buffer, postId: row.id };
    }
    return null;
  };

  if (preferredPostId) {
    const { data } = await db.from("posts").select("id,images,cover_url").eq("id", preferredPostId).eq("series_id", seriesId).maybeSingle();
    const picked = await pickFrom(data as { id: string; images: unknown; cover_url: string | null } | null);
    if (picked) return picked;
  }

  const { data } = await db.from("posts").select("id,images,cover_url").eq("series_id", seriesId).eq("status", "published")
    .order("series_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(12);
  for (const row of (data || []) as { id: string; images: unknown; cover_url: string | null }[]) {
    const picked = await pickFrom(row);
    if (picked) return picked;
  }
  return null;
}

export type RenderOverrides = {
  templateId?: string | null;
  title?: string;
  subtitle?: string;
  palette?: string | null;
  pattern?: string | null;
  variant?: number;
  crop?: { focusX?: number; focusY?: number; zoom?: number } | null;
  useImage?: boolean;
  preferredPostId?: string | null;
};

/** 只渲染不入库：封面编辑器的实时预览与"换一种设计"都走这里。 */
export async function renderPreview(
  db: SupabaseClient,
  series: CoverSourceSeries,
  overrides: RenderOverrides = {},
) {
  const template = await resolveTemplate(db, overrides.templateId || suggestTemplateId(series));
  const spec = buildSpec(series, template, {
    title: overrides.title,
    subtitle: overrides.subtitle,
    palette: overrides.palette,
    pattern: overrides.pattern,
    variant: overrides.variant,
  });
  let image: Buffer | null = null;
  if (overrides.useImage !== false && template.render_type === "magazine") {
    const picked = await pickPostImage(db, series.id, overrides.preferredPostId);
    image = picked?.buffer || null;
  }
  const png = await renderCover(spec, { image });
  return { png, spec, template, hasImage: Boolean(image) };
}

/**
 * 生成并落库。version 每次 +1，客户端据此失效旧缓存；
 * 旧对象在切换成功后删除，避免存储膨胀。
 */
export async function persistCover(
  admin: SupabaseClient,
  db: SupabaseClient,
  params: {
    seriesId: string;
    source: SeriesCoverRecord["source"];
    overrides?: RenderOverrides;
    imageBuffer?: Buffer | null;
    sourcePostId?: string | null;
    userId?: string | null;
    series?: CoverSourceSeries;
    /** 纯图封面：自定义上传或"直接使用作品图"，只裁切不叠文字。 */
    plainImage?: boolean;
  },
) {
  const series = params.series || (await loadSeriesSource(db, params.seriesId));
  const overrides = params.overrides || {};
  const template = await resolveTemplate(db, overrides.templateId || suggestTemplateId(series));
  const spec = buildSpec(series, template, {
    title: overrides.title,
    subtitle: overrides.subtitle,
    palette: overrides.palette,
    pattern: overrides.pattern,
    variant: overrides.variant,
  });

  let image: Buffer | null = params.imageBuffer || null;
  let sourcePostId = params.sourcePostId || null;
  if (!image && template.render_type === "magazine" && overrides.useImage !== false) {
    const picked = await pickPostImage(db, series.id, overrides.preferredPostId);
    image = picked?.buffer || null;
    sourcePostId = picked?.postId || null;
  }

  // 纯图封面必须真的有一张图，否则退回模板排版，避免产出一张空白色块。
  const plainMode = Boolean(params.plainImage && image);
  const png = plainMode
    ? await cropToCover(image as Buffer, overrides.crop)
    : await renderCover(spec, { image });
  const { data: existing } = await db.from("series_covers").select("version,storage_path").eq("series_id", series.id).maybeSingle();
  const nextVersion = Math.max(0, Number(existing?.version || 0)) + 1;
  const basePath = `${series.id}/cover-${nextVersion}`;
  const mainPath = `${basePath}.png`;
  const { thumbnail, retina } = await coverThumbnails(png);

  const uploads = await Promise.all([
    admin.storage.from(COVER_BUCKET).upload(mainPath, png, { contentType: "image/png", upsert: true, cacheControl: "31536000" }),
    admin.storage.from(COVER_BUCKET).upload(`${basePath}-300.webp`, thumbnail, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
    admin.storage.from(COVER_BUCKET).upload(`${basePath}-600.webp`, retina, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
  ]);
  const failed = uploads.find((item) => item.error);
  if (failed?.error) throw new ApiError(502, `封面写入存储失败：${failed.error.message}`);

  const { data: publicUrl } = admin.storage.from(COVER_BUCKET).getPublicUrl(mainPath);
  const row = {
    series_id: series.id,
    source: params.source,
    template_id: template.id,
    template_version: template.version || 1,
    title: spec.title,
    subtitle: spec.subtitle,
    palette: overrides.palette || null,
    pattern: spec.params ? String(spec.params.layout || spec.params.shape || spec.params.texture || "") || null : null,
    crop: overrides.crop || null,
    params: { ...spec.params, seed: spec.seed, index: spec.index, hasImage: Boolean(image), plain: plainMode },
    source_post_id: sourcePostId,
    storage_path: mainPath,
    generated_at: new Date().toISOString(),
    version: nextVersion,
    updated_at: new Date().toISOString(),
    updated_by: params.userId || null,
  };

  const { error: upsertError } = await admin.from("series_covers").upsert(row, { onConflict: "series_id" });
  if (upsertError) throw new ApiError(500, upsertError.message);

  // 回写 post_series.cover_url：旧客户端与其它读取路径继续可用同一张图。
  const { error: seriesError } = await admin.from("post_series").update({ cover_url: publicUrl.publicUrl }).eq("id", series.id);
  if (seriesError) throw new ApiError(500, seriesError.message);

  if (existing?.storage_path && existing.storage_path !== mainPath) {
    const stale = existing.storage_path.replace(/\.png$/, "");
    await admin.storage.from(COVER_BUCKET).remove([existing.storage_path, `${stale}-300.webp`, `${stale}-600.webp`]).catch(() => null);
  }

  await admin.rpc("heika_cover_template_bump", { p_template: template.id }).then(
    () => null,
    () => null,
  );

  return { path: mainPath, url: publicUrl.publicUrl, version: nextVersion, templateId: template.id, title: spec.title, subtitle: spec.subtitle };
}

/**
 * 自定义上传的预处理：只做安全收敛（限尺寸、转 PNG），不裁切。
 * 取景由用户在编辑器里调整，最终按 crop 参数裁成 3:4；这样"预览"与"保存"
 * 用的是同一份原图，不会出现二次裁切导致的画面偏移。
 */
export async function normalizeUploadedImage(buffer: Buffer) {
  const sharpModule = (await import("sharp")).default;
  const meta = await sharpModule(buffer).metadata();
  if (!meta.width || !meta.height) throw new ApiError(400, "图片无法解码，请重新选择");
  if (meta.width < 300 || meta.height < 400) throw new ApiError(400, "封面图片至少需要 300×400 像素");
  const pipeline = sharpModule(buffer).rotate();
  if (meta.width > 1800 || meta.height > 2400) {
    return pipeline.resize(1800, 2400, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  }
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

export async function readCoverRecord(db: SupabaseClient, seriesId: string) {
  const { data } = await db.from("series_covers").select("*").eq("series_id", seriesId).maybeSingle();
  return (data as SeriesCoverRecord | null) || null;
}

/** 供列表页批量取封面：一次查询拿到所有合集的封面来源与版本。 */
export async function attachCoverMeta<T extends { id: string }>(db: SupabaseClient, rows: T[]) {
  if (!rows.length) return rows.map((row) => ({ ...row, coverMeta: null as null | { source: string; version: number; templateId: string | null } }));
  const { data } = await db.from("series_covers").select("series_id,source,version,template_id").in("series_id", rows.map((row) => row.id));
  const map = new Map((data || []).map((row: { series_id: string; source: string; version: number; template_id: string | null }) => [row.series_id, row]));
  return rows.map((row) => {
    const meta = map.get(row.id);
    return { ...row, coverMeta: meta ? { source: meta.source, version: Number(meta.version), templateId: meta.template_id } : null };
  });
}

export { deriveSubtitle, suggestTemplateId };


/** 按取景焦点把任意图片裁成 3:4，用于自定义上传与「直接使用作品图」。 */
export async function cropToCover(buffer: Buffer, crop?: { focusX?: number; focusY?: number; zoom?: number } | null) {
  const sharpModule = (await import("sharp")).default;
  const meta = await sharpModule(buffer).metadata();
  if (!meta.width || !meta.height) throw new ApiError(400, "图片无法解码");
  const rect = cropRect(meta.width, meta.height, crop);
  return sharpModule(buffer)
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .resize(600, 800, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** 封面编辑权限：合集创建者本人或管理员。服务端判定，不依赖前端按钮隐藏。 */
export async function assertSeriesEditor(db: SupabaseClient, userId: string, seriesId: string) {
  const { data, error } = await db.from("post_series").select("id,creator_id,title").eq("id", seriesId).maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!data) throw new ApiError(404, "合集不存在或已删除");
  if (data.creator_id === userId) return data as { id: string; creator_id: string; title: string };
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role === "admin") return data as { id: string; creator_id: string; title: string };
  throw new ApiError(403, "只有合集创建者可以修改封面");
}
