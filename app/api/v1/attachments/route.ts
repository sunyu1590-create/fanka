import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_MIME,
  DAILY_ATTACHMENT_QUOTA,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_FILES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  attachmentExtension,
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
async function contextSafe(req: NextRequest) {
  const { user } = await context(req);
  return { db: adminClient(), user };
}

type AdminDb = ReturnType<typeof adminClient>;

async function usedToday(db: AdminDb) {
  const { data, error } = await db.storage.from(ATTACHMENT_BUCKET).list(today(), { limit: 1000 });
  if (error) return { used: 0, error: true as const };
  // 目录占位对象（0 字节、以 . 开头）不计入名额。
  const files = (data ?? []).filter((item) => item.name && !item.name.startsWith(".") && item.name !== today());
  return { used: files.length, error: false as const };
}

function safeDisplayName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "附件";
}

/** 今日剩余名额。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await contextSafe(req);
    if (!user) throw new ApiError(401, "请先登录");
    const path = req.nextUrl.searchParams.get("path");
    if (path) {
      // 私有桶不给直链，签发 7 天有效的下载链接。
      const owner = (path.split("/").pop() || "").split("__")[0];
      if (owner !== user.id) throw new ApiError(403, "附件不存在");
      const download = req.nextUrl.searchParams.get("name") || undefined;
      const { data, error } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 604800, download ? { download } : undefined);
      if (error || !data?.signedUrl) throw new ApiError(404, "附件不存在或已过期");
      return { url: data.signedUrl };
    }
    const { used } = await usedToday(db);
    return { used, limit: DAILY_ATTACHMENT_QUOTA, remaining: Math.max(0, DAILY_ATTACHMENT_QUOTA - used), max_files: MAX_ATTACHMENT_FILES, max_file_bytes: MAX_ATTACHMENT_BYTES, max_total_bytes: MAX_ATTACHMENT_TOTAL_BYTES };
  });
}

/** 上传一个附件。名额在落盘前后各校验一次，抢不到就回滚。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await contextSafe(req);
    if (!user) throw new ApiError(401, "请先登录");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new ApiError(400, "请选择要上传的文件");
    if (file.size > MAX_ATTACHMENT_BYTES) throw new ApiError(400, "单个附件不能超过 30 MB");
    const ext = attachmentExtension(file.name);
    if (!ATTACHMENT_MIME[ext]) throw new ApiError(400, `不支持 ${ext ? "." + ext : "该"} 格式，可上传 APK、压缩包、PDF、文档或图片`);

    const before = await usedToday(db);
    if (before.used >= DAILY_ATTACHMENT_QUOTA) {
      throw new ApiError(409, `今天全服的 ${DAILY_ATTACHMENT_QUOTA} 个附件名额已经用完，明天再来试试`);
    }

    const day = today();
    const id = crypto.randomUUID();
    const path = `${day}/${user.id}__${id}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
      contentType: ATTACHMENT_MIME[ext],
      upsert: false,
    });
    if (error) throw new ApiError(503, "附件上传失败，请稍后重试");

    // 复核：并发下可能同时越过上限，最后一个人回滚自己的文件。
    const after = await usedToday(db);
    if (after.used > DAILY_ATTACHMENT_QUOTA) {
      await db.storage.from(ATTACHMENT_BUCKET).remove([path]);
      throw new ApiError(409, `名额刚被抢完了（${DAILY_ATTACHMENT_QUOTA}/${DAILY_ATTACHMENT_QUOTA}），请稍后再试`);
    }

    return {
      path,
      name: safeDisplayName(file.name),
      size: file.size,
      mime: ATTACHMENT_MIME[ext],
      remaining: Math.max(0, DAILY_ATTACHMENT_QUOTA - after.used),
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
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove([path]);
    dbError(error);
    return { removed: true };
  });
}
