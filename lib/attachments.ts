/** AI 内容附件的共享规则：前端做即时校验，服务端做最终判定。 */

export const ATTACHMENT_BUCKET = "post-attachments";
export const MAX_ATTACHMENT_FILES = 3;
export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 50 * 1024 * 1024;
export const DAILY_ATTACHMENT_QUOTA = 20;

export type PostAttachment = {
  path: string;
  name: string;
  size: number;
  mime: string;
};

export const ATTACHMENT_MIME: Record<string, string> = {
  apk: "application/vnd.android.package-archive",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  tgz: "application/gzip",
  pdf: "application/pdf",
  dmg: "application/x-apple-diskimage",
  ipa: "application/octet-stream",
  exe: "application/vnd.microsoft.portable-executable",
  msix: "application/msix",
  appimage: "application/octet-stream",
  deb: "application/vnd.debian.binary-package",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  yml: "text/yaml",
  yaml: "text/yaml",
  csv: "text/csv",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/plain",
  sh: "text/x-sh",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_MIME)
  .map((ext) => `.${ext}`)
  .join(",");

export function attachmentExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

export function formatAttachmentSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** 附件路径：2026-11-17/<uid>__<uuid>.apk，日期段用于每日名额统计。 */
export function attachmentOwner(path: string) {
  return (path.split("/").pop() || "").split("__")[0];
}

const PATH_PATTERN = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}__[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

/** 校验提交上来的附件列表，返回归一化结果或一条中文错误。 */
export function normalizeAttachments(input: unknown, userId: string): { items: PostAttachment[] } | { error: string } {
  if (input === undefined || input === null) return { items: [] };
  if (!Array.isArray(input)) return { error: "附件列表格式无效" };
  if (input.length > MAX_ATTACHMENT_FILES) return { error: `最多上传 ${MAX_ATTACHMENT_FILES} 个附件` };
  const items: PostAttachment[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { error: "附件信息无效" };
    const item = raw as Record<string, unknown>;
    const path = typeof item.path === "string" ? item.path : "";
    const size = Number(item.size);
    if (!PATH_PATTERN.test(path) || attachmentOwner(path) !== userId) return { error: "附件归属校验失败，请重新上传" };
    if (!attachmentExtension(path) || !ATTACHMENT_MIME[attachmentExtension(path)]) return { error: "附件格式不支持" };
    if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) return { error: "单个附件不能超过 30 MB" };
    items.push({
      path,
      name: String(item.name || "附件").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "附件",
      size,
      mime: String(item.mime || ATTACHMENT_MIME[attachmentExtension(path)]),
    });
  }
  const total = items.reduce((sum, item) => sum + item.size, 0);
  if (total > MAX_ATTACHMENT_TOTAL_BYTES) return { error: "附件总大小不能超过 50 MB" };
  return { items };
}

export function readAttachments(resourceData: unknown): PostAttachment[] {
  if (!resourceData || typeof resourceData !== "object") return [];
  const list = (resourceData as Record<string, unknown>).attachments;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.path !== "string" || !PATH_PATTERN.test(item.path)) return [];
    return [{
      path: item.path,
      name: String(item.name || "附件"),
      size: Number(item.size) || 0,
      mime: String(item.mime || "application/octet-stream"),
    }];
  });
}
