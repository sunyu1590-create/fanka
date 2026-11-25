"use client";

import { cloudRequest } from "./cloud";
import { promptInApp } from "./in-app-dialog";

/**
 * 高风险操作的二次验证（前端）。
 *
 * 调用方 await ensureReauth() 即可：有未过期的令牌直接返回；
 * 否则弹一次密码框，交给 /api/v1/admin/reauth 校验并签发 5 分钟令牌。
 * 令牌只放在内存里，刷新页面即失效。
 */

type Ticket = { token: string; expiresAt: number };

let ticket: Ticket | null = null;
let inflight: Promise<string> | null = null;

export function reauthToken() {
  if (ticket && ticket.expiresAt - 5000 > Date.now()) return ticket.token;
  return null;
}

export async function ensureReauth(): Promise<string> {
  const cached = reauthToken();
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const password = await promptInApp("这是一项高风险操作，请重新输入当前账号的登录密码以确认身份。验证结果 5 分钟内有效。", "", {
      title: "身份验证",
      confirmLabel: "验证并继续",
      danger: true,
      inputType: "password",
    });
    if (!password) throw new Error("已取消身份验证");
    const result = await cloudRequest("/api/v1/admin/reauth", { password }) as { token: string; expires_at: string } | null;
    if (!result?.token) throw new Error("身份验证失败，请重试");
    ticket = { token: result.token, expiresAt: new Date(result.expires_at).getTime() };
    return result.token;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** 便捷封装：高风险请求自动带上二次验证令牌。 */
export async function privilegedRequest(path: string, body?: unknown, method = body ? "POST" : "GET") {
  const token = await ensureReauth();
  return cloudRequest(path, body, method, { "x-heika-reauth": token });
}
