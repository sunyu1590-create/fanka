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
    const [membership, redemptions, events] = await Promise.all(ids.length ? [
      db.from("user_memberships").select("user_id,tier,starts_at,expires_at,pending_tier,pending_days,source").in("user_id", ids),
      db.from("membership_redemptions").select("user_id,tier,duration_days,activation_state,starts_at,expires_at,created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(100),
      db.from("membership_events").select("user_id,event_type,tier,source,details,created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(200),
    ] : [Promise.resolve({ data: [], error: null }), Promise.resolve({ data: [], error: null }), Promise.resolve({ data: [], error: null })]);
    dbError(membership.error); dbError(redemptions.error); dbError(events.error);
    const byUser = new Map((membership.data || []).map((row) => [row.user_id, row]));
    const redemptionsByUser = new Map<string, typeof redemptions.data>();
    for (const row of redemptions.data || []) redemptionsByUser.set(row.user_id, [...(redemptionsByUser.get(row.user_id) || []), row]);
    const eventsByUser = new Map<string, typeof events.data>();
    for (const row of events.data || []) eventsByUser.set(row.user_id, [...(eventsByUser.get(row.user_id) || []), row]);
    return { users: (result.data || []).map((profile) => {
      const userEvents = eventsByUser.get(profile.id) || [];
      return {
        ...profile,
        membership: byUser.get(profile.id) || null,
        redemptions: redemptionsByUser.get(profile.id) || [],
        periods: userEvents.map((event) => ({
          tier: event.tier,
          source: event.source,
          starts_at: event.created_at,
          ends_at: typeof event.details?.expiresAt === "string" ? event.details.expiresAt : null,
          revoked_at: event.event_type === "admin_revoke" ? event.created_at : null,
          revoke_reason: typeof event.details?.reason === "string" ? event.details.reason : null,
        })),
      };
    }) };
  });
}
