import { NextRequest } from "next/server";
import { ApiError, context, jsonBody, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { hashAccessCode, normalizeAccessCode } from "@/lib/access-codes";

const REASON: Array<[RegExp, string]> = [
  [/invitation code can only be used during registration/i, "这是入驻邀请码，请在新用户注册页填写"],
  [/certification code must be redeemed after registration/i, "认证码需要先注册登录后再兑换"],
  [/already has this certification/i, "你的账号已经有这个认证标识了"],
  [/access code is unavailable/i, "这个码已被使用、已停用或已过期"],
  [/badge is unavailable|invitation badge is invalid/i, "该认证标识已停用，请联系管理员"],
  [/profile not found/i, "账号资料尚未就绪，请重新登录后再试"],
  [/invalid access code/i, "认证码格式不正确"],
];

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const code = normalizeAccessCode(body.code);
    if (!code) throw new ApiError(400, "认证码格式不正确，请重新完整复制（形如 HEIKA-XXXX-XXXX-XXXX）");
    const codeHash = hashAccessCode(code);
    const result = await adminClient().rpc("redeem_access_code", { p_code_hash: codeHash, p_user_id: user!.id, p_signup: false });
    if (result.error) {
      const raw = result.error.message || "";
      const friendly = REASON.find(([pattern]) => pattern.test(raw))?.[1];
      if (friendly) throw new ApiError(/unavailable|already has|only be used/i.test(raw) ? 409 : 400, friendly);
      throw new ApiError(503, "认证码兑换暂不可用，请稍后重试");
    }
    const redemption = result.data as { kind?: string; badge?: { label?: string }; batchLabel?: string };
    await recordModerationAudit(db, { actorId: user!.id, action: "certification_code_redeemed", targetType: "profile_badge", reason: `兑换认证码：${redemption.badge?.label || "认证"}`, details: { kind: redemption.kind, batchLabel: redemption.batchLabel } });
    return redemption;
  });
}
