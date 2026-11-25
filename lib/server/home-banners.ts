/**
 * 首页推荐位的读取编排：配置 + 有效内容 + 目标有效性校验。
 * 公共接口只暴露展示所需字段，管理字段（内部名称、操作者、草稿状态）一律不外泄。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/api";

export type BannerPlatform = "app" | "web";

export type BannerSettings = {
  enabled: boolean;
  autoplay: boolean;
  imageDurationMs: number;
  transitionMs: number;
  videoAutoplay: boolean;
  videoMuted: boolean;
  allowUnmute: boolean;
  dataSaverFallback: boolean;
  videoMaxMs: number;
  sizeMode: "ratio" | "fixed";
  coverRatio: string;
  heights: { app: number; mobile: number; tablet: number; desktop: number };
  unifiedSize: boolean;
  fitMode: "cover" | "contain";
  focus: "center" | "top" | "bottom";
  radius: number;
  showIndicator: boolean;
  invalidTargetPolicy: "media" | "filter";
  version: number;
  updatedAt: string;
};

export type PublicBanner = {
  id: string;
  mediaType: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  videoDurationMs: number | null;
  displayMs: number | null;
  targetType: "none" | "post" | "series";
  targetId: string | null;
  targetValid: boolean;
  focus: "center" | "top" | "bottom";
  alt: string;
};

const SETTINGS_FIELDS =
  "enabled,autoplay,image_duration_ms,transition_ms,video_autoplay,video_muted,allow_unmute,data_saver_fallback,video_max_ms,size_mode,cover_ratio,app_height,mobile_height,tablet_height,desktop_height,unified_size,fit_mode,focus,radius,show_indicator,invalid_target_policy,version,updated_at";

export function mapSettings(row: Record<string, unknown> | null): BannerSettings {
  const source = row || {};
  const num = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    enabled: source.enabled !== false,
    autoplay: source.autoplay !== false,
    imageDurationMs: num(source.image_duration_ms, 5000),
    transitionMs: num(source.transition_ms, 450),
    videoAutoplay: source.video_autoplay !== false,
    videoMuted: source.video_muted !== false,
    allowUnmute: source.allow_unmute !== false,
    dataSaverFallback: source.data_saver_fallback !== false,
    videoMaxMs: num(source.video_max_ms, 30000),
    sizeMode: source.size_mode === "fixed" ? "fixed" : "ratio",
    coverRatio: String(source.cover_ratio || "3:1"),
    heights: {
      app: num(source.app_height, 120),
      mobile: num(source.mobile_height, 120),
      tablet: num(source.tablet_height, 160),
      desktop: num(source.desktop_height, 180),
    },
    unifiedSize: source.unified_size !== false,
    fitMode: source.fit_mode === "contain" ? "contain" : "cover",
    focus: source.focus === "top" ? "top" : source.focus === "bottom" ? "bottom" : "center",
    radius: num(source.radius, 12),
    showIndicator: source.show_indicator !== false,
    invalidTargetPolicy: source.invalid_target_policy === "filter" ? "filter" : "media",
    version: num(source.version, 1),
    updatedAt: String(source.updated_at || ""),
  };
}

export async function loadSettings(db: SupabaseClient) {
  const { data, error } = await db.from("home_banner_settings").select(SETTINGS_FIELDS).eq("id", "default").maybeSingle();
  if (error) throw new ApiError(500, error.message);
  return mapSettings(data as Record<string, unknown> | null);
}

type BannerRow = {
  id: string;
  alt: string;
  media_type: "image" | "video";
  image_path: string | null;
  video_path: string | null;
  poster_path: string | null;
  width: number | null;
  height: number | null;
  video_duration_ms: number | null;
  display_ms: number | null;
  target_type: "none" | "post" | "series";
  target_id: string | null;
  focus: "center" | "top" | "bottom";
  platforms: string[];
  starts_at: string | null;
  ends_at: string | null;
};

const BANNER_PUBLIC_FIELDS =
  "id,alt,media_type,image_path,video_path,poster_path,width,height,video_duration_ms,display_ms,target_type,target_id,focus,platforms,starts_at,ends_at";

function withinWindow(row: BannerRow, now: number) {
  if (row.starts_at && Date.parse(row.starts_at) > now) return false;
  if (row.ends_at && Date.parse(row.ends_at) <= now) return false;
  return true;
}

export function publicUrlFor(admin: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = admin.storage.from("home-banners").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 一次性校验所有跳转目标是否仍然可访问。
 * 作品要求 published；合集要求已通过审核且公开。
 */
async function validateTargets(db: SupabaseClient, rows: BannerRow[]) {
  const postIds = [...new Set(rows.filter((row) => row.target_type === "post" && row.target_id).map((row) => row.target_id!))];
  const seriesIds = [...new Set(rows.filter((row) => row.target_type === "series" && row.target_id).map((row) => row.target_id!))];
  const validPosts = new Set<string>();
  const validSeries = new Set<string>();
  await Promise.all([
    postIds.length
      ? db.from("posts").select("id").in("id", postIds).eq("status", "published").then(({ data }) => {
          for (const row of (data || []) as { id: string }[]) validPosts.add(row.id);
        })
      : Promise.resolve(),
    seriesIds.length
      ? db.from("post_series").select("id").in("id", seriesIds).eq("review_status", "approved").eq("is_public", true).then(({ data }) => {
          for (const row of (data || []) as { id: string }[]) validSeries.add(row.id);
        })
      : Promise.resolve(),
  ]);
  return { validPosts, validSeries };
}

export async function loadBannerPayload(db: SupabaseClient, admin: SupabaseClient, platform: BannerPlatform) {
  const [settings, bannerRes] = await Promise.all([
    loadSettings(db),
    db.from("home_banners").select(BANNER_PUBLIC_FIELDS)
      .eq("enabled", true).eq("status", "published")
      .order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
  ]);
  if (bannerRes.error) throw new ApiError(500, bannerRes.error.message);

  const now = Date.now();
  const rows = ((bannerRes.data || []) as unknown as BannerRow[])
    .filter((row) => withinWindow(row, now))
    .filter((row) => !Array.isArray(row.platforms) || row.platforms.includes(platform));

  const { validPosts, validSeries } = await validateTargets(db, rows);
  const items: PublicBanner[] = [];
  for (const row of rows) {
    const targetValid = row.target_type === "none"
      ? true
      : row.target_type === "post"
        ? Boolean(row.target_id && validPosts.has(row.target_id))
        : Boolean(row.target_id && validSeries.has(row.target_id));
    if (!targetValid && settings.invalidTargetPolicy === "filter") continue;
    items.push({
      id: row.id,
      mediaType: row.media_type,
      imageUrl: publicUrlFor(admin, row.image_path),
      videoUrl: publicUrlFor(admin, row.video_path),
      posterUrl: publicUrlFor(admin, row.poster_path || row.image_path),
      width: row.width,
      height: row.height,
      videoDurationMs: row.video_duration_ms,
      displayMs: row.display_ms,
      // 目标失效时降级为「仅媒体」，不给用户一个会 404 的点击。
      targetType: targetValid ? row.target_type : "none",
      targetId: targetValid ? row.target_id : null,
      targetValid,
      focus: row.focus,
      alt: row.alt,
    });
  }

  const version = `${settings.version}-${items.length}-${items.map((item) => item.id.slice(0, 8)).join("")}`;
  return { settings, items, version };
}

/** 服务端渲染用：把封面路径换成可对外访问的地址，并附带目标标题便于审计。 */
export async function loadBannerAdminRows(db: SupabaseClient) {
  const { data, error } = await db.from("home_banners").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return data || [];
}

// ---------- 管理端入参校验（放这里而不是 route 文件：route 只允许导出 HTTP 方法） ----------

const PLATFORM_KEYS = new Set(["app", "web"]);

export function sanitizePlatforms(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map((item) => String(item)) : ["app", "web"];
  const filtered = [...new Set(list.filter((item) => PLATFORM_KEYS.has(item)))];
  if (!filtered.length) throw new ApiError(400, "至少选择一个展示平台");
  return filtered;
}

/** 媒体路径只接受本桶内的相对路径，杜绝越权引用或路径穿越。 */
export function sanitizeMediaPath(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  const path = String(value).trim();
  if (path.includes("..") || path.startsWith("/") || !/^[A-Za-z0-9/._-]+$/.test(path)) throw new ApiError(400, `${field}路径无效`);
  if (!/\.(?:jpg|jpeg|png|webp|mp4)$/i.test(path)) throw new ApiError(400, `${field}格式不支持`);
  return path;
}

function sanitizeWindow(value: unknown, label: string) {
  if (value == null || value === "") return null;
  const time = Date.parse(String(value));
  if (!Number.isFinite(time)) throw new ApiError(400, `${label}格式无效`);
  return new Date(time).toISOString();
}

const isValidUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function sanitizeBannerBody(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  const out: Record<string, unknown> = {};

  if (!options.partial || has("name")) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2 || name.length > 60) throw new ApiError(400, "内部名称需为 2–60 字");
    out.name = name;
  }
  if (!options.partial || has("alt")) out.alt = String(body.alt ?? "").trim().slice(0, 120);
  if (!options.partial || has("media_type")) out.media_type = body.media_type === "video" ? "video" : "image";
  if (!options.partial || has("image_path")) out.image_path = sanitizeMediaPath(body.image_path, "图片");
  if (!options.partial || has("video_path")) out.video_path = sanitizeMediaPath(body.video_path, "视频");
  if (!options.partial || has("poster_path")) out.poster_path = sanitizeMediaPath(body.poster_path, "视频封面");
  if (!options.partial || has("width")) out.width = body.width == null ? null : Math.max(1, Math.round(Number(body.width) || 0)) || null;
  if (!options.partial || has("height")) out.height = body.height == null ? null : Math.max(1, Math.round(Number(body.height) || 0)) || null;
  if (!options.partial || has("video_duration_ms")) {
    const duration = Number(body.video_duration_ms);
    out.video_duration_ms = Number.isFinite(duration) && duration > 0 ? Math.min(600000, Math.round(duration)) : null;
  }
  if (!options.partial || has("display_ms")) {
    const display = Number(body.display_ms);
    if (body.display_ms == null || body.display_ms === "") out.display_ms = null;
    else if (!Number.isFinite(display) || display < 1500 || display > 60000) throw new ApiError(400, "单项展示时长需在 1.5–60 秒之间");
    else out.display_ms = Math.round(display);
  }
  if (!options.partial || has("target_type")) {
    const targetType = body.target_type === "post" || body.target_type === "series" ? body.target_type : "none";
    out.target_type = targetType;
    if (targetType === "none") out.target_id = null;
    else {
      if (!isValidUuid(body.target_id)) throw new ApiError(400, "跳转目标无效");
      out.target_id = body.target_id;
    }
  } else if (has("target_id")) {
    out.target_id = body.target_id == null ? null : isValidUuid(body.target_id) ? body.target_id : (() => { throw new ApiError(400, "跳转目标无效"); })();
  }
  if (!options.partial || has("focus")) out.focus = body.focus === "top" ? "top" : body.focus === "bottom" ? "bottom" : "center";
  if (!options.partial || has("sort_order")) out.sort_order = Math.max(0, Math.min(9999, Math.round(Number(body.sort_order) || 0)));
  if (!options.partial || has("platforms")) out.platforms = sanitizePlatforms(body.platforms);
  if (!options.partial || has("enabled")) out.enabled = body.enabled !== false;
  if (!options.partial || has("status")) out.status = body.status === "published" ? "published" : "draft";
  if (!options.partial || has("starts_at")) out.starts_at = sanitizeWindow(body.starts_at, "上线时间");
  if (!options.partial || has("ends_at")) out.ends_at = sanitizeWindow(body.ends_at, "下架时间");

  if (out.starts_at && out.ends_at && Date.parse(String(out.ends_at)) <= Date.parse(String(out.starts_at))) {
    throw new ApiError(400, "下架时间必须晚于上线时间");
  }
  return out;
}
