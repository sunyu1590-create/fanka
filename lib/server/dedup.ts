/**
 * 全站推荐去重：同一会话窗口内已展示过的内容在后续推荐中排除。
 * 采用内存 LRU + TTL 策略，服务重启后清空，对用户体验影响可控。
 */

interface SessionEntry {
  ids: Set<string>;
  ts: number;
}

const sessions = new Map<string, SessionEntry>();

/** 清理过期会话，防止内存泄漏 */
function evictExpired(ttlMs: number) {
  const now = Date.now();
  for (const [key, entry] of sessions) {
    if (now - entry.ts > ttlMs) sessions.delete(key);
  }
}

/** 定时清理，每 5 分钟 */
if (typeof setInterval !== "undefined") {
  setInterval(() => evictExpired(60 * 60_000), 300_000);
}

/**
 * 记录一批已推荐 ID 到指定会话。
 * @param sessionKey - 会话标识（用户 ID + 设备指纹或匿名 session）
 * @param ids - 已展示的 entity ID 列表
 * @param maxSize - 最大保留数量，超出时 FIFO 淘汰
 */
export function recordSeen(sessionKey: string, ids: string[], maxSize = 200) {
  if (!sessionKey || !ids.length) return;
  let entry = sessions.get(sessionKey);
  if (!entry) {
    entry = { ids: new Set(), ts: Date.now() };
    sessions.set(sessionKey, entry);
  }
  for (const id of ids) {
    entry.ids.add(id);
    // FIFO 淘汰最旧的
    if (entry.ids.size > maxSize) {
      const first = entry.ids.values().next().value as string;
      if (first) entry.ids.delete(first);
    }
  }
  entry.ts = Date.now();
}

/**
 * 从候选列表中过滤掉已推荐的内容。
 * @param sessionKey - 会话标识
 * @param candidates - 候选 ID 列表
 * @returns 去重后的 ID 列表
 */
export function filterSeen(sessionKey: string, candidates: string[]): string[] {
  if (!sessionKey) return candidates;
  const entry = sessions.get(sessionKey);
  if (!entry) return candidates;
  return candidates.filter((id) => !entry.ids.has(id));
}

/**
 * 获取会话已推荐数量（用于判断冷启动等）
 */
export function getSeenCount(sessionKey: string): number {
  const entry = sessions.get(sessionKey);
  return entry ? entry.ids.size : 0;
}

/**
 * 清理指定会话
 */
export function clearSession(sessionKey: string) {
  sessions.delete(sessionKey);
}
