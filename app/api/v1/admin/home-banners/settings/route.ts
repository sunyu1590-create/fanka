import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonBody } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { loadSettings, mapSettings } from "@/lib/server/home-banners";

export const dynamic = "force-dynamic";

const SETTINGS_FIELDS =
  "enabled,autoplay,image_duration_ms,transition_ms,video_autoplay,video_muted,allow_unmute,data_saver_fallback,video_max_ms,size_mode,cover_ratio,app_height,mobile_height,tablet_height,desktop_height,unified_size,fit_mode,focus,radius,show_indicator,invalid_target_policy,version,updated_at";

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req);
    const settings = await loadSettings(db);
    return NextResponse.json({ data: settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "读取配置失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const int = (value: unknown, min: number, max: number, fallback: number, label: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) throw new ApiError(400, `${label}需在 ${min}–${max} 之间`);
  return Math.round(parsed);
};

const RATIOS = new Set(["4:1", "3:1", "21:9", "16:9", "2:1", "5:2", "custom"]);

export async function PUT(req: NextRequest) {
  try {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const current = await loadSettings(db);

    const ratio = typeof body.cover_ratio === "string" && RATIOS.has(body.cover_ratio) ? body.cover_ratio : current.coverRatio;
    const customRatio = typeof body.custom_ratio === "string" ? body.custom_ratio.trim() : "";
    if (ratio === "custom") {
      const match = /^(\d{1,2}(?:\.\d)?)\s*[:/]\s*(\d{1,2}(?:\.\d)?)$/.exec(customRatio);
      if (!match) throw new ApiError(400, "自定义宽高比格式应为「宽:高」，例如 2.5:1");
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (!width || !height || width / height < 0.8 || width / height > 8) throw new ApiError(400, "自定义宽高比需在 0.8:1 到 8:1 之间");
    }

    const values = {
      enabled: bool(body.enabled, current.enabled),
      autoplay: bool(body.autoplay, current.autoplay),
      image_duration_ms: int(body.image_duration_ms, 1500, 20000, current.imageDurationMs, "图片展示时长"),
      transition_ms: int(body.transition_ms, 120, 1500, current.transitionMs, "切换动画时长"),
      video_autoplay: bool(body.video_autoplay, current.videoAutoplay),
      video_muted: bool(body.video_muted, current.videoMuted),
      allow_unmute: bool(body.allow_unmute, current.allowUnmute),
      data_saver_fallback: bool(body.data_saver_fallback, current.dataSaverFallback),
      video_max_ms: int(body.video_max_ms, 3000, 120000, current.videoMaxMs, "视频最长播放时长"),
      size_mode: body.size_mode === "fixed" ? "fixed" : body.size_mode === "ratio" ? "ratio" : current.sizeMode,
      cover_ratio: ratio === "custom" ? customRatio || "3:1" : ratio,
      app_height: int(body.app_height, 80, 280, current.heights.app, "APP 高度"),
      mobile_height: int(body.mobile_height, 80, 280, current.heights.mobile, "手机网页高度"),
      tablet_height: int(body.tablet_height, 100, 320, current.heights.tablet, "平板网页高度"),
      desktop_height: int(body.desktop_height, 100, 360, current.heights.desktop, "电脑网页高度"),
      unified_size: bool(body.unified_size, current.unifiedSize),
      fit_mode: body.fit_mode === "contain" ? "contain" : body.fit_mode === "cover" ? "cover" : current.fitMode,
      focus: body.focus === "top" ? "top" : body.focus === "bottom" ? "bottom" : body.focus === "center" ? "center" : current.focus,
      radius: int(body.radius, 0, 28, current.radius, "圆角"),
      show_indicator: bool(body.show_indicator, current.showIndicator),
      invalid_target_policy: body.invalid_target_policy === "filter" ? "filter" : body.invalid_target_policy === "media" ? "media" : current.invalidTargetPolicy,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    const { data, error } = await db.from("home_banner_settings").update(values).eq("id", "default").select(SETTINGS_FIELDS).single();
    if (error) throw new ApiError(400, error.message);
    return NextResponse.json({ data: mapSettings(data as Record<string, unknown>) });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[banner-settings]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "保存失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
