import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/server/admin-client";
import { ATTACHMENT_BUCKET, readAttachments } from "@/lib/attachments";

/** 作品被删除时一并清掉它的附件对象，避免私有桶里堆积孤儿文件。 */
export async function removePostAttachments(_db: SupabaseClient, postId: string) {
  const db = adminClient();
  const { data } = await db.from("posts").select("resource_data").eq("id", postId).maybeSingle();
  const items = readAttachments(data?.resource_data);
  if (!items.length) return 0;
  const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove(items.map((item) => item.path));
  return error ? 0 : items.length;
}
