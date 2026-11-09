import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond, textField } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { recordModerationAudit } from "@/lib/server/moderation-audit";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "category.manage");
    const { data, error, count } = await db.from("interest_tags")
      .select("id,name,channel,parent_id,kind,sort_order,description,is_featured,active,aliases,moderation_status,created_by", { count: "exact" })
      .order("channel").order("sort_order").order("id").limit(1000);
    dbError(error);
    const counts = await db.rpc("get_staff_category_counts");
    dbError(counts.error);
    const postCounts = new Map<number, number>((counts.data || []).map((row: { category_id: number; content_count: number }) => [Number(row.category_id), Number(row.content_count)]));
    return { items: (data || []).map((item) => ({ ...item, contentCount: postCounts.get(item.id) || 0 })), total: count || 0 };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "category.manage");
    const body = await jsonBody(req);
    const name = textField(body.name, "分类名称", 2, 32).replace(/\s+/g, " ");
    const channel = body.channel === "ai" ? "ai" : body.channel === "community" ? "community" : null;
    if (!channel) throw new ApiError(400, "请选择所属频道");
    const kind = body.kind === "tag" ? "tag" : body.kind === "category" ? "category" : null;
    if (!kind) throw new ApiError(400, "分类类型无效");
    const parentId = body.parent_id == null || body.parent_id === "" ? null : Number(body.parent_id);
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId < 1)) throw new ApiError(400, "上级分类无效");
    if (parentId !== null) {
      const parent = await db.from("interest_tags").select("id,channel,kind").eq("id", parentId).eq("active", true).maybeSingle();
      dbError(parent.error);
      if (!parent.data || parent.data.channel !== channel || parent.data.kind !== "category") throw new ApiError(400, "上级分类必须属于同一频道");
    }
    const aliases = Array.isArray(body.aliases) ? body.aliases.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20) : [];
    const { data, error } = await db.from("interest_tags").insert({
      name, channel, kind, parent_id: parentId, description: typeof body.description === "string" ? body.description.trim().slice(0, 240) : "",
      sort_order: Number.isInteger(body.sort_order) ? Number(body.sort_order) : 100,
      is_featured: Boolean(body.is_featured), aliases, active: body.active !== false, is_custom: false,
      moderation_status: "approved", created_by: user.id,
    }).select("id,name,channel,parent_id,kind,sort_order,description,is_featured,active,aliases,moderation_status").single();
    dbError(error);
    if (!data) throw new ApiError(500, "分类创建后未能读取，请刷新后检查");
    await recordModerationAudit(db, { actorId: user.id, action: "category_created", targetType: "category", targetId: String(data.id), reason: `创建${channel === "ai" ? "AI" : "社区"}分类「${name}」` });
    return data;
  });
}
