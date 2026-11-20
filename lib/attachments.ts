/** AI 内容附件的共享规则：前端做即时校验，服务端做最终判定。 */

export const ATTACHMENT_BUCKET = "post-attachments";
export const MAX_ATTACHMENT_FILES = 3;
export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 50 * 1024 * 1024;
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

export const PREVIEWABLE_ATTACHMENT_EXTENSIONS = [
  "pdf", "txt", "md", "markdown", "json", "yaml", "yml", "csv",
  "png", "jpg", "jpeg", "webp",
] as const;

export function attachmentExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

export function isPreviewableAttachment(name: string) {
  return PREVIEWABLE_ATTACHMENT_EXTENSIONS.includes(attachmentExtension(name) as typeof PREVIEWABLE_ATTACHMENT_EXTENSIONS[number]);
}

const ZIP_BASED_ATTACHMENT_EXTENSIONS = new Set(["apk", "zip", "docx", "xlsx", "pptx", "ipa", "msix"]);

function asciiAt(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > bytes.length) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function hasSignature(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false;
  }
  return true;
}

/**
 * 文件内容特征校验：扩展名可以随便改，但文件头改不了。
 * 只做"是否与该扩展名匹配"的判定，不做杀毒；解码文本时限制前 64 KB，
 * 避免大文件整份读入内存。
 */
export function attachmentContentMatches(extension: string, bytes: Uint8Array) {
  const ext = extension.toLowerCase();
  if (ZIP_BASED_ATTACHMENT_EXTENSIONS.has(ext)) return hasSignature(bytes, [0x50, 0x4b]);
  switch (ext) {
    case "rar": return hasSignature(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
    case "7z": return hasSignature(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    case "gz":
    case "tgz": return hasSignature(bytes, [0x1f, 0x8b]);
    case "tar": return asciiAt(bytes, 257, 5) === "ustar";
    case "pdf": return asciiAt(bytes, 0, 5) === "%PDF-";
    case "png": return hasSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg": return hasSignature(bytes, [0xff, 0xd8, 0xff]);
    case "webp": return asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP";
    case "exe": return asciiAt(bytes, 0, 2) === "MZ";
    case "deb": return asciiAt(bytes, 0, 7) === "!<arch>";
    case "appimage": return hasSignature(bytes, [0x7f, 0x45, 0x4c, 0x46]);
    case "dmg": return bytes.length > 512 && asciiAt(bytes, bytes.length - 512, 4) === "koly";
    case "txt":
    case "md":
    case "json":
    case "yml":
    case "yaml":
    case "csv":
    case "py":
    case "js":
    case "ts":
    case "sh": {
      const head = bytes.subarray(0, 64 * 1024);
      if (head.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(head);
        return true;
      } catch {
        return false;
      }
    }
    default: return false;
  }
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
