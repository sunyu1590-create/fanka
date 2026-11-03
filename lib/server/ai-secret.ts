import { del, get, put } from "@vercel/blob";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/server/api";

const SECRET_PATH = "private/ai/deepseek-key.json";

function encryptionKey() {
  const encoded = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  if (!encoded) throw new ApiError(503, "AI 密钥云端保险箱尚未配置");
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32) throw new ApiError(503, "AI 密钥加密配置无效");
  return key;
}

export function encryptAiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}

export function decryptAiKey(value: string) {
  try {
    const record = JSON.parse(value) as { version: number; iv: string; tag: string; ciphertext: string };
    if (record.version !== 1) throw new Error("unsupported version");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new ApiError(503, "AI 密钥无法读取，请在管理后台重新保存");
  }
}

export async function saveAiKey(key: string) {
  await put(SECRET_PATH, encryptAiKey(key), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0 });
}

export async function readAiKey() {
  const file = await get(SECRET_PATH, { access: "private", useCache: false });
  if (!file) return null;
  return decryptAiKey(await new Response(file.stream).text());
}

export async function deleteAiKey() {
  await del(SECRET_PATH);
}
