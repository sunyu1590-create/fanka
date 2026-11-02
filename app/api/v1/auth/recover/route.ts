import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, jsonBody, respond, textField } from "@/lib/server/api";

function digest(code: string) {
  return createHash("sha256").update(code.replace(/[^a-f0-9]/gi, "").toUpperCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const body = await jsonBody(req);
    const email = textField(body.email, "邮箱", 3, 254).toLowerCase();
    const code = textField(body.code, "恢复码", 10, 64);
    const password = textField(body.password, "新密码", 8, 128);
    const db = adminClient();
    const { data: row, error } = await db.from("account_recovery_codes").delete().eq("email", email).eq("code_hash", digest(code)).select("user_id").maybeSingle();
    if (error) throw new ApiError(503, "恢复码验证暂不可用");
    if (!row) throw new ApiError(400, "邮箱或恢复码不正确");
    const { error: updateError } = await db.auth.admin.updateUserById(row.user_id, { password });
    if (updateError) throw new ApiError(400, "密码更新失败，请重新生成恢复码后再试");
    return { message: "密码已更新，请使用新密码登录" };
  });
}
