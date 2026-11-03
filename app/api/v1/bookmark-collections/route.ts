import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const [collections, bookmarks] = await Promise.all([
      db.from("bookmark_collections").select("id,name,created_at").eq("user_id", user!.id).order("created_at"),
      db.from("bookmarks").select(`post_id,collection_id,posts(${libraryFields})`).eq("user_id", user!.id),
    ]);
    dbError(collections.error);
    dbError(bookmarks.error);
    return {
      collections: collections.data || [],
      bookmarks: (bookmarks.data || []).map((item) => ({
        postId: item.post_id,
        collectionId: item.collection_id,
        post: item.posts ? present(item.posts as unknown as LibraryRow) : null,
      })),
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const action = body.action;
    if (action === "create") {
      const name = textField(body.name, "收藏夹名称", 1, 24);
      const { data, error } = await db.from("bookmark_collections").insert({ user_id: user!.id, name }).select("id,name,created_at").single();
      dbError(error);
      return data;
    }
    if (action === "rename") {
      const id = uuid(body.id, "收藏夹");
      const name = textField(body.name, "收藏夹名称", 1, 24);
      const { data, error } = await db.from("bookmark_collections").update({ name }).eq("id", id).eq("user_id", user!.id).select("id,name,created_at").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "收藏夹不存在");
      return data;
    }
    if (action === "delete") {
      const id = uuid(body.id, "收藏夹");
      const { data, error } = await db.from("bookmark_collections").delete().eq("id", id).eq("user_id", user!.id).select("id").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "收藏夹不存在");
      return { deleted: true };
    }
    if (action === "assign") {
      const postId = uuid(body.postId, "内容");
      let collectionId: string | null = null;
      if (body.collectionId !== null && body.collectionId !== "") {
        collectionId = uuid(body.collectionId, "收藏夹");
        const owned = await db.from("bookmark_collections").select("id").eq("id", collectionId).eq("user_id", user!.id).maybeSingle();
        dbError(owned.error);
        if (!owned.data) throw new ApiError(403, "不能使用这个收藏夹");
      }
      const { data, error } = await db.from("bookmarks").update({ collection_id: collectionId }).eq("user_id", user!.id).eq("post_id", postId).select("post_id,collection_id").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "收藏记录不存在");
      return data;
    }
    throw new ApiError(400, "收藏夹操作无效");
  });
}
