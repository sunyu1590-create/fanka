import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/server/api";

/**
 * 高风险操作的二次身份验证。
 *
 * 管理员在弹窗里重新输入一次登录密码，服务端用 Supabase 校验通过后签发一个
 * 5 分钟有效的短期令牌；永久封禁、永久删除、批量清理、防火墙修改、全站维护
 * 这类操作必须带这个令牌。令牌是 HMAC 签名，服务端不落库，过期即失效。
 */

const WINDOW_MS = 5 * 60_000;

function secret() {
  return process.env.HEIKA_REAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

export function signReauth(userId: string, issuedAt = Date.now()) {
  const exp = issuedAt + WINDOW_MS;
  const payload = `${userId}.${exp}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date(exp).toISOString() };
}

export function verifyReauth(token: string, userId: string) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [id, exp, signature] = parts;
  if (id !== userId) return false;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = createHmac("sha256", secret()).update(`${id}.${exp}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 高风险接口入口调用；没有有效令牌直接 403，前端据此弹窗重新验证。 */
export function requireReauth(req: Request, userId: string) {
  const token = req.headers.get("x-heika-reauth") || "";
  if (!verifyReauth(token, userId)) {
    throw new ApiError(403, "该操作需要重新验证身份，请重新输入登录密码");
  }
}
