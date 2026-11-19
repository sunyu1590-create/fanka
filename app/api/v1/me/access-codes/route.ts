import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const result = await adminClient().from("user_badge_awards")
      .select("id,granted_at,profile_badge_types!inner(id,slug,label,description,color)")
      .eq("user_id", user!.id).is("revoked_at", null)
      .eq("profile_badge_types.active", true).order("granted_at", { ascending: false });
    dbError(result.error);
    return { badges: (result.data || []).map((row) => ({ ...row.profile_badge_types, awardedAt: row.granted_at })) };
  });
}
