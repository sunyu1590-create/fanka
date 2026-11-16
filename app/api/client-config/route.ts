import { NextResponse } from "next/server";
import { config } from "@/lib/server/api";

function isPublicSupabaseKey(key: string) {
  if (key.startsWith("sb_publishable_")) return true;
  if (key.startsWith("sb_secret_") || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")) as { role?: unknown };
    return payload.role === "anon";
  } catch { return false; }
}

const FALLBACK_GATEWAY = "https://moonclean.shop";

/**
 * 手机端使用的同域网关。站点本身会把 /auth/v1、/storage 反向代理到 Supabase，
 * 客户端只需要认识一个域名，不必跨境直连东京节点。
 */
function gatewayOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) return `${proto}://${host}`;
  return FALLBACK_GATEWAY;
}

export async function GET(request: Request) {
  try {
    const { url, key } = config();
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" || !isPublicSupabaseKey(key)) throw new Error("invalid public Supabase configuration");
    return NextResponse.json(
      {
        url: parsedUrl.toString().replace(/\/$/, ""),
        gateway: gatewayOrigin(request),
        key,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "账户服务暂不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
