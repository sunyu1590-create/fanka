import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const creator = req.nextUrl.searchParams.get("creator");
    let query = db.from("post_series").select("id,creator_id,title,description,created_at,profiles!post_series_creator_id_fkey(nickname),posts(client_id,status)").order("created_at", { ascending: false }).limit(50);
    if (creator) query = query.eq("creator_id", uuid(creator, "创作者"));
    else if (user) query = query.eq("creator_id", user.id);
    else return { items: [] };
    const { data, error } = await query;
    dbError(error);
    return { items: (data || []).map((row) => ({ ...row, posts: undefined, postCount: (row.posts || []).filter((post) => post.status === "published").length })) };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const title = textField(body.title, "系列名称", 2, 48);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 240) : "";
    if (body.id) {
      const id = uuid(body.id, "系列");
      const { data, error } = await db.from("post_series").update({ title, description }).eq("id", id).eq("creator_id", user!.id).select("id,title,description,created_at").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "系列不存在或无权修改");
      return data;
    }
    const { data, error } = await db.from("post_series").insert({ creator_id: user!.id, title, description }).select("id,title,description,created_at").single();
    dbError(error);
    return data;
  });
}
