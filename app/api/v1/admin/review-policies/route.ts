import { NextRequest } from "next/server";
import { respond, ApiError, jsonBody, dbError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 审核策略版本：查看、创建、激活（回滚即激活历史版本）。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "ai.read");
    const { data, error } = await db.from("ai_review_policies")
      .select("id,version,name,thresholds,active,created_at,activated_at,system_prompt")
      .order("created_at", { ascending: false })
      .limit(50);
    dbError(error);
    return { policies: data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "policy.manage");
    const body = await jsonBody(req);
    const action = String(body.action || "");

    if (action === "create") {
      const version = String(body.version || "").trim().slice(0, 20);
      const name = String(body.name || "").trim().slice(0, 60);
      const prompt = String(body.systemPrompt || "").trim();
      if (!/^\d+\.\d+(\.\d+)?$/.test(version)) throw new ApiError(400, "版本号格式应如 3.1");
      if (name.length < 2) throw new ApiError(400, "请填写策略名称");
      if (prompt.length < 80) throw new ApiError(400, "提示词过短，至少 80 字");
      const { data, error } = await db.from("ai_review_policies").insert({
        version, name, system_prompt: prompt, thresholds: body.thresholds || {}, active: false, created_by: user.id,
      }).select("*").single();
      dbError(error);
      await db.from("admin_action_logs").insert({ actor_id: user.id, action: "review_policy_create", target: version, detail: { name } });
      return { policy: data };
    }

    if (action === "activate") {
      const version = String(body.version || "").trim();
      if (!version) throw new ApiError(400, "请选择要启用的版本");
      const { data: target, error: targetError } = await db.from("ai_review_policies").select("id,version").eq("version", version).maybeSingle();
      dbError(targetError);
      if (!target) throw new ApiError(404, "策略版本不存在");
      // 先全部停用，再启用目标版本；唯一索引保证不会同时出现两个 active。
      const { error: disableError } = await db.from("ai_review_policies").update({ active: false }).eq("active", true);
      dbError(disableError);
      const { error: enableError } = await db.from("ai_review_policies").update({ active: true, activated_at: new Date().toISOString() }).eq("id", target.id);
      dbError(enableError);
      await db.from("admin_action_logs").insert({ actor_id: user.id, action: "review_policy_activate", target: version, detail: { reason: String(body.reason || "").slice(0, 300) } });
      return { active: version };
    }

    throw new ApiError(400, "未知操作");
  });
}
