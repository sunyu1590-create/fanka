import { ApiError } from "@/lib/server/api";
import { requireEnvId } from "@/lib/server/tcb-openapi";

export function gateway() {
  const explicit = process.env.CLOUDBASE_GATEWAY?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `https://${requireEnvId()}.api.tcloudbasegateway.com`;
}

function adminKey() {
  const key = process.env.CLOUDBASE_APIKEY?.trim();
  if (!key) throw new ApiError(503, "云开发服务端密钥尚未配置");
  return key;
}

/** 以服务端（service_role）身份访问 PostgREST。 */
export async function rest<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...restInit } = init;
  const response = await fetch(`${gateway()}/v1/rdb/rest${path}`, {
    ...restInit,
    headers: {
      Authorization: `Bearer ${adminKey()}`,
      "Content-Type": "application/json",
      ...(restInit.headers as Record<string, string> | undefined),
    },
    body: json === undefined ? restInit.body : JSON.stringify(json),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : (null as T);
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message || "云端数据服务异常";
    throw new ApiError(response.status === 409 ? 409 : 502, message);
  }
  return data;
}

export function tokenFrom(req: Request) {
  const match = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "");
  return match?.[1];
}

export function subFromToken(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub?: unknown };
    const sub = String(payload.sub ?? "");
    if (!sub) throw new Error("missing sub");
    return sub;
  } catch {
    throw new ApiError(401, "登录状态已失效");
  }
}

/** 确保当前登录用户拥有应用侧 uuid 身份，并返回该 uuid。 */
export async function ensureIdentity(sub: string) {
  const uid = await rest<string>("/rpc/ensure_user_identity", { method: "POST", json: { p_sub: sub } });
  return String(uid);
}
