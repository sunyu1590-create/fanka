import { NextRequest } from "next/server";
import { respond, ApiError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGE_HOURS: Record<string, number> = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 };

/**
 * 统一日志入口：按来源分流到各自的真实表，输出同一种结构。
 * 只返回摘要字段，绝不带 Cookie、Authorization、请求正文、完整 Token 或密钥。
 *
 * 来源：
 * - http     HTTP/API 访问摘要（Caddy 访问日志，30 天）
 * - admin    管理员操作（admin_action_logs）
 * - security 安全类操作与封禁变更（admin_action_logs 中的访问控制动作）
 * - ai       AI 审核决定（ai_moderation_decisions）
 * - deploy   部署记录（server_deployments）
 * - media    媒体与上传失败（upload_tasks 失败与重试）
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "logs.read");
    const db = adminClient();
    const params = req.nextUrl.searchParams;
    const source = params.get("source") || "http";
    const range = params.get("range") || "24h";
    const hours = RANGE_HOURS[range] || 24;
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const ip = (params.get("ip") || "").trim();
    const keyword = (params.get("q") || "").trim();
    const status = (params.get("status") || "").trim();
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(params.get("pageSize") || 50)));

    if (source === "http") {
      let query = db.from("http_access_logs")
        .select("id,ts,ip,method,path,status,ms,bytes,ua", { count: "exact" })
        .gte("ts", since)
        .order("ts", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (ip) query = query.ilike("ip", `%${ip.replace(/[%_]/g, "")}%`);
      if (keyword) query = query.ilike("path", `%${keyword.replace(/[%_]/g, "")}%`);
      if (status === "5xx") query = query.gte("status", 500);
      else if (status === "4xx") query = query.gte("status", 400).lt("status", 500);
      else if (status === "2xx") query = query.gte("status", 200).lt("status", 300);

      const { data, error, count } = await query;
      if (error) throw new ApiError(500, "访问日志读取失败（请确认控制中心迁移已执行）");

      const { data: summaryRows } = await db.from("http_access_logs")
        .select("status,ms,bytes,ts").gte("ts", since).limit(20_000);
      const rows = summaryRows || [];
      const errors = rows.filter((row) => Number(row.status) >= 400).length;
      return {
        source, range, since,
        items: (data || []).map((row) => ({
          id: String(row.id), at: row.ts, kind: "http",
          summary: `${row.method || "GET"} ${row.path || ""}`,
          detail: `${row.status ?? "—"} · ${row.ms ?? "—"}ms · ${row.bytes ?? 0}B`,
          level: Number(row.status) >= 500 ? "error" : Number(row.status) >= 400 ? "warn" : "info",
          ip: row.ip, account: null, target: row.path,
        })),
        total: count ?? 0, page, pageSize,
        summary: {
          requests: rows.length, errors,
          error_rate: rows.length ? errors / rows.length : null,
          slow: rows.filter((row) => Number(row.ms) >= 1000).length,
          bytes: rows.reduce((sum, row) => sum + Number(row.bytes || 0), 0),
        },
        note: rows.length ? undefined : "该时间范围内暂无 HTTP 日志",
      };
    }

    if (source === "admin" || source === "security") {
      const securityPrefixes = ["access_", "ip_", "alert.", "alert_", "service.", "server.", "flags.", "reauth"];
      let query = db.from("admin_action_logs")
        .select("id,actor_id,action,target,detail,created_at", { count: "exact" })
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (keyword) query = query.ilike("action", `%${keyword.replace(/[%_]/g, "")}%`);
      // 安全类动作在内存里筛，避免把通配符拼进 PostgREST 的 or 表达式。
      const securityOnly = source === "security";
      const { data, error, count } = await query;
      if (error) throw new ApiError(500, "操作日志读取失败");
      const rows = securityOnly
        ? (data || []).filter((row) => securityPrefixes.some((prefix) => String(row.action || "").startsWith(prefix)))
        : (data || []);
      const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))] as string[];
      const names = actorIds.length
        ? new Map(((await db.from("profiles").select("id,nickname").in("id", actorIds)).data || []).map((row) => [row.id as string, row.nickname as string]))
        : new Map<string, string>();
      return {
        source, range, since,
        items: rows.map((row) => ({
          id: String(row.id), at: row.created_at, kind: row.action,
          summary: row.action,
          detail: row.detail ? JSON.stringify(row.detail).slice(0, 400) : "",
          level: /delete|purge|ban|block|restart|maintenance/i.test(String(row.action)) ? "warn" : "info",
          ip: null, account: row.actor_id ? names.get(row.actor_id) || String(row.actor_id).slice(0, 8) : null,
          target: row.target,
        })),
        total: securityOnly ? rows.length : count ?? 0, page, pageSize,
        summary: { requests: securityOnly ? rows.length : count ?? 0, errors: 0, error_rate: null, slow: 0, bytes: 0 },
        note: "操作日志记录操作人、动作与结果，不含密码与令牌。",
      };
    }

    if (source === "ai") {
      let query = db.from("ai_moderation_decisions")
        .select("id,post_id,decision,risk_level,risk_types,reason,reason_code,policy_version,human_decision,elapsed_ms,created_at", { count: "exact" })
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (keyword) query = query.ilike("reason", `%${keyword.replace(/[%_]/g, "")}%`);
      if (["PASS", "REVIEW", "REJECT"].includes(status)) query = query.eq("decision", status);
      const { data, error, count } = await query;
      if (error) throw new ApiError(500, "审核日志读取失败（请确认控制中心迁移已执行）");
      return {
        source, range, since,
        items: (data || []).map((row) => ({
          id: String(row.id), at: row.created_at, kind: row.decision,
          summary: `AI ${row.decision} · 策略 ${row.policy_version}`,
          detail: `${row.reason || "—"}${row.human_decision ? ` · 人工改为 ${row.human_decision}` : ""}`,
          level: row.decision === "REJECT" ? "warn" : row.decision === "REVIEW" ? "info" : "info",
          ip: null, account: null, target: row.post_id,
          risk: row.risk_level, riskTypes: row.risk_types, elapsedMs: row.elapsed_ms,
        })),
        total: count ?? 0, page, pageSize,
        summary: { requests: count ?? 0, errors: 0, error_rate: null, slow: 0, bytes: 0 },
        note: "审核日志保留判定、风险类别、证据与策略版本，便于回溯。",
      };
    }

    if (source === "deploy") {
      const { data, error } = await db.from("server_deployments")
        .select("id,version,image,status,note,deployed_by,deployed_at")
        .order("deployed_at", { ascending: false }).limit(100);
      if (error) throw new ApiError(500, "部署记录读取失败");
      return {
        source, range, since,
        items: (data || []).map((row) => ({
          id: String(row.id), at: row.deployed_at, kind: row.status,
          summary: `部署 ${row.version}`,
          detail: [row.image, row.note].filter(Boolean).join(" · "),
          level: row.status === "success" ? "info" : "error",
          ip: null, account: row.deployed_by, target: row.version,
        })),
        total: data?.length ?? 0, page: 1, pageSize, summary: { requests: data?.length ?? 0, errors: 0, error_rate: null, slow: 0, bytes: 0 },
        note: "部署记录由发布脚本写入，不受时间筛选影响（默认展示最近 100 条）。",
      };
    }

    if (source === "media") {
      let query = db.from("upload_tasks")
        .select("id,user_id,file_name,file_size,status,attempts,error_code,created_at", { count: "exact" })
        .gte("created_at", since)
        .neq("status", "ready")
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (keyword) query = query.ilike("file_name", `%${keyword.replace(/[%_]/g, "")}%`);
      const { data, error, count } = await query;
      if (error) throw new ApiError(500, "媒体日志读取失败");
      return {
        source, range, since,
        items: (data || []).map((row) => ({
          id: String(row.id), at: row.created_at, kind: row.status,
          summary: row.file_name || "未命名文件",
          detail: `${row.status} · 重试 ${row.attempts ?? 1} 次 · ${row.error_code || "无错误码"}`,
          level: row.status === "failed" ? "error" : "warn",
          ip: null, account: row.user_id, target: row.file_name,
        })),
        total: count ?? 0, page, pageSize,
        summary: { requests: count ?? 0, errors: count ?? 0, error_rate: null, slow: 0, bytes: 0 },
        note: "只列出未完成的上传任务，便于定位失败与重试。",
      };
    }

    throw new ApiError(400, "日志来源无效");
  });
}
