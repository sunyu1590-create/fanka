import { NextRequest, NextResponse } from "next/server";
import { ApiError, context, dbError, jsonBody, uuid } from "@/lib/server/api";

export const dynamic = "force-dynamic";

const EVENTS = new Set(["impression", "click", "video_start", "video_complete"]);

/**
 * 轮播运营事件上报。
 * 以 (内容, 事件, 平台, 自然日, 会话) 聚合，服务端 30 秒窗口内不重复累加，
 * 因此页面重渲染、React StrictMode 双调用都不会放大曝光数。
 */
export async function POST(req: NextRequest) {
  try {
    const { db, user } = await context(req, false);
    const body = await jsonBody(req);
    const bannerId = uuid(body.banner_id, "推荐位编号");
    const event = String(body.event || "");
    if (!EVENTS.has(event)) throw new ApiError(400, "事件类型无效");
    const platform = body.platform === "app" ? "app" : "web";
    const session = String(body.session || "").trim();
    if (session.length < 6 || session.length > 64) throw new ApiError(400, "会话标识无效");
    const duration = body.duration_ms == null ? null : Math.max(0, Math.min(600000, Math.round(Number(body.duration_ms) || 0)));

    const { data, error } = await db.rpc("heika_banner_track", {
      p_banner: bannerId,
      p_event: event,
      p_platform: platform,
      p_session: session,
      p_duration: duration,
      p_user: user?.id || null,
    });
    dbError(error);
    return NextResponse.json({ data: data || { recorded: false } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    // 上报失败不应打断用户浏览：统一以 204 语义静默，仅记录日志。
    if (!(error instanceof ApiError)) console.warn("[banner-track]", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ data: { recorded: false } }, { status: status === 500 ? 200 : status });
  }
}
