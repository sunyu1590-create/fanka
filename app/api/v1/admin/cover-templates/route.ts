import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonBody } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { loadTemplates } from "@/lib/server/series-cover-service";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["swiss", "glass", "magazine", "minimal", "literary", "creative"]);

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req);
    const templates = await loadTemplates(db, { enabledOnly: false });
    const [coverage, jobs] = await Promise.all([
      db.rpc("heika_series_cover_coverage"),
      db.from("cover_backfill_jobs").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    const { count: seriesTotal } = await db.from("post_series").select("id", { count: "exact", head: true });

    return NextResponse.json({
      data: {
        templates: templates.map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          renderType: template.render_type,
          palette: template.palette,
          params: template.params,
          editable: template.editable,
          version: template.version,
          sortOrder: template.sortOrder,
          enabled: template.enabled !== false,
          isDefault: template.isDefault === true,
          previewPath: template.previewPath || null,
        })),
        coverage: coverage.data || null,
        seriesTotal: seriesTotal || 0,
        jobs: jobs.data || [],
        jobError: jobs.error?.message || null,
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-cover-templates:get]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "读取失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function sanitizePalette(value: unknown) {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ["bg", "ink", "accent", "muted"]) {
    const candidate = source[key];
    if (typeof candidate === "string" && HEX.test(candidate)) out[key] = candidate;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req);
    const body = await jsonBody(req);
    const id = String(body.id || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new ApiError(400, "模板编号只能使用小写字母、数字与连字符");
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 40) throw new ApiError(400, "模板名称需为 2–40 字");
    const category = String(body.category || "");
    if (!CATEGORIES.has(category)) throw new ApiError(400, "模板分类无效");
    const renderType = String(body.render_type || category);
    if (!CATEGORIES.has(renderType)) throw new ApiError(400, "渲染类型无效");

    const { data: exists } = await db.from("cover_templates").select("id").eq("id", id).maybeSingle();
    if (exists) throw new ApiError(409, "该模板编号已存在");

    const { data, error } = await db.from("cover_templates").insert({
      id,
      name,
      category,
      render_type: renderType,
      palette: sanitizePalette(body.palette),
      params: body.params && typeof body.params === "object" ? body.params : {},
      editable: { title: true, subtitle: true, palette: true },
      sort_order: Math.max(0, Math.min(9999, Math.round(Number(body.sort_order) || 0))),
      enabled: body.enabled !== false,
      is_default: false,
      version: 1,
    }).select("*").single();
    if (error) throw new ApiError(400, error.message);
    return NextResponse.json({ data });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-cover-templates:post]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "创建失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
