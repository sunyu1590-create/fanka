import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import { ensureIdentity, rest, subFromToken, tokenFrom } from "@/lib/server/cb";

/**
 * 登录后建立应用侧身份：把云开发的数字用户 ID 映射成应用 uuid，
 * 并确保 profiles 记录存在（原先由 auth.users 触发器完成）。
 */
export async function POST(req: Request) {
  try {
    const token = tokenFrom(req);
    if (!token) throw new ApiError(401, "请先登录");
    const sub = subFromToken(token);
    const uid = await ensureIdentity(sub);

    let nickname: string | undefined;
    try {
      const body = (await req.json()) as { nickname?: string };
      if (typeof body.nickname === "string") nickname = body.nickname.trim().slice(0, 24);
    } catch {
      // 无请求体亦可
    }

    await rest("/profiles?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      json: { id: uid, ...(nickname ? { nickname } : {}) },
    });

    return NextResponse.json({ data: { uid } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "身份初始化失败" }, { status });
  }
}
