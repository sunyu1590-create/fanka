import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const PLATFORMS = new Set([
  "system", "copy", "wechat", "moments", "x", "telegram", "facebook", "qq", "instagram", "other",
]);
const SURFACES = new Set(["web", "android", "ios"]);

/**
 * 记录一次分享。分享本身不依赖登录，匿名也能统计；
 * 但写入只走服务端，客户端无法伪造 user_id 或直接写表。
 */
export async function POST(req: NextRequest, { params }: Params) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const rawId = (await params).id;
    const clientId = Number(rawId);
    if (!Number.isSafeInteger(clientId) || clientId < 1) throw new ApiError(400, "内容编号无效");

    const body = await jsonBody(req);
    const platform = typeof body.platform === "string" ? body.platform : "";
    const surface = typeof body.surface === "string" ? body.surface : "web";
    if (!PLATFORMS.has(platform)) throw new ApiError(400, "分享平台无效");
    if (!SURFACES.has(surface)) throw new ApiError(400, "分享来源无效");

    const { data: post, error } = await db
      .from("posts")
      .select("id,status")
      .eq("client_id", clientId)
      .eq("status", "published")
      .maybeSingle();
    dbError(error);
    if (!post) throw new ApiError(404, "这篇内容暂不可分享");

    const admin = adminClient();
    // 连续点击 / 系统分享回调重复触发时只记一次，避免把分享量刷高。
    const since = new Date(Date.now() - 3000).toISOString();
    const duplicate = await admin
      .from("post_share_events")
      .select("id")
      .eq("post_id", post.id)
      .eq("platform", platform)
      .gte("created_at", since)
      .limit(1);
    dbError(duplicate.error);
    if (duplicate.data?.length) return { recorded: false, duplicate: true };

    const inserted = await admin
      .from("post_share_events")
      .insert({ post_id: post.id, user_id: user?.id ?? null, platform, surface })
      .select("id,created_at")
      .single();
    dbError(inserted.error);
    return { recorded: true, id: inserted.data?.id ?? null };
  });
}
