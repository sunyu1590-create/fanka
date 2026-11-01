import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: actor, error: actorError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(actorError);
    if (actor?.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const body = await jsonBody(req);
    const values: Record<string, string | null> = {};
    if (body.role !== undefined) {
      if (body.role !== "member" && body.role !== "admin") throw new ApiError(400, "账号角色无效");
      values.role = body.role;
    }
    if (body.membership_tier !== undefined) {
      if (!["free", "plus", "pro"].includes(String(body.membership_tier))) throw new ApiError(400, "会员等级无效");
    }
    if (!Object.keys(values).length && body.membership_tier === undefined) throw new ApiError(400, "没有可更新的账号权限");
    const id = uuid((await params).id);
    if (id === user!.id && body.role === "member") throw new ApiError(400, "不能移除自己的管理员权限");
    let data: Record<string, unknown> | null = null;
    if (Object.keys(values).length) {
      const result = await db.from("profiles").update(values).eq("id", id).select("id,nickname,role,membership_tier,role_updated_at").single();
      if (result.error?.message.includes("last administrator")) throw new ApiError(409, "系统至少需要保留一位管理员");
      dbError(result.error);
      data = result.data;
    }
    if (body.membership_tier !== undefined) {
      const result = await db.rpc("set_membership_tier", {
        p_profile_id: id,
        p_membership_tier: String(body.membership_tier),
      });
      dbError(result.error);
      if (!data) {
        const profile = await db.from("profiles").select("id,nickname,role,membership_tier,role_updated_at").eq("id", id).single();
        dbError(profile.error);
        data = profile.data;
      } else data.membership_tier = result.data;
    }
    return data;
  });
}
