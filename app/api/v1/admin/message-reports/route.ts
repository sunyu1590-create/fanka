import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  ApiError,
  uuid,
} from "@/lib/server/api";
import { recordModerationAudit } from "@/lib/server/moderation-audit";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req);
    const { data: admin, error } = await db.rpc("is_admin");
    dbError(error);
    if (!admin) throw new ApiError(403, "需要管理员权限");
    const { data, error: read } = await db
      .from("dm_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    dbError(read);
    return data;
  });
}
export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const { data: admin, error } = await db.rpc("is_admin");
    dbError(error);
    if (!admin) throw new ApiError(403, "需要管理员权限");
    const b = await jsonBody(req);
    if (!["resolved", "dismissed"].includes(String(b.status)))
      throw new ApiError(400, "处理状态无效");
    const { data, error: write } = await db
      .from("dm_reports")
      .update({ status: b.status })
      .eq("id", uuid(b.id))
      .select()
      .single();
    dbError(write);
    await recordModerationAudit(db, { actorId: user!.id, action: b.status === "resolved" ? "dm_report_resolved" : "dm_report_dismissed", targetType: "report", targetId: data.id, reason: "私信举报处置" });
    return data;
  });
}
