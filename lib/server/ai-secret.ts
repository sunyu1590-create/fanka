import { adminClient } from "@/lib/server/admin-client";
import { ApiError } from "@/lib/server/api";
import { SecretBoxError, decryptSecret, encryptSecret } from "@/lib/server/secret-box";

/**
 * AI 供应商密钥（当前为 DeepSeek）统一存放在 Supabase 的 public.app_secrets 表。
 * 该表只对 service_role 开放，应用写入的是 AES-256-GCM 密文，
 * 明文只在进程内存中出现，任何日志、接口响应和数据库行都不含明文。
 * 不再使用 Vercel Blob，也不依赖服务器本地文件，多实例部署天然共享同一份密钥。
 */
const SECRET_NAME = "ai.deepseek.api_key";

function secretDb() {
  try {
    return adminClient();
  } catch {
    throw new ApiError(503, "AI 密钥保险箱尚未连接数据库，请检查 Supabase 服务端配置");
  }
}

function toApiError(error: unknown) {
  if (error instanceof SecretBoxError) {
    if (error.reason === "decrypt_failed") return new ApiError(503, "AI 密钥无法读取，请在管理后台重新保存");
    return new ApiError(503, error.message);
  }
  return error;
}

export function encryptAiKey(value: string) {
  try {
    return encryptSecret(value);
  } catch (error) {
    throw toApiError(error);
  }
}

export function decryptAiKey(value: string) {
  try {
    return decryptSecret(value);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function saveAiKey(key: string, updatedBy: string | null = null) {
  const payload = encryptAiKey(key);
  const { error } = await secretDb()
    .from("app_secrets")
    .upsert({ name: SECRET_NAME, ciphertext: payload, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: "name" });
  if (error) throw new ApiError(503, "AI 密钥保存失败，请稍后重试");
}

export async function readAiKey() {
  const { data, error } = await secretDb().from("app_secrets").select("ciphertext").eq("name", SECRET_NAME).maybeSingle();
  if (error) throw new ApiError(503, "AI 密钥读取失败，请稍后重试");
  if (!data?.ciphertext) return null;
  return decryptAiKey(data.ciphertext as string);
}

export async function deleteAiKey() {
  const { error } = await secretDb().from("app_secrets").delete().eq("name", SECRET_NAME);
  if (error) throw new ApiError(503, "AI 密钥删除失败，请稍后重试");
}
