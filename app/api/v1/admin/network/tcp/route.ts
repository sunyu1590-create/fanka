import { NextRequest } from "next/server";
import { respond, ApiError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATES = ["ESTABLISHED", "TIME_WAIT", "CLOSE_WAIT", "SYN_SENT", "SYN_RECV", "FIN_WAIT1", "FIN_WAIT2", "LAST_ACK", "CLOSE", "LISTEN"];

/**
 * TCP 连接监控：只读取采集器写入的真实快照（/proc/net/tcp + 进程映射）。
 * 快照超过 90 秒未更新时明确标记 stale，不拿旧数据冒充实时。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "network.read");
    // 采集表对 authenticated 全部 revoke，管理接口统一走 service role。
    const db = adminClient();
    const params = req.nextUrl.searchParams;
    const state = (params.get("state") || "").toUpperCase();
    const query = (params.get("q") || "").trim().slice(0, 80);
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(params.get("pageSize") || 60)));

    const latest = await db.from("tcp_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle();
    const capturedAt = latest.data?.captured_at || null;
    if (!capturedAt) {
      return {
        available: false,
        reason: "TCP 采集器尚未上报数据（fanka-metrics 需要读取宿主机 /proc/net/tcp）",
        captured_at: null,
        stale: true,
        totals: { total: 0, by_state: [] as Array<{ state: string; count: number }> }, items: [], page, pageSize, total: 0,
      };
    }
    const age = Date.now() - new Date(capturedAt).getTime();
    const stale = age > 90_000;

    // 状态分布来自采集器写入的 SUMMARY 行；明细最多 200 条，按需在内存筛选。
    const [{ data: summary }, { data, error }] = await Promise.all([
      db.from("tcp_snapshots").select("meta").eq("captured_at", capturedAt).eq("state", "SUMMARY").maybeSingle(),
      db.from("tcp_snapshots")
        .select("state,local_ip,local_port,remote_ip,remote_port,process,pid,direction,bytes_sent,bytes_recv,first_seen")
        .eq("captured_at", capturedAt)
        .neq("state", "SUMMARY")
        .limit(500),
    ]);
    if (error) throw new ApiError(500, "TCP 快照读取失败");
    const rows = data || [];
    const counts = new Map<string, number>(
      Object.entries((summary?.meta as { counts?: Record<string, number> } | null)?.counts || {}),
    );
    if (!counts.size) {
      for (const row of rows) counts.set(row.state, (counts.get(row.state) || 0) + 1);
    }
    const byState = [...counts.entries()]
      .map(([name, count]) => ({ state: name, count }))
      .sort((a, b) => b.count - a.count);
    const ordered = [...STATES.filter((name) => counts.has(name)).map((name) => ({ state: name, count: counts.get(name) || 0 })),
      ...byState.filter((item) => !STATES.includes(item.state))];

    let filtered = rows;
    if (state) filtered = filtered.filter((row) => row.state === state);
    if (query) {
      const needle = query.toLowerCase();
      filtered = filtered.filter((row) =>
        [row.local_ip, row.remote_ip, String(row.local_port ?? ""), String(row.remote_port ?? ""), row.process, String(row.pid ?? "")]
          .some((value) => String(value ?? "").toLowerCase().includes(needle)));
    }
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    const established = counts.get("ESTABLISHED") || 0;
    const timeWait = counts.get("TIME_WAIT") || 0;
    const closeWait = counts.get("CLOSE_WAIT") || 0;
    const totalConnections = Number((summary?.meta as { total?: number } | null)?.total) || rows.length;

    return {
      available: true,
      captured_at: capturedAt,
      stale,
      age_seconds: Math.round(age / 1000),
      totals: {
        total: totalConnections,
        established,
        time_wait: timeWait,
        close_wait: closeWait,
        listen: counts.get("LISTEN") || 0,
        by_state: ordered,
        inbound: rows.filter((row) => row.direction === "inbound").length,
        outbound: rows.filter((row) => row.direction === "outbound").length,
        bytes_sent: null,
        bytes_recv: null,
      },
      items,
      page,
      pageSize,
      total,
      note: stale ? "采集快照已超过 90 秒未更新，请检查 fanka-metrics 容器" : undefined,
    };
  });
}
