import { adminClient } from "@/lib/server/admin-client";

/** Queue taxonomy suggestions after saving content. Queue outages must not undo a post. */
export async function enqueuePostClassification(postId: string) {
  try {
    const { error } = await adminClient().rpc("enqueue_ai_classification_for_post", { p_post_id: postId });
    if (error) console.error("AI classification enqueue failed", error.code || "database_error");
  } catch {
    console.error("AI classification enqueue failed", "service_unavailable");
  }
}
