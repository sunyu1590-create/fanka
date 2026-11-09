import { NextRequest } from "next/server";
import { dbError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const { data, error } = await db.rpc("get_admin_overview");
    dbError(error);
    return data;
  });
}
