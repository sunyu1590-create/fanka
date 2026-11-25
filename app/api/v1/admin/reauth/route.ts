import { NextRequest } from "next/server";
import { ApiError, client, jsonBody, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { signReauth } from "@/lib/server/reauth";

export const runtime = "nodejs";

/**
 * 高风险操作的二次验证：重新校验当前管理员密码，签发 5 分钟令牌。
 * 只对已登录管理员开放，密码不落任何日志。
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "monitor.read");
    const body = await jsonBody(req);
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) throw new ApiError(400, "请输入登录密码");
    if (!user.email) throw new ApiError(400, "当前账号缺少邮箱，无法二次验证");
    const anon = client();
    const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password });
    if (error || !data.user || data.user.id !== user.id) throw new ApiError(401, "密码不正确");
    const ticket = signReauth(user.id);
    return { token: ticket.token, expires_at: ticket.expiresAt };
  });
}
