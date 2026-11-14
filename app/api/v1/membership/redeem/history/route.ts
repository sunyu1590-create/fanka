import { NextRequest } from "next/server";
import { context, dbError, respond } from "@/lib/server/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data, error } = await db.from("membership_redemptions")
      .select("tier,duration_days,activation_state,starts_at,expires_at,created_at")
      .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(50);
    dbError(error);
    return { items: data || [] };
  });
}
