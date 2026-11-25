import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { searchBannerTargets } from "@/lib/server/banner-targets";

export const dynamic = "force-dynamic";

/**
 * 跳转目标搜索：管理员按标题、作者或内容 ID 查找，不需要手填 URL。
 * 只搜索当前可公开访问的内容，避免把已下架内容配进轮播。
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req);
    const query = (req.nextUrl.searchParams.get("q") || "").trim();
    const type = req.nextUrl.searchParams.get("type") === "series" ? "series" : "post";
    const items = await searchBannerTargets(db, query, type);
    return NextResponse.json({ data: { items, type } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[banner-targets]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "搜索失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
