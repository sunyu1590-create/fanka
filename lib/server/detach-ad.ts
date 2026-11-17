import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/server/admin-client";

/**
 * 探索页广告位对作品是 `on delete set null`，但同一张表上还有一条
 * `post_id is not null` 的检查约束。两者冲突：删除"正被广告位引用"的作品时，
 * 外键先把 post_id 置空 → 立刻违反约束 → 整条删除回滚，用户只看到"操作失败"。
 *
 * 不改表结构的前提下，删除前先把广告位关掉并改挂到另一篇已发布内容上；
 * 站内只剩这一篇内容时，直接移除广告位配置。
 */
export async function detachExplorationAd(_db: SupabaseClient, postId: string) {
  // 广告位表只对管理员可读，用户会话的客户端会被 RLS 过滤成 0 行，
  // 必须用 service role 才能看到并解除引用。
  const db = adminClient();
  const { data, error } = await db
    .from("exploration_ad_settings")
    .select("id,enabled,post_id")
    .eq("post_id", postId);
  if (error) return { detached: 0 };
  const rows = data ?? [];
  if (!rows.length) return { detached: 0 };

  // 换一个仍然存在的作品，避免外键置空撞上检查约束。
  const { data: fallback } = await db
    .from("posts")
    .select("id")
    .eq("status", "published")
    .neq("id", postId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  for (const row of rows) {
    if (fallback?.id) {
      const { error: moved } = await db
        .from("exploration_ad_settings")
        .update({ enabled: false, post_id: fallback.id })
        .eq("id", row.id);
      if (moved) return { detached: 0 };
    } else {
      const { error: removed } = await db.from("exploration_ad_settings").delete().eq("id", row.id);
      if (removed) return { detached: 0 };
    }
  }
  return { detached: rows.length };
}
