import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "category.manage");
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, "分类无效");
    const body = await jsonBody(req);
    const { data: current, error: currentError } = await db.from("interest_tags").select("id,name,channel,kind").eq("id", id).single();
    dbError(currentError);
    if (!current) throw new ApiError(404, "分类不存在");
    if (body.action === "merge") {
      const targetId = Number(body.target_id);
      if (!Number.isSafeInteger(targetId) || targetId < 1 || targetId === id) throw new ApiError(400, "合并目标无效");
      const { data, error } = await db.rpc("merge_interest_tag", { p_source_id: id, p_target_id: targetId });
      dbError(error);
      await recordModerationAudit(db, { actorId: user.id, action: "category_merged", targetType: "category", targetId: String(id), reason: `「${current.name}」合并至 ${targetId}` });
      return data;
    }
    const values: Record<string, unknown> = {};
    if (body.name !== undefined) values.name = textField(body.name, "分类名称", 2, 32).replace(/\s+/g, " ");
    if (body.description !== undefined) values.description = typeof body.description === "string" ? body.description.trim().slice(0, 240) : "";
    if (body.active !== undefined) values.active = Boolean(body.active);
    if (body.is_featured !== undefined) values.is_featured = Boolean(body.is_featured);
    if (body.moderation_status !== undefined) {
      if (!current.name || !["pending", "approved", "rejected"].includes(String(body.moderation_status))) throw new ApiError(400, "标签审核状态无效");
      values.moderation_status = String(body.moderation_status);
      if (body.moderation_status === "rejected") values.active = false;
    }
    if (body.sort_order !== undefined) {
      if (!Number.isInteger(body.sort_order) || Number(body.sort_order) < 0 || Number(body.sort_order) > 10000) throw new ApiError(400, "排序值无效");
      values.sort_order = Number(body.sort_order);
    }
    if (body.parent_id !== undefined) {
      const parentId = body.parent_id == null || body.parent_id === "" ? null : Number(body.parent_id);
      if (parentId === id || (parentId !== null && (!Number.isSafeInteger(parentId) || parentId < 1))) throw new ApiError(400, "上级分类无效");
      if (parentId !== null) {
        const parent = await db.from("interest_tags").select("id,channel,kind,parent_id").eq("id", parentId).eq("active", true).maybeSingle();
        dbError(parent.error);
        if (!parent.data || parent.data.channel !== current.channel || parent.data.kind !== "category" || parent.data.parent_id) throw new ApiError(400, "仅支持两级分类结构");
      }
      values.parent_id = parentId;
    }
    if (body.aliases !== undefined) {
      if (!Array.isArray(body.aliases) || body.aliases.length > 20 || body.aliases.some((item) => typeof item !== "string" || item.length > 40)) throw new ApiError(400, "别名列表无效");
      values.aliases = body.aliases.map((item: string) => item.trim()).filter(Boolean);
    }
    if (!Object.keys(values).length) throw new ApiError(400, "没有可更新的分类设置");
    const { data, error } = await db.from("interest_tags").update(values).eq("id", id).select("id,name,channel,parent_id,kind,sort_order,description,is_featured,active,aliases").single();
    dbError(error);
    await recordModerationAudit(db, { actorId: user.id, action: "category_updated", targetType: "category", targetId: String(id), reason: `更新分类「${current.name}」` });
    return data;
  });
}
