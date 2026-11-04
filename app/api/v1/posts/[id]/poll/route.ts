import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const postId = uuid((await params).id, "内容");
    const { data: poll, error } = await db.from("post_polls").select("id,question,created_at").eq("post_id", postId).maybeSingle();
    dbError(error);
    if (!poll) return { poll: null };
    const [{ data: options, error: optionsError }, voteResult] = await Promise.all([
      db.from("post_poll_options").select("id,label,position,vote_count").eq("poll_id", poll.id).order("position"),
      user ? db.from("post_poll_votes").select("option_id").eq("poll_id", poll.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    dbError(optionsError); dbError(voteResult.error);
    return { poll: { ...poll, options: options || [], selectedOptionId: voteResult.data?.option_id || null, totalVotes: (options || []).reduce((sum, option) => sum + option.vote_count, 0) } };
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { db, user } = await context(req);
    const postId = uuid((await params).id, "内容");
    const body = await jsonBody(req);
    const optionId = uuid(body.optionId, "选项");
    const { data: poll, error } = await db.from("post_polls").select("id").eq("post_id", postId).maybeSingle();
    dbError(error);
    if (!poll) throw new ApiError(404, "投票不存在");
    const option = await db.from("post_poll_options").select("id").eq("poll_id", poll.id).eq("id", optionId).maybeSingle();
    dbError(option.error);
    if (!option.data) throw new ApiError(400, "投票选项无效");
    const { error: voteError } = await db.from("post_poll_votes").upsert({ poll_id: poll.id, option_id: optionId, user_id: user!.id }, { onConflict: "poll_id,user_id" });
    dbError(voteError);
    return { voted: true, optionId };
  });
}
