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

/** 新发布或重新提交的作品进入 AI 初审队列；队列异常不影响作品落地。 */
export async function enqueuePostReview(postId: string) {
  try {
    const { error } = await adminClient().rpc("enqueue_ai_review_for_post", { p_post_id: postId });
    if (error) console.error("AI review enqueue failed", error.code || "database_error");
  } catch {
    console.error("AI review enqueue failed", "service_unavailable");
  }
}
