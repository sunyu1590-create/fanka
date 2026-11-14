import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";

async function adminContext(req: NextRequest) {
  const { db, user } = await context(req);
  const { data, error } = await db.from("profiles").select("role").eq("id", user!.id).single();
  if (error) throw new ApiError(error.code === "PGRST116" ? 403 : 400, error.code === "PGRST116" ? "需要管理员权限" : "管理员身份验证失败");
  if (data?.role !== "admin") throw new ApiError(403, "需要管理员权限");
  return { db, user: user! };
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await adminContext(req);
    const { data, error } = await db.from("app_download_settings")
      .select("id,enabled,download_url,updated_at")
      .eq("id", 1)
      .single();
    dbError(error);
    return data;
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await adminContext(req);
    const body = await jsonBody(req);
    if (typeof body.enabled !== "boolean") throw new ApiError(400, "下载入口状态无效");
    const downloadUrl = typeof body.download_url === "string" ? body.download_url.trim() : "";
    if (body.enabled) {
      let parsed: URL;
      try { parsed = new URL(downloadUrl); } catch { throw new ApiError(400, "请输入有效的下载链接"); }
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || downloadUrl.length > 2048) {
        throw new ApiError(400, "下载链接必须是有效的 HTTPS 地址");
      }
    } else if (downloadUrl && downloadUrl.length > 2048) {
      throw new ApiError(400, "下载链接不能超过 2048 个字符");
    }
    const { data, error } = await db.from("app_download_settings").update({
      enabled: body.enabled,
      download_url: downloadUrl || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }).eq("id", 1).select("id,enabled,download_url,updated_at").single();
    dbError(error);
    return data;
  });
}
