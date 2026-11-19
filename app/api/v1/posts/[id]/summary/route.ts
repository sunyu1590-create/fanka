import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { context, dbError, respond, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db } = await context(req, false);
    const id = uuid((await params).id);
    const post = await db.from("posts").select("id,title,body,status").eq("id", id).maybeSingle();
    dbError(post.error);
    if (!post.data || post.data.status !== "published") return { summary: null };
    const contentHash = createHash("md5").update(`${post.data.title || ""}\n${post.data.body || ""}`).digest("hex");
    const summary = await db.from("ai_post_summaries").select("summary,content_hash,model,generated_at").eq("post_id", id).maybeSingle();
    if (summary.error) return { summary: null };
    if (!summary.data || summary.data.content_hash !== contentHash) return { summary: null };
    return { summary: summary.data.summary, generatedAt: summary.data.generated_at };
  });
}
