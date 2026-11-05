import { NextRequest } from "next/server";
import { ApiError, context, jsonBody, respond, textField } from "@/lib/server/api";

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const body = await jsonBody(req);
    const name = textField(body.name, "标签名称", 2, 24).replace(/^#+/, "").replace(/\s+/g, " ").trim();
    if (!/^[\p{L}\p{N} _-]+$/u.test(name)) throw new ApiError(400, "标签请使用中英文、数字、空格、下划线或短横线");
    const channel = body.channel === "ai" || body.channel === "community" ? body.channel : null;
    if (!channel) throw new ApiError(400, "频道无效");
    const { data, error } = await db.rpc("create_channel_tag", { p_name: name, p_channel: channel });
    if (error) throw new ApiError(error.code === "23505" ? 409 : 400, error.message);
    return data;
  });
}
