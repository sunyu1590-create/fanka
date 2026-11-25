import { NextRequest } from "next/server";
import { respond, ApiError, jsonBody, dbError } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";
import { requireReauth } from "@/lib/server/reauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = new Set(["all", "web", "api", "upload", "download", "auth"]);
const ACTIONS = new Set(["allow", "block", "limit"]);
const ABILITIES = new Set(["login", "browse", "publish", "comment", "dm", "upload", "download", "ai"]);

function cleanTarget(value: unknown) {
  const target = String(value || "").trim().slice(0, 80);
  if (!target) throw new ApiError(400, "请输入 IP 或网段");
  if (target === "*") return target;
  const [address, bits] = target.split("/");
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(address);
  const ipv6 = /^[0-9a-f:]{3,39}$/i.test(address) && address.includes(":");
  if (!ipv4 && !ipv6) throw new ApiError(400, "IP 格式无效（支持 IPv4、IPv6、CIDR 网段）");
  if (ipv4 && target.includes("/") && (!/^\d{1,2}$/.test(bits) || Number(bits) > 32)) throw new ApiError(400, "IPv4 网段前缀须为 0-32");
  if (ipv6 && target.includes("/") && (!/^\d{1,3}$/.test(bits) || Number(bits) > 128)) throw new ApiError(400, "IPv6 网段前缀须为 0-128");
  return target;
}

/** 访问控制：IP 规则与账号能力限制。两者独立，避免共享出口被整段封禁。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "network.read");
    const db = adminClient();
    const [{ data: rules, error: ruleError }, { data: accounts, error: accountError }] = await Promise.all([
      db.from("access_rules").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("account_ability_restrictions").select("*").eq("active", true).order("created_at", { ascending: false }).limit(500),
    ]);
    dbError(ruleError);
    dbError(accountError);
    const userIds = [...new Set((accounts || []).map((row) => row.user_id))].slice(0, 300);
    const profiles = userIds.length
      ? (await db.from("profiles").select("id,nickname,role").in("id", userIds)).data || []
      : [];
    const names = new Map(profiles.map((row) => [row.id, row]));
    return {
      rules: rules || [],
      accounts: (accounts || []).map((row) => ({
        ...row,
        nickname: names.get(row.user_id)?.nickname || "未知账号",
        role: names.get(row.user_id)?.role || "member",
      })),
      scopes: [...SCOPES],
      abilities: [...ABILITIES],
      note: "下载限速由 Caddy 直出层提供；应用层只对 API / 页面 / 上传生效。",
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "network.manage");
    const db = adminClient();
    // 防火墙与封禁类操作会直接影响线上连通性，必须二次验证身份。
    requireReauth(req, user.id);
    const body = await jsonBody(req);
    const kind = String(body.kind || "rule");
    const reason = String(body.reason || "").trim().slice(0, 300);
    if (reason.length < 4) throw new ApiError(400, "请填写至少 4 个字的操作原因");

    if (kind === "account") {
      const userId = String(body.userId || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new ApiError(400, "账号 ID 无效");
      const ability = String(body.ability || "");
      if (!ABILITIES.has(ability)) throw new ApiError(400, "能力类型无效");
      const permanent = body.permanent === true;
      const until = permanent ? null : new Date(String(body.until || "")) instanceof Date && body.until ? new Date(String(body.until)).toISOString() : null;
      if (!permanent && !until) throw new ApiError(400, "请选择限制截止时间或永久");
      const { data, error } = await db.from("account_ability_restrictions").upsert({
        user_id: userId, ability, until, reason, created_by: user.id, active: true,
      }, { onConflict: "user_id,ability" }).select("*").single();
      dbError(error);
      await db.from("admin_action_logs").insert({
        actor_id: user.id, action: "account_ability_restrict", target: userId,
        detail: { ability, until, permanent, reason },
      });
      return { restriction: data };
    }

    const target = cleanTarget(body.target);
    const scope = String(body.scope || "all");
    const action = String(body.action || "block");
    if (!SCOPES.has(scope)) throw new ApiError(400, "生效范围无效");
    if (!ACTIONS.has(action)) throw new ApiError(400, "处理方式无效");
    const permanent = body.permanent === true;
    const expiresAt = permanent ? null : (body.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null);
    if (!permanent && !expiresAt) throw new ApiError(400, "请选择临时封禁时长或永久");

    const { data, error } = await db.from("access_rules").insert({
      scope, target, action,
      max_concurrent: action === "limit" ? Number(body.maxConcurrent) || null : null,
      rate_per_minute: action === "limit" ? Number(body.ratePerMinute) || null : null,
      bandwidth_kbps: action === "limit" ? Number(body.bandwidthKbps) || null : null,
      expires_at: expiresAt, reason, created_by: user.id, active: true,
    }).select("*").single();
    dbError(error);
    await db.from("admin_action_logs").insert({
      actor_id: user.id, action: permanent ? "access_rule_create_permanent" : "access_rule_create",
      target, detail: { scope, action, expiresAt, reason },
    });
    return { rule: data };
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "network.manage");
    const db = adminClient();
    requireReauth(req, user.id);
    const kind = req.nextUrl.searchParams.get("kind") || "rule";
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "记录 ID 无效");
    if (kind === "account") {
      const { error } = await db.from("account_ability_restrictions").update({ active: false }).eq("id", id);
      dbError(error);
      await db.from("admin_action_logs").insert({ actor_id: user.id, action: "account_ability_release", target: id, detail: {} });
      return { released: true };
    }
    const { error } = await db.from("access_rules").update({ active: false }).eq("id", id);
    dbError(error);
    await db.from("admin_action_logs").insert({ actor_id: user.id, action: "access_rule_revoke", target: id, detail: {} });
    return { revoked: true };
  });
}
