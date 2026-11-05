import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const id = uuid((await params).id);
    const body = await jsonBody(req);
    const kind = ["broken_link", "unsafe", "outdated", "other"].includes(String(body.kind)) ? String(body.kind) : "other";
    const details = textField(body.details, "反馈说明", 3, 1000);
    const { data, error } = await db.from("ai_resource_feedback").insert({ post_id: id, reporter_id: user!.id, kind, details }).select("id,status,created_at").single();
    if (error?.code === "23505") throw new ApiError(409, "你已提交过这类反馈，管理员处理后可再次反馈");
    dbError(error);
    return data;
  });
}
