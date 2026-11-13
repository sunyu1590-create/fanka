import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "ai.review");
    const { data, error } = await db.from("ai_resource_types")
      .select("resource_type,label,description,enabled,sort_order,updated_at")
      .order("sort_order").order("resource_type");
    dbError(error);
    const types = data || [];
    const counts = await Promise.all(types.map(async (item) => {
      const result = await db.from("posts").select("id", { count: "exact", head: true })
        .eq("channel", "ai").eq("content_type", item.resource_type);
      dbError(result.error);
      return [item.resource_type, result.count || 0] as const;
    }));
    const countByType = new Map(counts);
    return { items: types.map((item) => ({ ...item, content_count: countByType.get(item.resource_type) || 0 })) };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "ai.review");
    const body = await jsonBody(req);
    const resourceType = typeof body.resource_type === "string" ? body.resource_type : "";
    if (!["agent", "skill", "prompt", "ai_tool", "knowledge_article", "tutorial"].includes(resourceType)) {
      throw new ApiError(400, "AI 资源类型编号无效；类型编号不可修改");
    }
    const values: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") throw new ApiError(400, "分类启用状态无效");
      values.enabled = body.enabled;
    }
    if (body.label !== undefined) values.label = textField(body.label, "分类名称", 1, 24);
    if (body.description !== undefined) values.description = textField(body.description, "分类说明", 0, 120);
    if (body.sort_order !== undefined) {
      const order = Number(body.sort_order);
      if (!Number.isInteger(order) || order < 0 || order > 100) throw new ApiError(400, "排序值无效");
      values.sort_order = order;
    }
    if (Object.keys(values).length === 2) throw new ApiError(400, "没有可更新的分类设置");
    const { data, error } = await db.from("ai_resource_types").update(values)
      .eq("resource_type", resourceType)
      .select("resource_type,label,description,enabled,sort_order,updated_at")
      .maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "AI 资源类型不存在");
    await recordModerationAudit(db, {
      actorId: user.id,
      action: "ai_resource_type_updated",
      targetType: "ai_resource_type",
      targetId: resourceType,
      reason: `${data.enabled ? "启用" : "停用"}：${data.label}`,
    });
    return data;
  });
}
