import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 纯加密工具：只依赖 node:crypto，方便单元测试。
 * 密钥来自环境变量 AI_SETTINGS_ENCRYPTION_KEY（base64 编码的 32 字节）。
 */
export type SecretBoxReason = "key_missing" | "key_invalid" | "decrypt_failed";

export class SecretBoxError extends Error {
  readonly reason: SecretBoxReason;

  constructor(message: string, reason: SecretBoxReason) {
    super(message);
    this.name = "SecretBoxError";
    this.reason = reason;
  }
}

function encryptionKey() {
  const encoded = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  if (!encoded) throw new SecretBoxError("AI 密钥加密密钥尚未配置", "key_missing");
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32) throw new SecretBoxError("AI 密钥加密配置无效", "key_invalid");
  return key;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}

export function decryptSecret(value: string) {
  try {
    const record = JSON.parse(value) as { version: number; iv: string; tag: string; ciphertext: string };
    if (record.version !== 1) throw new Error("unsupported version");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof SecretBoxError) throw error;
    throw new SecretBoxError("密文无法解密", "decrypt_failed");
  }
}
