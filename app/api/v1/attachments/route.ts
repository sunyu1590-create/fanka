import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { requireFeature } from "@/lib/server/feature-flags";
import { adminClient } from "@/lib/server/admin-client";
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_MIME,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_FILES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  attachmentExtension,
  attachmentOwner,
  attachmentContentMatches,
  isPreviewableAttachment,
} from "@/lib/attachments";

export const runtime = "nodejs";

/** 北京时间零点切分自然日，和用户感知的"今天"一致。 */
function today() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 附件桶是私有桶，且没有给普通用户开 RLS 策略。
 * 读写统一走 service role，权限判断在下面按"路径属主"自己做。
 */
async function contextSafe(req: NextRequest, required = true) {
  const { user } = await context(req, required);
  return { db: adminClient(), user };
}

type AdminDb = ReturnType<typeof adminClient>;

async function usedToday(db: AdminDb, userId: string) {
  const day = today();
  const { data, error } = await db.storage.from(ATTACHMENT_BUCKET).list(day, { limit: 1000, search: userId });
  if (error) return { used: 0, error: true as const };
  const files = (data ?? []).filter((item) => item.name?.startsWith(`${userId}__`));
  const synced = await db.rpc("sync_daily_attachment_usage", { p_user_id: userId, p_day: day, p_observed_count: files.length });
  if (synced.error) return { used: 0, error: true as const };
  return { used: Number(synced.data) || 0, error: false as const };
}

async function dailyAllowance(db: AdminDb, userId: string) {
  const [profile, membership] = await Promise.all([
    db.from("profiles").select("membership_tier").eq("id", userId).maybeSingle(),
    db.from("user_memberships").select("tier,expires_at,pending_tier,pending_days").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error || membership.error) throw new ApiError(503, "会员额度暂时无法读取");
  const row = membership.data;
  let tier = row?.tier || profile.data?.membership_tier || "free";
  if (row?.expires_at && Date.parse(row.expires_at) <= Date.now()) tier = row.pending_tier && row.pending_days > 0 ? row.pending_tier : "free";
  if (!(tier === "plus" || tier === "pro")) tier = "free";
  const plan = await db.from("membership_plans").select("daily_attachment_allowance").eq("tier", tier).maybeSingle();
  if (plan.error || !plan.data) throw new ApiError(503, "会员额度暂时无法读取");
  return { tier, limit: Number(plan.data.daily_attachment_allowance) };
}

function safeDisplayName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "附件";
}

/**
 * 附件归属判断：作者本人随时可下；其余人只有在附件已被某篇「已公开」作品引用时才可下载。
 * 早前只校验"路径属主"，导致读者点开别人的作品附件一律 403。
 */
async function canRead(db: AdminDb, path: string, userId: string) {
  const { data } = await db
    .from("posts")
    .select("id,status,author_id")
    .filter("resource_data->attachments", "cs", JSON.stringify([{ path }]));
  const rows = data ?? [];
  return rows.some((row) => row.author_id === userId || row.status === "published");
}

/** 今日剩余名额。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const path = req.nextUrl.searchParams.get("path");
    if (path) {
      await requireFeature("download");
      const { db, user } = await contextSafe(req, false);
      // 私有桶不给直链，签发 7 天有效的下载链接。
      if ((!user || attachmentOwner(path) !== user.id) && !(await canRead(db, path, user?.id || ""))) throw new ApiError(403, "附件不存在");
      const preview = req.nextUrl.searchParams.get("preview") === "1";
      if (preview && !isPreviewableAttachment(path)) throw new ApiError(400, "该附件类型不支持在线预览，请下载后查看");
      // Force attachments to download by default. Only the explicit safe
      // preview allowlist may open inline, so executable/resource types cannot
      // run inside a browser page.
      const requestedName = req.nextUrl.searchParams.get("name") || path.split("/").pop() || "attachment";
      const download = preview ? undefined : safeDisplayName(requestedName);
      const { data, error } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 3600, { download });
      if (error || !data?.signedUrl) throw new ApiError(404, "附件不存在或已过期");
      return { url: data.signedUrl };
    }
    const { db, user } = await contextSafe(req);
    if (!user) throw new ApiError(401, "请先登录");
    const [usage, entitlement] = await Promise.all([usedToday(db, user.id), dailyAllowance(db, user.id)]);
    if (usage.error) throw new ApiError(503, "今日附件额度暂时无法读取");
    return { used: usage.used, limit: entitlement.limit, remaining: Math.max(0, entitlement.limit - usage.used), tier: entitlement.tier, max_files: MAX_ATTACHMENT_FILES, max_file_bytes: MAX_ATTACHMENT_BYTES, max_total_bytes: MAX_ATTACHMENT_TOTAL_BYTES };
  });
}

/** 上传一个附件。名额在落盘前后各校验一次，抢不到就回滚。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    await requireFeature("upload");
    const { db, user } = await contextSafe(req);
    if (!user) throw new ApiError(401, "请先登录");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new ApiError(400, "请选择要上传的文件");
    if (file.size > MAX_ATTACHMENT_BYTES) throw new ApiError(400, "单个附件不能超过 30 MB");
    const ext = attachmentExtension(file.name);
    if (!ATTACHMENT_MIME[ext]) throw new ApiError(400, `不支持 ${ext ? "." + ext : "该"} 格式，可上传 APK、压缩包、PDF、文档或图片`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!attachmentContentMatches(ext, bytes)) throw new ApiError(400, "文件内容与扩展名不一致，请确认文件完整后重新上传");

    const day = today();
    const uploadId = String(form.get("uploadId") || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) throw new ApiError(400, "附件上传编号无效，请重新选择文件");
    const fileName = `${user.id}__${uploadId}.${ext}`;
    const path = `${day}/${fileName}`;
    const existingFiles = await db.storage.from(ATTACHMENT_BUCKET).list(day, { limit: 10, search: fileName });
    if (existingFiles.error) throw new ApiError(503, "附件暂时无法核验，请稍后重试");
    const existing = (existingFiles.data || []).find((item) => item.name === fileName);
    if (existing) {
      if (Number(existing.metadata?.size) !== file.size) throw new ApiError(409, "此附件上传编号已用于其他文件，请重新选择后再试");
      const [usage, entitlement] = await Promise.all([usedToday(db, user.id), dailyAllowance(db, user.id)]);
      if (usage.error) throw new ApiError(503, "今日附件额度暂时无法读取");
      return { path, name: safeDisplayName(file.name), size: file.size, mime: ATTACHMENT_MIME[ext], remaining: Math.max(0, entitlement.limit - usage.used) };
    }

    const entitlement = await dailyAllowance(db, user.id);
    const observed = await usedToday(db, user.id);
    if (observed.error) throw new ApiError(503, "今日附件额度暂时无法读取");
    const reservation = await db.rpc("reserve_daily_attachment_slot", { p_user_id: user.id, p_day: day, p_limit: entitlement.limit });
    if (reservation.error) {
      if (/daily_attachment_limit_reached/i.test(reservation.error.message || "")) {
        throw new ApiError(409, `今天的 ${entitlement.limit} 个附件名额已用完，明天再来试试`);
      }
      throw new ApiError(503, "附件额度暂不可用，请稍后重试");
    }
    const used = Number(reservation.data) || observed.used + 1;
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
      contentType: ATTACHMENT_MIME[ext],
      upsert: false,
    });
    if (error) {
      await db.rpc("release_daily_attachment_slot", { p_user_id: user.id, p_day: day });
      throw new ApiError(503, "附件上传失败，请稍后重试");
    }

    return {
      path,
      name: safeDisplayName(file.name),
      size: file.size,
      mime: ATTACHMENT_MIME[ext],
      remaining: Math.max(0, entitlement.limit - used),
    };
  });
}

/** 移除尚未发布的附件，名额随之归还。 */
export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await contextSafe(req);
    if (!user) throw new ApiError(401, "请先登录");
    const path = req.nextUrl.searchParams.get("path") || "";
    const fileName = path.split("/").pop() || "";
    // 只能删自己上传的：路径形如 2026-11-17/<uid>__<uuid>.apk
    if (!/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}__[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(path) || !fileName.startsWith(`${user.id}__`)) {
      throw new ApiError(400, "附件路径无效");
    }
    const referenced = await db.from("posts").select("id,status").filter("resource_data->attachments", "cs", JSON.stringify([{ path }])).limit(20);
    dbError(referenced.error);
    if ((referenced.data || []).some((post) => post.status === "published")) throw new ApiError(409, "该附件仍属于已发布作品，先提交修改并等待审核后再清理");
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove([path]);
    dbError(error);
    const [year, month, day] = path.slice(0, 10).split("-").map(Number);
    const usageDay = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    await db.rpc("release_daily_attachment_slot", { p_user_id: user.id, p_day: usageDay });
    return { removed: true };
  });
}
