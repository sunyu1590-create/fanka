import type { NextRequest } from "next/server";

/**
 * 取真实客户端 IP。
 *
 * 线上链路是 Caddy → Next.js：Caddy 会把直连地址追加到 X-Forwarded-For 末尾，
 * 客户端自己伪造的值只会排在前面，所以取最后一段才是可信来源。
 */
export function clientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const chain = forwarded.split(",").map((item) => item.trim()).filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  return req.headers.get("x-real-ip")?.trim() || "";
}
