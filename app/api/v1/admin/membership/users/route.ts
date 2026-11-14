import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const query = (req.nextUrl.searchParams.get("query") || "").trim().replace(/[%,_*]/g, "").slice(0, 80);
    if (query.length < 2) throw new ApiError(400, "请输入至少 2 个字符搜索用户");
    const service = adminClient();
    const { data, error } = await service.from("profiles").select("id,nickname,membership_tier,membership_expires_at,created_at").ilike("nickname", `%${query}%`).order("created_at", { ascending: false }).limit(30);
    dbError(error);
    const userIds = (data || []).map((item) => item.id);
    if (!userIds.length) return { items: [] };
    const [periods, redemptions] = await Promise.all([
      service.from("user_membership_periods").select("id,user_id,tier,starts_at,ends_at,source,revoked_at,revoke_reason").in("user_id", userIds).order("starts_at", { ascending: false }),
      service.from("redemption_records").select("user_id,tier,duration_days,effective_from,expires_at,created_at").in("user_id", userIds).order("created_at", { ascending: false }),
    ]);
    dbError(periods.error); dbError(redemptions.error);
    const now = Date.now();
    return { items: (data || []).map((item) => {
      const userPeriods = (periods.data || []).filter((period) => period.user_id === item.id);
      const active = userPeriods.find((period) => new Date(period.starts_at).getTime() <= now && (!period.ends_at || new Date(period.ends_at).getTime() > now) && !period.revoked_at);
      return { ...item, membership_tier: active?.tier || "free", membership_expires_at: active?.ends_at || null, periods: userPeriods, redemptions: (redemptions.data || []).filter((record) => record.user_id === item.id) };
    }) };
  });
}
