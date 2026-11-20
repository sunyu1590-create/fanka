import { del, get, put } from "@vercel/blob";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ApiError } from "@/lib/server/api";

const SECRET_PATH = "private/ai/deepseek-key.json";

/**
 * 密钥存储有两套后端：
 * 1. 配置了 BLOB_READ_WRITE_TOKEN 时，沿用 Blob 私有对象（多实例共享）；
 * 2. 自托管单机部署没有 Blob 时，写到服务器本地文件（同样 AES-256-GCM 加密）。
 * 两条路径存储的都是密文，明文只在进程内存中出现。
 */
function localSecretFile() {
  return process.env.AI_SECRET_FILE || join(process.cwd(), "data", "ai-secret.json");
}

function usesBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

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

async function readLocalSecret() {
  try {
    return await readFile(localSecretFile(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ApiError(503, "AI 密钥文件无法读取，请检查服务器数据目录权限");
  }
}

export async function saveAiKey(key: string) {
  const payload = encryptAiKey(key);
  if (usesBlob()) {
    await put(SECRET_PATH, payload, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0 });
    return;
  }
  const file = localSecretFile();
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, payload, { encoding: "utf8", mode: 0o600 });
}

export async function readAiKey() {
  if (!usesBlob()) {
    const stored = await readLocalSecret();
    return stored ? decryptAiKey(stored) : null;
  }
  try {
    const file = await get(SECRET_PATH, { access: "private", useCache: false });
    if (!file) return null;
    return decryptAiKey(await new Response(file.stream).text());
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Blob 未授权或网络异常时按"未配置"处理，管理界面仍能打开并提示配置。
    return null;
  }
}

export async function deleteAiKey() {
  if (usesBlob()) {
    await del(SECRET_PATH);
    return;
  }
  await rm(localSecretFile(), { force: true });
}
