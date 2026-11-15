import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import { subFromToken, tokenFrom } from "@/lib/server/cb";
import { updateAuthUser } from "@/lib/server/tcb-openapi";

/** 修改当前登录用户的密码（走腾讯云用户管理接口）。 */
export async function POST(req: Request) {
  try {
    const token = tokenFrom(req);
    if (!token) throw new ApiError(401, "请先登录");
    const sub = subFromToken(token);
    const body = (await req.json()) as { password?: string };
    const password = String(body.password ?? "");
    if (password.length < 8) throw new ApiError(400, "密码至少需要 8 位");

    await updateAuthUser({ uid: sub, password });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "密码更新失败" }, { status });
  }
}
