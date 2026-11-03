import { NextRequest } from "next/server";
import { ApiError, context, jsonBody, respond } from "@/lib/server/api";
import { deleteAiKey, readAiKey, saveAiKey } from "@/lib/server/ai-secret";

export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const { db, user } = await context(req);
  const { data, error } = await db.from("profiles").select("role").eq("id", user!.id).single();
  if (error) throw new ApiError(error.code === "PGRST116" ? 403 : 400, error.code === "PGRST116" ? "需要管理员权限" : "管理员身份验证失败");
  if (data?.role !== "admin") throw new ApiError(403, "需要管理员权限");
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const key = await readAiKey();
    return { configured: Boolean(key), masked: key ? `••••••••${key.slice(-4)}` : "" };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const body = await jsonBody(req);
    if (body.action === "delete") {
      await deleteAiKey();
      return { configured: false };
    }
    if (typeof body.key !== "string" || body.key.trim().length < 16 || body.key.trim().length > 500) throw new ApiError(400, "请输入有效的 DeepSeek API 密钥");
    await saveAiKey(body.key.trim());
    return { configured: true };
  });
}
