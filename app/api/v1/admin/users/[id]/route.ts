import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: actor, error: actorError } = await db.from("profiles").select("role").eq("id", user!.id).single();
    dbError(actorError);
    if (actor?.role !== "admin") throw new ApiError(403, "需要管理员权限");
    const body = await jsonBody(req);
    if (body.role !== "member" && body.role !== "admin") throw new ApiError(400, "账号角色无效");
    const id = uuid((await params).id);
    if (id === user!.id && body.role !== "admin") throw new ApiError(400, "不能移除自己的管理员权限");
    const { data, error } = await db.from("profiles").update({ role: body.role }).eq("id", id).select("id,nickname,role,role_updated_at").single();
    if (error?.message.includes("last administrator")) throw new ApiError(409, "系统至少需要保留一位管理员");
    dbError(error);
    return data;
  });
}
