/**
 * 账号在线状态：鉴权成功即记一次「最近活跃」，同一账号 60 秒内只写一次库。
 *
 * - 只写 user_id + 时间，不记录 IP、路径与设备，降低隐私面；
 * - 异步执行且吞掉异常，任何写入失败都不能影响业务请求；
 * - 内存节流仅用于减少写库次数，进程重启后最多补写一次，不影响正确性。
 */

const seen = new Map<string, number>();
const THROTTLE_MS = 60_000;

export function touchPresence(userId: string) {
  const now = Date.now();
  if (now - (seen.get(userId) || 0) < THROTTLE_MS) return;
  seen.set(userId, now);

  void (async () => {
    try {
      const { adminClient } = await import("./admin-client");
      await adminClient().from("user_presence").upsert(
        { user_id: userId, last_seen: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    } catch {
      // 在线状态属于观测数据，失败不影响鉴权与业务响应。
    }
  })();
}
