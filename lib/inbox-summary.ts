import type { SupabaseClient } from "@supabase/supabase-js";

export type InboxSummaryRow = {
  conversation_id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  latest_message_id: string | null;
  latest_sender_id: string | null;
  latest_body: string | null;
  latest_created_at: string | null;
  latest_media_path: string | null;
  unread: number | string;
};

const TTL = 2500;
const cache = new Map<string, { rows: InboxSummaryRow[]; at: number }>();
const requests = new Map<string, Promise<InboxSummaryRow[]>>();

export async function readInboxSummary(db: SupabaseClient, userId: string, force = false) {
  const current = cache.get(userId);
  if (!force && current && Date.now() - current.at < TTL) return current.rows;
  const pending = requests.get(userId);
  if (pending) return pending;

  const request = Promise.resolve(db.rpc("dm_inbox_summary")).then(({ data, error }) => {
    if (error) throw error;
    const rows = (data || []) as InboxSummaryRow[];
    cache.delete(userId);
    cache.set(userId, { rows, at: Date.now() });
    while (cache.size > 4) cache.delete(cache.keys().next().value as string);
    return rows;
  }).finally(() => requests.delete(userId));
  requests.set(userId, request);
  return request;
}

export function clearInboxSummary(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
