import { NextResponse } from "next/server";

/**
 * 前端只需要网关地址；数据与存储请求由浏览器携带用户 access_token 直连网关，
 * 不再向前端下发任何长期密钥。
 */
export async function GET() {
  const envId = process.env.TCB_ENV_ID?.trim();
  const gateway = (process.env.CLOUDBASE_GATEWAY?.trim() || (envId ? `https://${envId}.api.tcloudbasegateway.com` : "")).replace(/\/$/, "");
  if (!gateway) {
    return NextResponse.json({ error: "账户服务暂不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ gateway }, { headers: { "Cache-Control": "no-store" } });
}
