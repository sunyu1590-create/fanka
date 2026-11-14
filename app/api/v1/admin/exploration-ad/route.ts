import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function adminContext(req: NextRequest) {
  const { db, user } = await context(req);
  const role = await db.from("profiles").select("role").eq("id", user!.id).single();
  dbError(role.error);
  if (role.data?.role !== "admin") throw new ApiError(403, "需要管理员权限");
  return { db, user: user! };
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await adminContext(req);
    const { data, error } = await db.from("exploration_ad_settings").select("id,enabled,kind,title,body,image_url,post_id,updated_at").eq("id", 1).single();
    dbError(error);
    if (!data) throw new ApiError(404, "广告位配置不存在");
    const post = data.post_id
      ? await db.from("posts").select("client_id,status").eq("id", data.post_id).maybeSingle()
      : { data: null, error: null };
    dbError(post.error);
    return { ...data, post_client_id: post.data?.client_id ?? null, post_status: post.data?.status ?? null };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await adminContext(req);
    const body = await jsonBody(req);
    if (typeof body.enabled !== "boolean") throw new ApiError(400, "广告位状态无效");
    const kind = body.kind;
    if (kind !== "text" && kind !== "image") throw new ApiError(400, "广告类型无效");
    const enabled = body.enabled;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const detail = typeof body.body === "string" ? body.body.trim() : "";
    if (title.length > 80 || (enabled && title.length < 1)) throw new ApiError(400, "标题长度须为 1-80 字");
    if (detail.length > 300) throw new ApiError(400, "说明不能超过 300 字");
    const imageUrl = typeof body.image_url === "string" ? body.image_url.trim() : "";
    if (enabled && kind === "image") {
      let parsed: URL;
      try { parsed = new URL(imageUrl); } catch { throw new ApiError(400, "图片地址无效"); }
      if (parsed.protocol !== "https:" || imageUrl.length > 2048) throw new ApiError(400, "图片须使用 HTTPS 地址");
    }
    const postRef = typeof body.post_ref === "string" ? body.post_ref.trim() : "";
    let target: { id: string; client_id: number; status: string } | null = null;
    if (postRef) {
      let postQuery = db.from("posts").select("id,client_id,status");
      if (isUuid(postRef)) postQuery = postQuery.eq("id", uuid(postRef, "目标作品编号"));
      else {
        if (!/^[1-9]\d{0,14}$/.test(postRef) || !Number.isSafeInteger(Number(postRef))) throw new ApiError(400, "目标作品编号须为 client_id 或 UUID");
        postQuery = postQuery.eq("client_id", Number(postRef));
      }
      const result = enabled ? await postQuery.eq("status", "published").maybeSingle() : await postQuery.maybeSingle();
      dbError(result.error);
      target = result.data;
      if (!target) throw new ApiError(404, enabled ? "找不到已发布的目标作品" : "找不到目标作品");
    } else if (enabled) {
      throw new ApiError(400, "请填写目标作品编号");
    } else {
      const current = await db.from("exploration_ad_settings").select("post_id").eq("id", 1).single();
      dbError(current.error);
      if (current.data?.post_id) {
        const existing = await db.from("posts").select("id,client_id,status").eq("id", current.data.post_id).maybeSingle();
        dbError(existing.error);
        target = existing.data;
      }
    }

    const { data, error } = await db.from("exploration_ad_settings").update({
      enabled,
      kind,
      title,
      body: detail,
      image_url: kind === "image" && imageUrl ? imageUrl : null,
      post_id: target?.id ?? null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }).eq("id", 1).select("id,enabled,kind,title,body,image_url,post_id,updated_at").single();
    dbError(error);
    return { ...data, post_client_id: target?.client_id ?? null, post_status: target?.status ?? null };
  });
}
