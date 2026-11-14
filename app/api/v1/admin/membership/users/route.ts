import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requireAdmin(req);
    const term = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 64);
    if (term.length < 2) throw new ApiError(400, "请输入至少 2 个字符或完整用户 ID");
    let query = db.from("profiles").select("id,nickname,membership_tier,created_at").order("created_at", { ascending: false }).limit(20);
    if (/^[0-9a-f-]{36}$/i.test(term)) query = query.eq("id", term);
    else query = query.ilike("nickname", `%${term.replace(/[%_]/g, "\\$&")}%`);
    const result = await query; dbError(result.error);
    const ids = (result.data || []).map((profile) => profile.id);
    const membership = ids.length ? await db.from("user_memberships").select("user_id,tier,starts_at,expires_at,pending_tier,pending_days,source").in("user_id", ids) : { data: [], error: null };
    dbError(membership.error);
    const byUser = new Map((membership.data || []).map((row) => [row.user_id, row]));
    return { users: (result.data || []).map((profile) => ({ ...profile, membership: byUser.get(profile.id) || null })) };
  });
}
