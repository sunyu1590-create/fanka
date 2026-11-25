import type { NextRequest } from "next/server";
import { clientIp } from "./client-ip";

/**
 * 应用层访问控制。
 *
 * - 规则来自 access_rules 表（管理后台写入），10 秒缓存，避免每个请求都查库。
 * - 生效范围：网站 / API / 上传 / 下载 / 登录。管理后台自身不受 IP 封禁影响，
 *   防止管理员把自己锁在门外（这是硬性要求）。
 * - 频率限制是单实例内存窗口；当前部署为单 app 容器，多副本时需换成共享存储。
 * - 下载限速需要 Caddy 直出层支持，应用层不伪造该能力。
 */

type Rule = {
  id: string;
  scope: string;
  target: string;
  action: "allow" | "block" | "limit";
  max_concurrent: number | null;
  rate_per_minute: number | null;
  bandwidth_kbps: number | null;
  expires_at: string | null;
};

type Cache = { at: number; rules: Rule[]; inflight: Promise<Rule[]> | null };
const holder = globalThis as unknown as { __heikaAccessRules?: Cache };
if (!holder.__heikaAccessRules) holder.__heikaAccessRules = { at: 0, rules: [], inflight: null };

const hits = new Map<string, number[]>();

function restConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

async function loadRules(): Promise<Rule[]> {
  const cache = holder.__heikaAccessRules!;
  if (Date.now() - cache.at < 10_000) return cache.rules;
  if (cache.inflight) return cache.inflight;
  const config = restConfig();
  if (!config) return [];
  cache.inflight = (async () => {
    try {
      const response = await fetch(
        `${config.url}/rest/v1/access_rules?select=id,scope,target,action,max_concurrent,rate_per_minute,bandwidth_kbps,expires_at&active=eq.true&limit=500`,
        { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" },
      );
      if (!response.ok) return cache.rules;
      const rows = (await response.json()) as Rule[];
      cache.rules = Array.isArray(rows) ? rows : [];
      cache.at = Date.now();
      return cache.rules;
    } catch {
      return cache.rules;
    } finally {
      cache.inflight = null;
    }
  })();
  return cache.inflight;
}

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** 支持精确 IPv4 / IPv4 CIDR / IPv6 精确匹配 / 通配 "*"。 */
export function ipMatches(ip: string, target: string) {
  if (!ip || !target) return false;
  if (target === "*") return true;
  const trimmed = target.trim();
  if (!trimmed.includes("/")) return ip === trimmed;
  const [network, bitsRaw] = trimmed.split("/");
  const bits = Number(bitsRaw);
  const base = ipv4ToInt(network);
  const value = ipv4ToInt(ip);
  if (base === null || value === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : ~((1 << (32 - bits)) - 1) >>> 0;
  return (value & mask) === (base & mask);
}

function scopeOf(pathname: string): "web" | "api" | "upload" | "download" | "auth" {
  if (pathname.startsWith("/api/v1/auth") || pathname.includes("/login")) return "auth";
  if (pathname.includes("/upload") || pathname.startsWith("/api/v1/media")) return "upload";
  if (pathname.startsWith("/dl/") || pathname.includes("/download")) return "download";
  if (pathname.startsWith("/api/")) return "api";
  return "web";
}

export class AccessBlocked extends Error {
  readonly name = "AccessBlocked";
  constructor(message: string) { super(message); }
}

/**
 * 在请求入口执行；命中封禁或频率上限时抛出 AccessBlocked。
 * @param scopeOverride 部分路由需要更精确的范围（例如媒体下载）
 */
export async function enforceAccess(req: NextRequest, scopeOverride?: string) {
  const pathname = req.nextUrl.pathname;
  // 管理通道保留安全入口，避免管理员被自己的 IP 规则锁死。
  if (pathname.startsWith("/api/v1/admin")) return;
  const ip = clientIp(req);
  if (!ip) return;

  const rules = await loadRules();
  if (!rules.length) return;
  const now = Date.now();
  const scope = scopeOverride || scopeOf(pathname);
  const applicable = rules.filter((rule) =>
    (rule.scope === "all" || rule.scope === scope)
    && (!rule.expires_at || new Date(rule.expires_at).getTime() > now)
    && ipMatches(ip, rule.target));

  if (applicable.some((rule) => rule.action === "block")) {
    throw new AccessBlocked("当前网络已被限制访问，如有疑问请联系管理员");
  }

  const limit = applicable.find((rule) => rule.action === "limit" && rule.rate_per_minute);
  if (limit?.rate_per_minute) {
    const windowStart = now - 60_000;
    const bucket = (hits.get(ip) || []).filter((at) => at > windowStart);
    if (bucket.length >= limit.rate_per_minute) {
      hits.set(ip, bucket);
      throw new AccessBlocked("请求过于频繁，请稍后再试");
    }
    bucket.push(now);
    hits.set(ip, bucket);
    // 控制内存：超过 5000 个 IP 时清理最旧的一半。
    if (hits.size > 5000) {
      const keys = [...hits.keys()].slice(0, 2500);
      for (const key of keys) hits.delete(key);
    }
  }
}
