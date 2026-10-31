import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  ApiError,
  uuid,
} from "@/lib/server/api";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const { data: admin, error } = await db.rpc("is_admin");
    dbError(error);
    if (!admin) throw new ApiError(403, "需要管理员权限");
    const { data, error: read } = await db
      .from("dm_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    dbError(read);
    return data;
  });
}
export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const { data: admin, error } = await db.rpc("is_admin");
    dbError(error);
    if (!admin) throw new ApiError(403, "需要管理员权限");
    const b = await jsonBody(req);
    if (!["resolved", "dismissed"].includes(String(b.status)))
      throw new ApiError(400, "处理状态无效");
    const { data, error: write } = await db
      .from("dm_reports")
      .update({ status: b.status })
      .eq("id", uuid(b.id))
      .select()
      .single();
    dbError(write);
    return data;
  });
}
