import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, jsonBody, respond, textField } from "@/lib/server/api";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE = /already|registered|exists|duplicate/i;

/**
 * 原生客户端注册入口。
 *
 * Supabase 自带的 signup 需要邮箱确认或验证码，原生 App 的验证码通道在
 * 当前后端不可用，因此这里由服务端直接用 service role 建号并把邮箱标记为
 * 已确认，随后客户端用邮箱密码登录即可。
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const body = await jsonBody(req);
    const email = textField(body.email, "邮箱", 3, 254).toLowerCase();
    if (!EMAIL.test(email)) throw new ApiError(400, "邮箱格式不正确");
    const password = textField(body.password, "密码", 8, 128);
    const rawNickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    const nickname = rawNickname ? textField(rawNickname, "昵称", 1, 24) : email.split("@")[0].slice(0, 24);

    const db = adminClient();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: nickname },
    });

    if (error) {
      if (DUPLICATE.test(error.message)) throw new ApiError(409, "该邮箱已注册，请直接登录");
      throw new ApiError(400, error.message || "注册失败，请稍后重试");
    }

    const uid = data.user?.id;
    if (!uid) throw new ApiError(500, "注册失败，请稍后重试");

    // 触发器可能已经建好资料行，这里只补昵称，失败不影响建号结果。
    await db.from("profiles").update({ nickname }).eq("id", uid);

    return { uid, email };
  });
}
