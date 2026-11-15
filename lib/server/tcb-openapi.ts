import crypto from "node:crypto";
import { ApiError } from "@/lib/server/api";

const HOST = "tcb.tencentcloudapi.com";
const SERVICE = "tcb";
const VERSION = "2018-06-08";
const REGION = process.env.TCB_REGION?.trim() || "ap-shanghai";

type Credentials = { secretId: string; secretKey: string; token?: string };

/**
 * 云托管容器内若绑定了角色，平台会注入临时凭证；自建服务器可通过环境变量配置子账号密钥。
 * 注册、改密等账号生命周期操作只能走腾讯云 OpenAPI，故单独在此封装。
 */
export function credentials(): Credentials | null {
  const secretId = process.env.TENCENTCLOUD_SECRETID?.trim();
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY?.trim();
  if (!secretId || !secretKey) return null;
  return { secretId, secretKey, token: process.env.TENCENTCLOUD_SESSIONTOKEN?.trim() || undefined };
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function hmac(key: crypto.BinaryLike, msg: string) {
  return crypto.createHmac("sha256", key).update(msg, "utf8").digest();
}

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const cred = credentials();
  if (!cred) {
    throw new ApiError(503, "账号服务尚未配置腾讯云密钥（TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY）");
  }
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const scope = `${date}/${SERVICE}/tc3_request`;

  const signedHeaders = cred.token ? "content-type;host;x-tc-action;x-tc-token" : "content-type;host;x-tc-action";
  const headerLines = [
    "content-type:application/json; charset=utf-8",
    `host:${HOST}`,
    `x-tc-action:${action.toLowerCase()}`,
    ...(cred.token ? [`x-tc-token:${cred.token}`] : []),
  ].join("\n");

  const canonicalRequest = ["POST", "/", "", `${headerLines}\n`, signedHeaders, sha256Hex(body)].join("\n");
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), scope, sha256Hex(canonicalRequest)].join("\n");
  const secretSigning = hmac(hmac(hmac(`TC3${cred.secretKey}`, date), SERVICE), "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");

  const response = await fetch(`https://${HOST}`, {
    method: "POST",
    headers: {
      Authorization: `TC3-HMAC-SHA256 Credential=${cred.secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": "application/json; charset=utf-8",
      Host: HOST,
      "X-TC-Action": action,
      "X-TC-Version": VERSION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": REGION,
      ...(cred.token ? { "X-TC-Token": cred.token } : {}),
    },
    body,
  });

  const data = (await response.json()) as { Response?: { Error?: { Code?: string; Message?: string } } } & T;
  const error = (data as { Response?: { Error?: { Code?: string; Message?: string } } }).Response?.Error;
  if (error) {
    if (/already|exist/i.test(error.Message || "")) throw new ApiError(409, "这个邮箱已注册");
    throw new ApiError(502, `账号服务返回错误：${error.Message || error.Code}`);
  }
  return (data as { Response: T }).Response;
}

export type CreatedUser = { Uid: string };

/** 创建一个云开发用户，返回其用户 ID（用于映射到应用侧 uuid）。 */
export async function createAuthUser(input: { email: string; password: string; name: string }) {
  return call<CreatedUser>("CreateUser", {
    EnvId: requireEnvId(),
    Name: input.name,
    Email: input.email,
    Password: input.password,
  });
}

/** 更新云开发用户信息（当前用于重置密码）。 */
export async function updateAuthUser(input: { uid: string; password?: string }) {
  return call<Record<string, unknown>>("ModifyAuthUser", {
    EnvId: requireEnvId(),
    Uid: input.uid,
    ...(input.password ? { Password: input.password } : {}),
  });
}

export function requireEnvId() {
  const envId = process.env.TCB_ENV_ID?.trim();
  if (!envId) throw new ApiError(503, "云开发环境 ID 未配置");
  return envId;
}
