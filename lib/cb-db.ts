import { PostgrestClient } from "@supabase/postgrest-js";
import { StorageClient } from "@supabase/storage-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudBaseAuth } from "@/lib/cb-auth";

export type DbClient = SupabaseClient;

const noopChannel = {
  on() {
    return noopChannel;
  },
  subscribe() {
    return { unsubscribe() {} };
  },
  unsubscribe() {},
};

/**
 * 按 Supabase 的调用形状组装云开发客户端：
 *   数据 → {gateway}/v1/rdb/rest（PostgREST 兼容）
 *   存储 → {gateway}/v1/storages（Supabase Storage 协议兼容）
 *   认证 → CloudBaseAuth 适配
 * 未登录时不携带 Authorization，网关会拒绝，故上层需保证登录态。
 */
export function createDbClient(gateway: string, auth: CloudBaseAuth): SupabaseClient {
  const base = gateway.replace(/\/$/, "");

  const headers = (): Record<string, string> => {
    const session = (auth as unknown as { session: { access_token?: string } | null }).session;
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const rest = () => new PostgrestClient(`${base}/v1/rdb/rest`, { headers: headers() });
  const storage = () => new StorageClient(`${base}/v1/storages`, headers());

  const client = {
    from: (relation: string) => rest().from(relation),
    rpc: (fn: string, args?: Record<string, unknown>) => rest().rpc(fn, args as never),
    schema: (name: string) => rest().schema(name),
    storage: { from: (bucket: string) => storage().from(bucket) },
    auth: auth,
    channel: () => noopChannel,
    removeChannel: () => Promise.resolve("ok"),
    removeAllChannels: () => Promise.resolve([]),
    getChannels: () => [],
  };

  return client as unknown as SupabaseClient;
}
