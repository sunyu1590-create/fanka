import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, context, jsonBody, respond, uuid } from "@/lib/server/api";
import { hashRedeemCode, redeemCodeConfigurationReady } from "@/lib/server/redeem-code";

function codeError(message: string, action: "preview" | "redeem") {
  if (message.includes("membership_rate_limited")) throw new ApiError(429, "操作过于频繁，请稍后再试");
  if (message.includes("redeem_code_invalid")) throw new ApiError(400, "激活码无效，请检查后重试");
  if (message.includes("redeem_code_used")) throw new ApiError(409, "该激活码已兑换");
  if (message.includes("redeem_code_disabled")) throw new ApiError(409, "该激活码已停用，请联系发放方");
  if (message.includes("redeem_code_expired")) throw new ApiError(410, "该激活码已过期");
  if (message.includes("higher_permanent_membership")) throw new ApiError(409, "当前账号已有更高且无到期时间的会员权益，不能兑换较低档位卡密");
  if (message.includes("permanent_membership_already_active")) throw new ApiError(409, "当前账号已有相同或更高的长期会员权益，该卡密不会被消耗；请联系开发者处理");
  if (message.includes("invalid_redeem_request")) throw new ApiError(400, "兑换请求无效，请重新操作");
  if (message.includes("idempotency_key_reused")) throw new ApiError(409, "兑换请求编号已被用于其他激活码，请重新验证激活码");
  throw new ApiError(action === "preview" ? 400 : 409, "激活码暂时无法处理，请稍后重试");
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const body = await jsonBody(req);
    const action = body.action;
    if (action !== "preview" && action !== "redeem") throw new ApiError(400, "兑换操作无效");
    if (!redeemCodeConfigurationReady()) throw new ApiError(503, "激活码服务暂不可用，请稍后联系管理员");
    const hash = hashRedeemCode(body.code);
    if (!hash) throw new ApiError(400, "激活码格式无效，请检查卡密内容");
    const service = adminClient();
    if (action === "preview") {
      const { data: allowed, error: rateError } = await service.rpc("consume_membership_rate_limit", { p_user_id: user!.id, p_action: "preview", p_max_count: 10, p_window_seconds: 600, p_request_id: null, p_code_hash: hash });
      if (rateError) codeError(rateError.message, action);
      if (!allowed) throw new ApiError(429, "操作过于频繁，请稍后再试");
      const { data, error } = await service.rpc("preview_membership_code", { p_user_id: user!.id, p_code_hash: hash });
      if (error) codeError(error.message, action);
      return data;
    }
    const requestId = uuid(body.requestId, "兑换请求编号");
    const { data: allowed, error: rateError } = await service.rpc("consume_membership_rate_limit", { p_user_id: user!.id, p_action: "redeem", p_max_count: 5, p_window_seconds: 600, p_request_id: requestId, p_code_hash: hash });
    if (rateError) codeError(rateError.message, action);
    if (!allowed) throw new ApiError(429, "操作过于频繁，请稍后再试");
    const { data, error } = await service.rpc("redeem_membership_code", { p_user_id: user!.id, p_code_hash: hash, p_request_id: requestId });
    if (error) codeError(error.message, action);
    return data;
  });
}
