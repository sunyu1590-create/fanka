import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, context, jsonBody, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    if (typeof body.code !== "string") throw new ApiError(400, "请输入认证码");
    const code = body.code.trim().toUpperCase().replace(/\s/g, "");
    if (!/^HEIKA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new ApiError(400, "认证码格式无效");
    const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
    const result = await adminClient().rpc("redeem_access_code", { p_code_hash: codeHash, p_user_id: user!.id, p_signup: false });
    if (result.error) {
      const message = result.error.message || "认证码兑换失败";
      if (/unavailable|already has|only be used|must be redeemed|badge is unavailable/i.test(message)) throw new ApiError(409, message);
      throw new ApiError(503, "认证码兑换暂不可用，请稍后重试");
    }
    const redemption = result.data as { kind?: string; badge?: { label?: string }; batchLabel?: string };
    await recordModerationAudit(db, { actorId: user!.id, action: "certification_code_redeemed", targetType: "profile_badge", reason: `兑换认证码：${redemption.badge?.label || "认证"}`, details: { kind: redemption.kind, batchLabel: redemption.batchLabel } });
    return redemption;
  });
}
