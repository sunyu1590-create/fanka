import { NextRequest } from "next/server";
import { respond, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 首页模块白名单：与前端 ControlCenter2 的模块 key 保持一致。 */
const MODULES = ["resource", "todo", "ops", "services", "quick", "ai", "activity"] as const;
const MODES = ["lite", "pro"] as const;
const MAX_BYTES = 12_000;

type Layout = {
  order: string[];
  hidden: string[];
  width: Record<string, 1 | 2>;
  quick: string[];
};

function sanitizeLayout(input: unknown): Layout {
  if (!input || typeof input !== "object") throw new ApiError(400, "布局格式无效");
  const raw = input as Partial<Layout>;
  const seen = new Set<string>();
  const order = (Array.isArray(raw.order) ? raw.order : [])
    .filter((key): key is string => typeof key === "string" && (MODULES as readonly string[]).includes(key) && !seen.has(key) && Boolean(seen.add(key)));
  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : [])
    .filter((key): key is string => typeof key === "string" && (MODULES as readonly string[]).includes(key));
  const width: Record<string, 1 | 2> = {};
  if (raw.width && typeof raw.width === "object") {
    for (const key of MODULES) {
      const value = (raw.width as Record<string, unknown>)[key];
      if (value === 1 || value === 2) width[key] = value;
    }
  }
  const quick = (Array.isArray(raw.quick) ? raw.quick : [])
    .filter((key): key is string => typeof key === "string" && /^[a-z0-9-]{1,40}$/.test(key))
    .slice(0, 20);
  return { order, hidden, width, quick };
}

/** 读取当前账号的控制台布局；没有记录时返回专业模式默认值，由前端补齐顺序。 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "content.read");
    const admin = adminClient();
    const { data, error } = await admin
      .from("admin_console_prefs")
      .select("mode,layout,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new ApiError(503, "布局偏好读取失败");
    return data || { mode: "pro", layout: null, updated_at: null };
  });
}

/** 保存布局：按账号覆盖写入，同时限制体积与字段，防止把任意 JSON 塞进库。 */
export async function PUT(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "content.read");
    const body = await jsonBody(req);
    const mode = String(body.mode || "pro");
    if (!(MODES as readonly string[]).includes(mode)) throw new ApiError(400, "模式无效");
    const layout = sanitizeLayout(body.layout);
    const serialized = JSON.stringify({ mode, layout });
    if (serialized.length > MAX_BYTES) throw new ApiError(400, "布局配置过大");

    const admin = adminClient();
    const { error } = await admin.from("admin_console_prefs").upsert({
      user_id: user.id,
      mode,
      layout,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new ApiError(503, "布局偏好保存失败");
    return { mode, layout, saved: true };
  });
}
