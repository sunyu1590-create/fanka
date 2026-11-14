import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    const previewToken = uuid(body.previewToken, "兑换预览");
    const { data, error } = await db.rpc("confirm_membership_redemption", { p_preview_id: previewToken });
    dbError(error);
    const result = data as { status?: string } | null;
    if (!result?.status) throw new ApiError(502, "兑换结果暂时不可用，请刷新后查看会员状态");
    return result;
  });
}
