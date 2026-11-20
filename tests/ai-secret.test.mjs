import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.AI_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const { decryptSecret, encryptSecret, SecretBoxError } = await import("../lib/server/secret-box.ts");

const SECRET = "sk-heika-test-0123456789abcdef";

test("密钥只以 AES-256-GCM 密文保存", () => {
  const payload = encryptSecret(SECRET);
  assert.ok(!payload.includes(SECRET), "密文里不能出现明文");
  const record = JSON.parse(payload);
  assert.equal(record.version, 1);
  assert.ok(record.iv && record.tag && record.ciphertext);
  assert.equal(decryptSecret(payload), SECRET);
});

test("每次加密使用独立 IV", () => {
  const first = JSON.parse(encryptSecret(SECRET));
  const second = JSON.parse(encryptSecret(SECRET));
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test("密文被篡改或加密密钥不匹配时拒绝解密", () => {
  const payload = encryptSecret(SECRET);
  const tampered = JSON.parse(payload);
  tampered.ciphertext = Buffer.from("tampered-value").toString("base64");
  assert.throws(() => decryptSecret(JSON.stringify(tampered)), (error) => error instanceof SecretBoxError && error.reason === "decrypt_failed");
  process.env.AI_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptSecret(payload), (error) => error instanceof SecretBoxError && error.reason === "decrypt_failed");
  process.env.AI_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

test("缺少或长度错误的加密密钥时拒绝加密", () => {
  const saved = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
  assert.throws(() => encryptSecret(SECRET), (error) => error instanceof SecretBoxError && error.reason === "key_missing");
  process.env.AI_SETTINGS_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
  assert.throws(() => encryptSecret(SECRET), (error) => error instanceof SecretBoxError && error.reason === "key_invalid");
  process.env.AI_SETTINGS_ENCRYPTION_KEY = saved;
});

test("密钥存储只走 Supabase，不再依赖 Vercel Blob 或服务器本地文件", () => {
  const source = readFileSync(new URL("../lib/server/ai-secret.ts", import.meta.url), "utf8");
  assert.ok(!source.includes("@vercel/blob"), "不应再引用 @vercel/blob");
  assert.ok(!source.includes("BLOB_READ_WRITE_TOKEN"), "不应再读取 Blob 令牌");
  assert.ok(!source.includes("AI_SECRET_FILE"), "不应再写本地密钥文件");
  assert.ok(source.includes('from("app_secrets")'), "密钥应读写 app_secrets 表");
});
