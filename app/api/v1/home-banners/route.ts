import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, context } from "@/lib/server/api";
import { loadBannerPayload, type BannerPlatform } from "@/lib/server/home-banners";

export const dynamic = "force-dynamic";

/**
 * 首页推荐位公共读取。
 * 返回配置 + 当前平台的有效内容；客户端用 version 做本地缓存比对，
 * 不必每秒轮询完整配置。
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await context(req, false);
    const platform = (req.nextUrl.searchParams.get("platform") === "app" ? "app" : "web") as BannerPlatform;
    const payload = await loadBannerPayload(db, adminClient(), platform);
    return NextResponse.json(
      { data: { ...payload, platform } },
      { headers: { "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (!(error instanceof ApiError)) console.error("[home-banners]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "首页推荐位暂不可用" }, { status });
  }
}
