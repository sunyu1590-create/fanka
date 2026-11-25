import { NextRequest } from "next/server";
import { respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 服务器进程监控（只读）。
 * 数据来自监控采集器读取宿主机 /proc 后写入的 system_processes：
 * 只有服务名、PID、CPU、内存、启动时间，不含任何启动参数，也不提供命令执行。
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "audit.read");
    const db = adminClient();
    const { data, error } = await db.from("system_processes")
      .select("service_key,label,scope,status,pid,process_count,cpu_percent,mem_bytes,started_at,captured_at,detail")
      .order("cpu_percent", { ascending: false });
    return {
      items: (data || []).map((row) => ({
        service_key: row.service_key,
        label: row.label,
        scope: row.scope,
        status: row.status,
        pid: row.pid == null ? null : Number(row.pid),
        process_count: Number(row.process_count || 1),
        cpu_percent: row.cpu_percent == null ? null : Number(row.cpu_percent),
        mem_bytes: row.mem_bytes == null ? null : Number(row.mem_bytes),
        started_at: row.started_at,
        captured_at: row.captured_at,
        tone: (row.detail as { tone?: string } | null)?.tone || null,
      })),
      captured_at: data?.[0]?.captured_at || null,
      scope: data?.[0]?.scope || null,
      error: error ? "进程监控数据暂不可读取" : null,
      note: "采集自宿主机 /proc（只读）。容器内进程已按可核对的服务名归类，未采集的字段留空。",
    };
  });
}
