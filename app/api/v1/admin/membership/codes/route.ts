import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req); const body = await jsonBody(req);
    if (typeof body.code !== "string") throw new ApiError(400, "请输入完整卡密");
    const code = body.code.trim().toUpperCase().replace(/\s/g, "");
    if (!/^HEIKA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new ApiError(400, "卡密格式无效");
    const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
    const found = await db.from("redeem_codes").select("id,status").eq("code_hash", codeHash).maybeSingle(); dbError(found.error);
    if (!found.data) throw new ApiError(404, "没有找到该卡密");
    if (found.data.status !== "unused") throw new ApiError(409, "该卡密已兑换或已停用");
    const result = await db.rpc("admin_disable_membership_code", { p_code_id: found.data.id }); dbError(result.error);
    await recordModerationAudit(db, { actorId: user.id, action: "membership_code_disabled", targetType: "membership_code", targetId: found.data.id, reason: "管理员停用卡密" });
    return { disabled: Boolean(result.data) };
  });
}
