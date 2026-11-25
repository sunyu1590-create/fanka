import { ApiError } from "@/lib/server/api";

/**
 * 账号级能力限制（应用层真实执行）。
 *
 * 共享 IP 上封一个账号不应该牵连整段网段，所以封禁落在账号维度：
 * 限制登录、浏览、发布、评论、私信、上传、下载、AI 八项能力之一，
 * 到期自动失效。读取走 60 秒内存缓存，避免每个请求都打数据库。
 */

export type Ability = "login" | "browse" | "publish" | "comment" | "dm" | "upload" | "download" | "ai";

const LABEL: Record<Ability, string> = {
  login: "登录", browse: "浏览", publish: "发布", comment: "评论",
  dm: "私信", upload: "上传", download: "下载", ai: "AI 功能",
};

type Restriction = { until: string | null; reason: string };
type Entry = { at: number; rows: Map<Ability, Restriction> };
const holder = globalThis as unknown as { __heikaAbilities?: Map<string, Entry> };
if (!holder.__heikaAbilities) holder.__heikaAbilities = new Map();

const TTL = 60_000;

async function load(userId: string): Promise<Map<Ability, Restriction>> {
  const cache = holder.__heikaAbilities!;
  const hit = cache.get(userId);
  const now = Date.now();
  if (hit && now - hit.at < TTL) return hit.rows;

  const rows = new Map<Ability, Restriction>();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (url && key) {
    try {
      const response = await fetch(
        `${url}/rest/v1/account_ability_restrictions?user_id=eq.${userId}&active=eq.true&select=ability,expires_at,reason`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
      );
      if (response.ok) {
        for (const row of (await response.json()) as Array<{ ability: Ability; expires_at: string | null; reason: string }>) {
          if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
          rows.set(row.ability, { until: row.expires_at, reason: row.reason || "" });
        }
      }
    } catch {
      // 读取失败按「未限制」处理：宁可漏挡一次，也不因为监控表不可用而锁死用户。
    }
  }
  cache.set(userId, { at: now, rows });
  if (cache.size > 5000) cache.clear();
  return rows;
}

export async function abilityBlocked(userId: string, ability: Ability): Promise<Restriction | null> {
  const rows = await load(userId);
  return rows.get(ability) || null;
}

/** 被限制时抛出 403，并说明原因与到期时间。 */
export async function requireAbility(userId: string, ability: Ability) {
  const restriction = await abilityBlocked(userId, ability);
  if (!restriction) return;
  const until = restriction.until ? new Date(restriction.until) : null;
  const when = until ? `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")} ${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}` : "管理员解除后";
  throw new ApiError(403, `该账号的${LABEL[ability]}能力已被限制，${until ? `${when} 自动解除` : when}${restriction.reason ? `（原因：${restriction.reason}）` : ""}`);
}
