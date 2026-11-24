import { NextRequest } from "next/server";
import { context } from "@/lib/server/api";

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

/**
 * 服务健康检查：数据库与媒体存储的真实连通性。
 * 监控采集器与部署脚本共用；任何一项失败返回 503 并列出失败项。
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const checks: Record<string, { ok: boolean; detail?: string; latency_ms?: number }> = {};
  let healthy = true;
  try {
    const { db } = await context(req, false);
    const started = Date.now();
    const { error } = await db.from("posts").select("id", { count: "exact", head: true }).limit(1);
    checks.database = error ? { ok: false, detail: error.message } : { ok: true, latency_ms: Date.now() - started };
    if (error) healthy = false;
    const storageStarted = Date.now();
    const { data: files, error: storageError } = await db.storage.from("post-covers").list("", { limit: 1 });
    checks.media_storage = storageError ? { ok: false, detail: storageError.message } : { ok: true, latency_ms: Date.now() - storageStarted, detail: `${files?.length ?? 0} entries` };
    if (storageError) healthy = false;
  } catch (error) {
    checks.database = { ok: false, detail: error instanceof Error ? error.message : "unknown" };
    healthy = false;
  }
  return Response.json({ data: { ok: healthy, checks, checked_at: new Date().toISOString() } }, { status: healthy ? 200 : 503 });
}
