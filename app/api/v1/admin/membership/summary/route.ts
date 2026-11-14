import { NextRequest } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { dbError, respond } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requireAdmin(req);
    const { data, error } = await adminClient().rpc("admin_membership_dashboard_stats");
    dbError(error);
    return data;
  });
}
