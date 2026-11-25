import { NextRequest } from "next/server";
import { ApiError, jsonBody, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 可配置告警规则：阈值、持续时间、冷却、级别、启停，全部由采集器按表执行。 */
const METRICS: Array<{ key: string; label: string; unit: string; hint: string }> = [
  { key: "cpu_percent", label: "CPU 使用率", unit: "%", hint: "宿主机 /proc/stat 计算" },
  { key: "mem_percent", label: "内存使用率", unit: "%", hint: "MemTotal 与 MemAvailable" },
  { key: "disk_percent", label: "磁盘使用率", unit: "%", hint: "根分区容量" },
  { key: "tcp_total", label: "TCP 连接总数", unit: "条", hint: "来自 /proc/net/tcp 快照" },
  { key: "api_error_rate", label: "API 错误率", unit: "%", hint: "窗口内 4xx/5xx 占比" },
  { key: "api_p95_ms", label: "API P95 耗时", unit: "ms", hint: "窗口内 95 分位" },
  { key: "upload_fail_rate", label: "上传失败率", unit: "%", hint: "24 小时上传任务" },
  { key: "net_tx_rate", label: "出网速率", unit: "B/s", hint: "网卡计数器差值" },
  { key: "cert_days_left", label: "HTTPS 证书剩余", unit: "天", hint: "本机 TLS 握手读取" },
  { key: "service_down", label: "服务健康检查失败", unit: "", hint: "1 = 有服务不可用" },
];

const OPERATORS = [">", ">=", "<", "<="];

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "server.read");
    const db = adminClient();
    const [rules, latest] = await Promise.all([
      db.from("alert_rules").select("id,metric,operator,threshold,duration_seconds,cooldown_seconds,level,enabled,created_at").order("created_at", { ascending: true }),
      db.from("system_metrics").select("captured_at,cpu_percent,mem_percent,disk_percent,net_tx_rate,api_requests,api_errors,api_p95_ms,upload_tasks,upload_success_rate").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (rules.error) throw new ApiError(503, "告警规则暂不可用");
    const open = await db.from("system_alerts").select("alert_type,level,last_seen_at,occurrences").in("status", ["open", "acknowledged", "resolving"]).limit(200);
    const firing = new Map((open.data || []).map((row) => [String(row.alert_type), row]));
    return {
      metrics: METRICS,
      rules: (rules.data || []).map((rule) => ({
        ...rule,
        label: METRICS.find((item) => item.key === rule.metric)?.label || rule.metric,
        unit: METRICS.find((item) => item.key === rule.metric)?.unit || "",
        firing: firing.get(`rule:${rule.metric}`) || null,
      })),
      sample: latest.data || null,
      note: "规则由采集器每 45 秒评估一次：连续满足持续时间才触发，恢复后按冷却时间抑制重复告警；指标取不到时不会误报。",
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "server.manage");
    const body = await jsonBody(req);
    const metric = String(body.metric || "");
    if (!METRICS.some((item) => item.key === metric)) throw new ApiError(400, "监控指标无效");
    const operator = String(body.operator || ">");
    if (!OPERATORS.includes(operator)) throw new ApiError(400, "比较方式无效");
    const threshold = Number(body.threshold);
    if (!Number.isFinite(threshold)) throw new ApiError(400, "阈值必须是数字");
    const duration = Math.round(Number(body.duration_seconds ?? 120));
    const cooldown = Math.round(Number(body.cooldown_seconds ?? 1800));
    if (duration < 0 || duration > 86_400) throw new ApiError(400, "持续时间需在 0 到 86400 秒之间");
    if (cooldown < 0 || cooldown > 604_800) throw new ApiError(400, "冷却时间需在 0 到 604800 秒之间");
    const level = String(body.level || "warn");
    if (!["info", "warn", "critical"].includes(level)) throw new ApiError(400, "级别无效");
    const enabled = body.enabled !== false;
    const id = body.id ? String(body.id) : "";

    const patch = { metric, operator, threshold, duration_seconds: duration, cooldown_seconds: cooldown, level, enabled };
    if (id) {
      const { data, error } = await db.from("alert_rules").update(patch).eq("id", id).select("id").maybeSingle();
      if (error) {
        if (error.code === "23505") throw new ApiError(409, "同一指标、比较方式与阈值已存在");
        throw new ApiError(503, "规则保存失败");
      }
      if (!data) throw new ApiError(404, "规则不存在");
      await db.from("admin_action_logs").insert({ actor_id: user.id, action: "alert_rule.update", target: id, detail: patch });
      return { id };
    }
    const { data, error } = await db.from("alert_rules").insert(patch).select("id").maybeSingle();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "同一指标、比较方式与阈值已存在");
      throw new ApiError(503, "规则创建失败");
    }
    await db.from("admin_action_logs").insert({ actor_id: user.id, action: "alert_rule.create", target: data?.id ?? null, detail: patch });
    return { id: data?.id };
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await requirePermission(req, "server.manage");
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) throw new ApiError(400, "规则编号无效");
    const { error } = await db.from("alert_rules").delete().eq("id", id);
    if (error) throw new ApiError(503, "规则删除失败");
    await db.from("admin_action_logs").insert({ actor_id: user.id, action: "alert_rule.delete", target: id, detail: { id } });
    return { ok: true };
  });
}
