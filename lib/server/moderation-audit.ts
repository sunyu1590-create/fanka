import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordModerationAudit(
  db: SupabaseClient,
  entry: {
    actorId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    reason?: string | null;
    details?: Record<string, unknown>;
  },
) {
  const { error } = await db.from("moderation_audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId || null,
    reason: entry.reason || null,
    details: entry.details || {},
  });
  // The user facing action has already succeeded. Keep that result truthful if
  // an audit insert is temporarily unavailable, while retaining server evidence.
  if (error) console.error("[moderation-audit] Failed to record action", error.code);
}
