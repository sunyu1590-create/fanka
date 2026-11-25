import { NextRequest } from "next/server";
import { respond, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { requireReauth } from "@/lib/server/reauth";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICES = [
  { key: "web", label: "Web 服务", kind: "web", container: "fanka" },
  { key: "api", label: "业务 API", kind: "api", container: "fanka" },
  { key: "ai-worker", label: "AI 任务服务", kind: "ai", container: "fanka-ai-worker" },
  { key: "metrics", label: "监控采集", kind: "worker", container: "fanka-metrics" },
  { key: "database", label: "数据库", kind: "db", container: "supabase-db" },
  { key: "storage", label: "媒体存储", kind: "media", container: "supabase-storage" },
  { key: "edge", label: "反向代理", kind: "web", container: "caddy" },
];

/** 服务器与服务状态：只读真实数据；重启走受限运维代理，不开放任意命令。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "server.read");
    const admin = adminClient();
    const [{ data: processes }, { data: registry }, { data: deployments }, { data: flags }] = await Promise.all([
      admin.from("system_processes").select("service_key,label,scope,status,pid,process_count,cpu_percent,mem_bytes,started_at,captured_at"),
      admin.from("server_services").select("*"),
      admin.from("server_deployments").select("id,version,image,status,note,deployed_at").order("deployed_at", { ascending: false }).limit(20),
      admin.from("system_flags").select("key,value,updated_at"),
    ]);

    const byKey = new Map((registry || []).map((row) => [row.key, row]));
    const processByKey = new Map((processes || []).map((row) => [row.service_key, row]));
    const services = SERVICES.map((service) => {
      const registered = byKey.get(service.key);
      const process = processByKey.get(service.key);
      return {
        ...service,
        status: registered?.status || (process?.status === "running" ? "running" : process?.status || "unknown"),
        health: registered?.health || (process?.status === "running" ? "healthy" : "unknown"),
        version: registered?.version || null,
        started_at: registered?.started_at || process?.started_at || null,
        cpu_percent: process?.cpu_percent == null ? null : Number(process.cpu_percent),
        mem_bytes: process?.mem_bytes == null ? null : Number(process.mem_bytes),
        pid: process?.pid == null ? null : Number(process.pid),
        updated_at: registered?.updated_at || process?.captured_at || null,
      };
    });

    const siteMode = (flags || []).find((row) => row.key === "site_mode")?.value || { mode: "normal" };
    const features = (flags || []).find((row) => row.key === "features")?.value || {};

    return {
      services,
      deployments: deployments || [],
      site_mode: siteMode,
      features,
      uptime_seconds: Math.round(process.uptime()),
      node_version: process.version,
      note: "服务状态来自宿主机进程表与探活；数据库/存储为容器内可达性检查。",
    };
  });
}

/** 维护模式与功能开关：写入数据库后由各业务接口实时读取，不依赖前端隐藏。 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "server.manage");
    const body = await jsonBody(req);
    const action = String(body.action || "");
    // 重启服务与全站维护会中断线上访问，必须二次验证。
    if (action === "restart" || action === "flags") requireReauth(req, user.id);
    const admin = adminClient();

    if (action === "flags") {
      const mode = String((body.mode as string) || "normal");
      if (!["normal", "readonly", "eco", "maintenance"].includes(mode)) throw new ApiError(400, "模式无效");
      const features = body.features && typeof body.features === "object" ? body.features : null;
      if (features) {
        const allowed = ["register", "publish", "comment", "dm", "upload", "download", "ai", "apk"];
        for (const key of Object.keys(features)) {
          if (!allowed.includes(key)) throw new ApiError(400, `未知功能开关：${key}`);
        }
      }
      const { error: modeError } = await admin.from("system_flags").upsert({
        key: "site_mode", value: { mode }, updated_by: user.id, updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
      if (modeError) throw new ApiError(500, "维护模式写入失败");
      if (features) {
        const { data: current } = await admin.from("system_flags").select("value").eq("key", "features").maybeSingle();
        const merged = { ...(current?.value as Record<string, boolean> || {}), ...features };
        const { error } = await admin.from("system_flags").upsert({
          key: "features", value: merged, updated_by: user.id, updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
        if (error) throw new ApiError(500, "功能开关写入失败");
      }
      await admin.from("admin_action_logs").insert({
        actor_id: user.id, action: "system_flags_update", target: "system_flags",
        detail: { mode, features },
      });
      return { mode, features: features || "unchanged" };
    }

    if (action === "restart") {
      const key = String(body.key || "");
      const target = SERVICES.find((service) => service.key === key);
      if (!target) throw new ApiError(400, "未知服务");
      // 运维代理未安装时明确返回不可用，不伪造执行成功。
      try {
        const result = await callOpsAgent("/restart", { container: target.container });
        await admin.from("admin_action_logs").insert({
          actor_id: user.id, action: "service_restart", target: target.container,
          detail: { key, result },
        });
        return { restarted: true, ...result };
      } catch (error) {
        throw new ApiError(503, `运维代理不可用：${error instanceof Error ? error.message : "未安装"}`);
      }
    }

    throw new ApiError(400, "未知操作");
  });
}

/** 通过 UNIX socket 调用宿主机受限代理（只允许白名单容器）。 */
async function callOpsAgent(path: string, payload: Record<string, unknown>) {
  const http = await import("node:http");
  const token = process.env.OPS_AGENT_TOKEN || "";
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = http.request({
      socketPath: process.env.OPS_AGENT_SOCKET || "/run/heika-ops.sock",
      path, method: "POST", timeout: 15_000,
      headers: { "content-type": "application/json", "x-ops-token": token },
    }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(text || "{}");
          if ((response.statusCode || 500) >= 400) reject(new Error(parsed.error || `HTTP ${response.statusCode}`));
          else resolve(parsed);
        } catch {
          reject(new Error(`代理返回无效内容（HTTP ${response.statusCode}）`));
        }
      });
    });
    request.on("error", (error) => reject(error));
    request.on("timeout", () => { request.destroy(); reject(new Error("代理响应超时")); });
    request.end(JSON.stringify(payload));
  });
}
