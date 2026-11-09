import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
import { requireAdmin } from "@/lib/server/require-admin";

const allowedScopes = new Set(["post", "comment", "message", "profile"]);
function parseScopes(value: unknown) {
  if (!Array.isArray(value)) throw new ApiError(400, "请选择至少一个拦截范围");
  const scopes = [...new Set(value.filter((item): item is string => typeof item === "string"))];
  if (!scopes.length || scopes.some((scope) => !allowedScopes.has(scope))) throw new ApiError(400, "关键词拦截范围无效");
  return scopes;
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const { data, error } = await db.from("moderation_keyword_rules").select("id,keyword,scopes,enabled,created_at,updated_at").order("updated_at", { ascending: false }).limit(200);
    dbError(error);
    return { items: data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const keyword = textField(body.keyword, "关键词", 1, 80);
    const scopes = parseScopes(body.scopes);
    const { data, error } = await db.from("moderation_keyword_rules").insert({
      keyword, scopes, enabled: body.enabled !== false, created_by: user.id, updated_by: user.id,
    }).select("id,keyword,scopes,enabled,created_at,updated_at").single();
    dbError(error);
    if (!data) throw new ApiError(500, "关键词规则保存失败");
    await recordModerationAudit(db, { actorId: user.id, action: "keyword_rule_created", targetType: "keyword_rule", targetId: data.id, reason: keyword, details: { scopes } });
    return data;
  });
}
