import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function rootKey() {
  const raw = process.env.HEIKA_REDEEM_CODE_KEY;
  if (!raw) throw new Error("HEIKA_REDEEM_CODE_KEY 未配置");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("HEIKA_REDEEM_CODE_KEY 必须是 32 字节 Base64 密钥");
  return key;
}

function derivedKey(label: string) {
  return createHmac("sha256", rootKey()).update(`heika-redeem:${label}`).digest();
}

export function normalizeRedeemCode(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[\s-]/g, "");
  if (!compact.startsWith("HEIKA")) return null;
  const body = compact.slice(5);
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{20}$/.test(body)) return null;
  return `HEIKA-${body.match(/.{4}/g)!.join("-")}`;
}

export function hashRedeemCode(value: unknown) {
  const normalized = normalizeRedeemCode(value);
  if (!normalized) return null;
  return createHmac("sha256", derivedKey("lookup")).update(normalized).digest("hex");
}

export function generateRedeemCode() {
  const body = Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join("");
  const code = `HEIKA-${body.match(/.{4}/g)!.join("-")}`;
  return { code, hash: hashRedeemCode(code)!, suffix: body.slice(-4) };
}

export function encryptRedeemCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("encrypt"), iv);
  const data = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptRedeemCode(value: string) {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("卡密密文格式无效");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey("encrypt"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function redeemCodeConfigurationReady() {
  try { rootKey(); return true; } catch { return false; }
}
