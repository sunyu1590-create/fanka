import { NextRequest } from "next/server";
import { requestMetricsSnapshot } from "@/lib/server/request-metrics";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const token = process.env.AI_TASK_WORKER_TOKEN;
  if (!token || token.length < 16) return false;
  const header = req.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= token.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

/** 供监控采集器抓取的进程内请求指标（与 AI worker 共用内部令牌）。 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ data: requestMetricsSnapshot() });
}

/** 健康检查：数据库 + 媒体存储 + 业务表连通性，失败时降级为 503。 */
export async function HEAD(req: NextRequest) {
  return GET(req).then((response) => new Response(null, { status: response.status }));
}

export async function POST(req: NextRequest) {
  return GET(req);
}
