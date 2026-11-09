import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";
import { adminClient } from "@/lib/server/admin-client";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const admin = adminClient();
    const memberships = await admin.from("bookmark_collection_collaborators").select("collection_id").eq("user_id", user!.id);
    dbError(memberships.error);
    const ids = (memberships.data || []).map((row) => row.collection_id);
    const [owned, shared, bookmarks] = await Promise.all([
      db.from("bookmark_collections").select("id,name,created_at,is_public,allow_collaboration,share_code,user_id").eq("user_id", user!.id).order("created_at"),
      ids.length ? admin.from("bookmark_collections").select("id,name,created_at,is_public,allow_collaboration,share_code,user_id").in("id", ids).order("created_at") : Promise.resolve({ data: [], error: null }),
      db.from("bookmarks").select(`user_id,post_id,collection_id,posts(${libraryFields})`).eq("user_id", user!.id),
    ]);
    dbError(owned.error); dbError(shared.error);
    dbError(bookmarks.error);
    const collectionIds = [...new Set([...(owned.data || []).map((item) => item.id), ...ids])];
    const sharedBookmarks = collectionIds.length ? await admin.from("bookmarks").select(`user_id,post_id,collection_id,posts(${libraryFields})`).in("collection_id", collectionIds).limit(1000) : { data: [], error: null };
    dbError(sharedBookmarks.error);
    const bookmarkRows = [...(bookmarks.data || []), ...(sharedBookmarks.data || [])];
    const uniqueBookmarks = [...new Map(bookmarkRows.map((item) => [`${item.user_id}:${item.collection_id || "none"}:${item.post_id}`, item])).values()];
    return {
      collections: [...(owned.data || []).map((item) => ({ ...item, role: "owner" })), ...(shared.data || []).map((item) => ({ ...item, role: "collaborator" }))],
      bookmarks: uniqueBookmarks.map((item) => ({
        userId: item.user_id,
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
    if (action === "share") {
      const id = uuid(body.id, "收藏夹");
      const admin = adminClient();
      const current = await admin.from("bookmark_collections").select("share_code").eq("id", id).eq("user_id", user!.id).maybeSingle();
      dbError(current.error);
      if (!current.data) throw new ApiError(404, "收藏夹不存在");
      const code = current.data.share_code || crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      const { data, error } = await admin.from("bookmark_collections").update({ is_public: Boolean(body.isPublic), allow_collaboration: Boolean(body.allowCollaboration), share_code: code }).eq("id", id).eq("user_id", user!.id).select("id,name,is_public,allow_collaboration,share_code").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "收藏夹不存在");
      return data;
    }
    if (action === "join") {
      const code = textField(body.shareCode, "分享码", 6, 32);
      const admin = adminClient();
      const { data: collection, error } = await admin.from("bookmark_collections").select("id,user_id,allow_collaboration").eq("share_code", code).maybeSingle();
      dbError(error);
      if (!collection) throw new ApiError(404, "分享链接已失效");
      if (!collection.allow_collaboration) throw new ApiError(403, "这个收藏夹暂不接受协作成员");
      if (collection.user_id === user!.id) return { joined: true, collectionId: collection.id };
      const { error: joinError } = await admin.from("bookmark_collection_collaborators").upsert({ collection_id: collection.id, user_id: user!.id, added_by: user!.id }, { onConflict: "collection_id,user_id" });
      dbError(joinError);
      return { joined: true, collectionId: collection.id };
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
        const admin = adminClient();
        const [owned, shared] = await Promise.all([
          db.from("bookmark_collections").select("id").eq("id", collectionId).eq("user_id", user!.id).maybeSingle(),
          admin.from("bookmark_collection_collaborators").select("collection_id").eq("collection_id", collectionId).eq("user_id", user!.id).maybeSingle(),
        ]);
        dbError(owned.error); dbError(shared.error);
        if (!owned.data && !shared.data) throw new ApiError(403, "不能使用这个收藏夹");
      }
      const { data, error } = await db.from("bookmarks").update({ collection_id: collectionId }).eq("user_id", user!.id).eq("post_id", postId).select("post_id,collection_id").maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "收藏记录不存在");
      return data;
    }
    throw new ApiError(400, "收藏夹操作无效");
  });
}
