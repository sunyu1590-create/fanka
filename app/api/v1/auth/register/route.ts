import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import { ensureIdentity, rest } from "@/lib/server/cb";
import { createAuthUser } from "@/lib/server/tcb-openapi";

function usernameFor(email: string) {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.:+@-]/g, "");
  const safe = /^[a-z0-9]/.test(base) ? base : `u${base}`;
  return (safe || "user").slice(0, 40);
}

/**
 * 注册：云开发注册接口强制要求验证码，因此由服务端调用腾讯云接口建号，
 * 用户侧仍然是「邮箱 + 密码」，体验与迁移前一致。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string; nickname?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const nickname = String(body.nickname ?? "").trim().slice(0, 24);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "请填写有效的邮箱地址");
    if (password.length < 8) throw new ApiError(400, "密码至少需要 8 位");

    const created = await createAuthUser({ email, password, name: usernameFor(email) });
    const uid = created?.Uid ? await ensureIdentity(String(created.Uid)) : "";

    if (uid) {
      await rest("/profiles?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        json: { id: uid, ...(nickname ? { nickname } : {}) },
      }).catch(() => undefined);
    }

    return NextResponse.json({ data: { uid, email } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "注册失败" }, { status });
  }
}
