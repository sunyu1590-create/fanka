import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const postId = uuid(req.nextUrl.searchParams.get("postId"), "内容");
    const { data, error } = await db.from("post_highlights").select("id,post_id,excerpt,note,created_at").eq("user_id", user!.id).eq("post_id", postId).order("created_at", { ascending: false }).limit(50);
    dbError(error);
    return { items: data || [] };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const postId = uuid(body.postId, "内容");
    const excerpt = textField(body.excerpt, "摘录", 1, 1000);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    const post = await db.from("posts").select("id").eq("id", postId).eq("status", "published").maybeSingle();
    dbError(post.error);
    if (!post.data) throw new ApiError(404, "这篇内容暂时不可保存摘录");
    const { data, error } = await db.from("post_highlights").insert({ user_id: user!.id, post_id: postId, excerpt, note }).select("id,post_id,excerpt,note,created_at").single();
    dbError(error);
    return data;
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const id = uuid(req.nextUrl.searchParams.get("id"), "摘录");
    const { data, error } = await db.from("post_highlights").delete().eq("id", id).eq("user_id", user!.id).select("id").maybeSingle();
    dbError(error);
    return { deleted: Boolean(data) };
  });
}
