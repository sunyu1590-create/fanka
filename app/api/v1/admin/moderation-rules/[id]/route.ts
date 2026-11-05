import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requireAdmin } from "@/lib/server/require-admin";

const allowedScopes = new Set(["post", "comment", "message", "profile"]);
function parseScopes(value: unknown) {
  if (!Array.isArray(value)) throw new ApiError(400, "请选择至少一个拦截范围");
  const scopes = [...new Set(value.filter((item): item is string => typeof item === "string"))];
  if (!scopes.length || scopes.some((scope) => !allowedScopes.has(scope))) throw new ApiError(400, "关键词拦截范围无效");
  return scopes;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const id = uuid((await params).id);
    const values: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
    if (body.keyword !== undefined) values.keyword = textField(body.keyword, "关键词", 1, 80);
    if (body.scopes !== undefined) values.scopes = parseScopes(body.scopes);
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") throw new ApiError(400, "规则状态无效");
      values.enabled = body.enabled;
    }
    if (Object.keys(values).length === 2) throw new ApiError(400, "没有需要保存的修改");
    const { data, error } = await db.from("moderation_keyword_rules").update(values).eq("id", id).select("id,keyword,scopes,enabled").maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "关键词规则不存在或已被删除");
    await recordModerationAudit(db, { actorId: user.id, action: "keyword_rule_updated", targetType: "keyword_rule", targetId: id, reason: data.keyword, details: { scopes: data.scopes, enabled: data.enabled } });
    return data;
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const id = uuid((await params).id);
    const { data, error } = await db.from("moderation_keyword_rules").delete().eq("id", id).select("id,keyword").maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "关键词规则不存在或已被删除");
    await recordModerationAudit(db, { actorId: user.id, action: "keyword_rule_deleted", targetType: "keyword_rule", targetId: id, reason: data.keyword });
    return { deleted: true };
  });
}
