import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";

/**
 * 轮播运营数据。
 * 指标全部来自 home_banner_events 的真实累加值，函数内已定义口径：
 * 曝光/点击按会话去重，完播率 = 完播次数 / 开始播放次数。
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req);
    const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get("days")) || 7));
    const banner = req.nextUrl.searchParams.get("banner");
    const { data, error } = await db.rpc("heika_banner_stats", { p_days: days, p_banner: banner || null });
    if (error) throw new ApiError(400, error.message);

    const { data: banners } = await db.from("home_banners").select("id,name,media_type,status,enabled");
    const nameMap = new Map(((banners || []) as { id: string; name: string; media_type: string; status: string; enabled: boolean }[]).map((row) => [row.id, row]));
    const payload = (data || {}) as { banners?: Array<Record<string, unknown>> };
    const enriched = (payload.banners || []).map((row) => {
      const meta = nameMap.get(String(row.banner_id));
      return { ...row, name: meta?.name || "已删除的推荐位", media_type: meta?.media_type || null, status: meta?.status || null, enabled: meta?.enabled ?? null };
    });

    return NextResponse.json({ data: { ...payload, banners: enriched, generated_at: new Date().toISOString() } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[banner-stats]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "统计读取失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
