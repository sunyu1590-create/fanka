import { NextRequest } from "next/server";
import { ApiError, dbError, jsonBody, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export const dynamic = "force-dynamic";

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new ApiError(403, "没有发布公告的权限");
  if (error.code === "22023" && error.message) throw new ApiError(400, error.message);
  dbError(error as { message: string; code?: string });
}

/** 管理员读取公告配置（含未启用状态）。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.manage");
    const { data, error } = await db.rpc("announcement_admin_get");
    mapError(error);
    return data ?? null;
  });
}

/** 保存公告；版本号自增，客户端据此判断是否需要重新弹出。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.manage");
    const body = await jsonBody(req);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!title || title.length > 40) throw new ApiError(400, "标题长度须为 1-40");
    if (!text || text.length > 600) throw new ApiError(400, "内容长度须为 1-600");
    const { data, error } = await db.rpc("announcement_save", {
      p_title: title,
      p_body: text,
      p_active: body.active === true,
    });
    mapError(error);
    return data;
  });
}
