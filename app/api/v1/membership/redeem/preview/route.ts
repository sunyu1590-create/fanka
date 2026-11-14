import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

export const dynamic = "force-dynamic";

function normalizedCode(value: unknown) {
  if (typeof value !== "string") throw new ApiError(400, "请输入会员激活码");
  const code = value.trim().toUpperCase();
  if (!/^HEIKA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new ApiError(400, "卡密格式无效，请检查 HEIKA-XXXX-XXXX-XXXX 格式");
  return code;
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    const code = normalizedCode(body.code);
    const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
    const { data, error } = await db.rpc("preview_membership_code", { p_code_hash: codeHash });
    if (error?.message.includes("redemption rate limit")) throw new ApiError(429, "今日验证次数已达上限，请明天再试");
    dbError(error);
    return data;
  });
}
