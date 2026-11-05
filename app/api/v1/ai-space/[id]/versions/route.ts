import { NextRequest } from "next/server";
import { context, dbError, respond, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db } = await context(req, false);
    const id = uuid((await params).id);
    const { data: post, error: postError } = await db.from("posts").select("id").eq("id", id).eq("channel", "ai").eq("status", "published").maybeSingle();
    dbError(postError);
    if (!post) return { items: [] };
    const { data, error } = await db.from("ai_resource_versions").select("id,version_label,payload,changelog,created_at").eq("post_id", id).order("created_at", { ascending: false }).limit(30);
    dbError(error);
    return { items: data || [] };
  });
}
