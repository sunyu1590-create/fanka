import { NextRequest } from "next/server";
import { respond, ApiError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };

/**
 * IP 访问分析：数据来自 Caddy 真实访问日志的按天聚合，不伪造独立访客。
 * 严格区分「IP / 会话 / 登录账号」：一个 IP 可能对应多个账号，反之亦然。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "network.read");
    const db = adminClient();
    const params = req.nextUrl.searchParams;
    const range = params.get("range") || "1d";
    const days = RANGE_DAYS[range] || 1;
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const query = (params.get("q") || "").trim().toLowerCase().slice(0, 80);
    const sort = params.get("sort") || "requests";

    const { data, error } = await db.from("ip_access_stats")
      .select("day,ip,requests,bytes_in,bytes_out,status_4xx,status_5xx,avg_ms,first_seen,last_seen,client,country,account_id,paths")
      .gte("day", since)
      .order("day", { ascending: false })
      .limit(20_000);
    if (error) throw new ApiError(500, "IP 访问数据读取失败");

    const map = new Map<string, {
      ip: string; requests: number; bytes_in: number; bytes_out: number; errors: number;
      first_seen: string | null; last_seen: string | null; client: string | null; country: string | null;
      accounts: Set<string>; paths: Record<string, number>; weightedMs: number;
    }>();
    for (const row of data || []) {
      const key = String(row.ip || "");
      if (!key) continue;
      const current = map.get(key) || {
        ip: key, requests: 0, bytes_in: 0, bytes_out: 0, errors: 0,
        first_seen: null, last_seen: null, client: null, country: null,
        accounts: new Set<string>(), paths: {}, weightedMs: 0,
      };
      current.requests += Number(row.requests || 0);
      current.bytes_in += Number(row.bytes_in || 0);
      current.bytes_out += Number(row.bytes_out || 0);
      current.errors += Number(row.status_4xx || 0) + Number(row.status_5xx || 0);
      current.weightedMs += Number(row.avg_ms || 0) * Number(row.requests || 0);
      if (!current.first_seen || (row.first_seen && row.first_seen < current.first_seen)) current.first_seen = row.first_seen;
      if (!current.last_seen || (row.last_seen && row.last_seen > current.last_seen)) current.last_seen = row.last_seen;
      current.client = current.client || row.client;
      current.country = current.country || row.country;
      if (row.account_id) current.accounts.add(row.account_id);
      if (row.paths && typeof row.paths === "object") {
        for (const [path, count] of Object.entries(row.paths as Record<string, number>)) {
          current.paths[path] = (current.paths[path] || 0) + Number(count || 0);
        }
      }
      map.set(key, current);
    }

    // 并发连接只取最新 TCP 快照，过旧就不显示，避免把历史数字当实时。
    const latest = await db.from("tcp_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle();
    let concurrent = new Map<string, number>();
    let concurrentAt: string | null = null;
    if (latest.data?.captured_at && Date.now() - new Date(latest.data.captured_at).getTime() < 90_000) {
      concurrentAt = latest.data.captured_at;
      const { data: tcp } = await db.from("tcp_snapshots")
        .select("remote_ip")
        .eq("captured_at", concurrentAt)
        .eq("state", "ESTABLISHED")
        .limit(5000);
      concurrent = (tcp || []).reduce((acc, row) => {
        const ip = String(row.remote_ip || "");
        if (ip) acc.set(ip, (acc.get(ip) || 0) + 1);
        return acc;
      }, new Map<string, number>());
    }

    const accountIds = [...new Set([...map.values()].flatMap((item) => [...item.accounts]))].slice(0, 500);
    const profiles = accountIds.length
      ? (await db.from("profiles").select("id,nickname").in("id", accountIds)).data || []
      : [];
    const names = new Map(profiles.map((row) => [row.id, row.nickname]));

    const { data: rules } = await db.from("access_rules")
      .select("id,target,action,expires_at,active,reason,scope")
      .eq("active", true)
      .limit(1000);

    let items = [...map.values()].map((item) => ({
      ip: item.ip,
      requests: item.requests,
      bytes_in: item.bytes_in,
      bytes_out: item.bytes_out,
      errors: item.errors,
      error_rate: item.requests ? item.errors / item.requests : 0,
      avg_ms: item.requests ? Math.round(item.weightedMs / item.requests) : null,
      first_seen: item.first_seen,
      last_seen: item.last_seen,
      client: item.client,
      country: item.country,
      concurrent: concurrent.get(item.ip) || 0,
      accounts: [...item.accounts].map((id) => ({ id, nickname: names.get(id) || "未知账号" })),
      top_paths: Object.entries(item.paths).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, count]) => ({ path, count })),
      rules: (rules || []).filter((rule) => rule.target === item.ip),
    }));

    if (query) items = items.filter((item) => item.ip.toLowerCase().includes(query));
    items.sort((a, b) => {
      if (sort === "bytes") return (b.bytes_in + b.bytes_out) - (a.bytes_in + a.bytes_out);
      if (sort === "last_seen") return String(b.last_seen || "").localeCompare(String(a.last_seen || ""));
      if (sort === "errors") return b.errors - a.errors;
      return b.requests - a.requests;
    });

    const onlineWindow = Date.now() - 5 * 60_000;
    const online = items.filter((item) => item.last_seen && new Date(item.last_seen).getTime() > onlineWindow).length;

    return {
      range,
      since,
      concurrent_at: concurrentAt,
      totals: {
        unique_ips: items.length,
        requests: items.reduce((sum, item) => sum + item.requests, 0),
        bytes: items.reduce((sum, item) => sum + item.bytes_in + item.bytes_out, 0),
        errors: items.reduce((sum, item) => sum + item.errors, 0),
        online_5m: online,
        logged_accounts: new Set(items.flatMap((item) => item.accounts.map((account) => account.id))).size,
      },
      items: items.slice(0, 500),
      note: items.length ? undefined : "该时间范围内暂无访问日志（采集器需要读取 Caddy access.log）",
    };
  });
}
