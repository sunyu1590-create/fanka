import { NextRequest, NextResponse } from "next/server";
import { context } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * 首页轮播的轻量版本指纹。
 *
 * 客户端只会在「回到前台 / 重新进入首页且距上次校验超过 1 分钟」时调用一次，
 * 拿到 revision 与本地比对；一致就不下载任何资源，不一致才重新拉完整配置。
 * 这样紧急下架能在一次校验内失效，又不会让首页变成轮询接口。
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await context(req, false);
    const { data, error } = await db.rpc("heika_home_banner_revision");
    if (error) throw error;
    const payload = (data || {}) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: {
          revision: String(payload.revision || ""),
          version: Number(payload.version || 1),
          count: Number(payload.count || 0),
          updatedAt: String(payload.updated_at || ""),
          checkedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch {
    // 版本校验失败不是致命错误：客户端继续沿用缓存，等下次再校验。
    return NextResponse.json(
      { data: { revision: "", version: 0, count: 0, updatedAt: "", checkedAt: new Date().toISOString() } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
