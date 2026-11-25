import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonBody } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["swiss", "glass", "magazine", "minimal", "literary", "creative"]);
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireAdmin(req);
    const { id } = await params;
    const body = await jsonBody(req);
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 2 || name.length > 40) throw new ApiError(400, "模板名称需为 2–40 字");
      values.name = name;
    }
    if (typeof body.category === "string") {
      if (!CATEGORIES.has(body.category)) throw new ApiError(400, "模板分类无效");
      values.category = body.category;
    }
    if (body.palette) values.palette = sanitizePalette(body.palette);
    if (body.params && typeof body.params === "object") values.params = body.params;
    if (typeof body.sort_order === "number") values.sort_order = Math.max(0, Math.min(9999, Math.round(body.sort_order)));
    if (typeof body.enabled === "boolean") values.enabled = body.enabled;
    if (body.is_default === true) {
      // 默认模板全局唯一：先把其它模板的默认位清掉。
      await db.from("cover_templates").update({ is_default: false }).eq("is_default", true);
      values.is_default = true;
    } else if (body.is_default === false) {
      values.is_default = false;
    }

    const { data, error } = await db.from("cover_templates").update(values).eq("id", id).select("*").single();
    if (error) throw new ApiError(400, error.message);
    return NextResponse.json({ data });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-cover-templates:patch]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "保存失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

/**
 * 停用而不是物理删除：历史封面记录仍引用该模板编号，
 * 直接删会让「这张封面来自哪个模板」永久丢失。
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireAdmin(req);
    const { id } = await params;
    const { count: inUse } = await db.from("series_covers").select("series_id", { count: "exact", head: true }).eq("template_id", id);
    const { data, error } = await db.from("cover_templates").update({ enabled: false, is_default: false, updated_at: new Date().toISOString() })
      .eq("id", id).select("id,enabled").single();
    if (error) throw new ApiError(400, error.message);
    return NextResponse.json({ data: { ...data, inUse: inUse || 0 } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-cover-templates:delete]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "停用失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
