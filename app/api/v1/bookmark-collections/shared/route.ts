import { NextRequest } from "next/server";
import { ApiError, context, dbError, respond, textField } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req, false);
    const code = textField(req.nextUrl.searchParams.get("code"), "分享码", 6, 32);
    const admin = adminClient();
    const { data: collection, error } = await admin.from("bookmark_collections").select("id,name,user_id,is_public,allow_collaboration").eq("share_code", code).maybeSingle();
    dbError(error);
    if (!collection) throw new ApiError(404, "收藏夹不存在或分享链接已失效");
    let member = Boolean(user && user.id === collection.user_id);
    if (user && !member) {
      const membership = await admin.from("bookmark_collection_collaborators").select("collection_id").eq("collection_id", collection.id).eq("user_id", user.id).maybeSingle();
      dbError(membership.error); member = Boolean(membership.data);
    }
    if (!collection.is_public && !member) throw new ApiError(403, "这个收藏夹仅对协作者开放");
    const { data: rows, error: itemsError } = await admin.from("bookmarks").select(`post_id,posts(${libraryFields})`).eq("collection_id", collection.id).order("created_at", { ascending: false }).limit(100);
    dbError(itemsError);
    return { collection: { id: collection.id, name: collection.name, canJoin: Boolean(collection.allow_collaboration && user && !member), member }, items: (rows || []).flatMap((row) => row.posts ? [present(row.posts as unknown as LibraryRow)] : []) };
  });
}
