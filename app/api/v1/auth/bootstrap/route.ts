import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";

/**
 * 原生客户端的身份引导接口。
 *
 * 登录成功后客户端无法自己解析 access_token 的 subject，这里回一次服务端
 * 身份，顺带把资料概要带回去，避免客户端再多发一次请求。
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const profile = await db
      .from("profiles")
      .select("id,nickname,role,membership_tier,avatar_url")
      .eq("id", user!.id)
      .maybeSingle();
    return { uid: user!.id, profile: profile.data ?? null };
  });
}
