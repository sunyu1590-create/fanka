import { createHash } from "node:crypto";

/** 生成端使用的字母表：去掉容易看错的 I、O、0、1。 */
export const ACCESS_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const LEADING_PREFIX = /HEIKA([A-Z0-9]{12})/;
const BARE_CODE = /^([A-Z0-9]{12})$/;

/**
 * 把用户实际填写的内容还原成标准邀请码 / 认证码。
 *
 * 线上反馈里绝大多数「码无效」都不是码本身错了，而是输入形态不对：
 * 一次性复制了整批码、中文输入法打出的全角连字符、从聊天软件转发时混进的
 * 零宽字符与换行、或者把 20 位的码截断成 12 位后重新排版。这里统一做一次
 * 归一化，只要内容里出现过一段完整的 12 位码就能识别出来。
 *
 * 返回 null 表示完全无法识别，调用方应提示用户重新复制。
 */
export function normalizeAccessCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input
    .normalize("NFKC") // 全角字母、数字、连字符（U+FF0D）折回半角
    .toUpperCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // 零宽字符与 BOM
    .replace(/[^A-Z0-9]+/g, " "); // 连字符、空白、标点统一成空格

  const flat = text.replace(/ /g, "");
  if (!flat) return null;

  const prefixed = LEADING_PREFIX.exec(flat);
  const body = prefixed?.[1] ?? BARE_CODE.exec(flat)?.[1];
  if (!body) return null;

  return `HEIKA-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

/** 与数据库里 code_hash 的存储格式保持一致：小写十六进制 SHA-256。 */
export function hashAccessCode(code: string) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}
