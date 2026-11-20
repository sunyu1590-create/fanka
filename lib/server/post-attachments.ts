import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES, normalizeAttachments, readAttachments, type PostAttachment } from "@/lib/attachments";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError } from "@/lib/server/api";

/** Validate ownership and storage existence before a post/revision can reference files. */
export async function postAttachments(input: unknown, userId: string, previous?: unknown): Promise<PostAttachment[]> {
  const parsed = input === undefined ? { items: readAttachments(previous) } : normalizeAttachments(input, userId);
  if ("error" in parsed) throw new ApiError(400, parsed.error);
  if (!parsed.items.length) return [];

  const admin = adminClient();
  const byDay = new Map<string, Map<string, number>>();
  let totalBytes = 0;
  for (const item of parsed.items) {
    const day = item.path.slice(0, 10);
    if (!byDay.has(day)) {
      const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).list(day, { limit: 1000, search: `${userId}__` });
      if (error) throw new ApiError(503, "附件暂时无法核验，请稍后重试");
      byDay.set(day, new Map((data || []).map((entry) => [`${day}/${entry.name}`, entry.metadata?.size == null ? -1 : Number(entry.metadata.size)])));
    }
    const storedSize = byDay.get(day)?.get(item.path);
    if (storedSize === undefined) throw new ApiError(409, "附件尚未上传完成，请重新上传后再保存");
    // 以存储里的真实大小为准，防止客户端少报 size 绕过总量限制；读不到元数据时退回声明值。
    const actualSize = storedSize >= 0 ? storedSize : item.size;
    if (actualSize > MAX_ATTACHMENT_BYTES) throw new ApiError(400, "单个附件不能超过 30 MB");
    totalBytes += actualSize;
  }
  if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new ApiError(400, "附件总大小不能超过 50 MB");
  return parsed.items;
}

export function withPostAttachments(resourceData: unknown, attachments: PostAttachment[]) {
  const current = resourceData && typeof resourceData === "object" && !Array.isArray(resourceData)
    ? resourceData as Record<string, unknown>
    : {};
  const next = { ...current };
  if (attachments.length) next.attachments = attachments;
  else delete next.attachments;
  return next;
}
