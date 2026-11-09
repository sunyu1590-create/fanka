import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const db = adminClient();
    const { data: chains, error } = await db.from("exploration_chains").select("id,owner_id,seed_post_id,title,prompt,status,created_at,updated_at").or(`status.eq.active,owner_id.eq.${user!.id}`).order("updated_at", { ascending: false }).limit(40);
    dbError(error);
    const chainIds = (chains || []).map((item) => item.id);
    const postIds = [...new Set((chains || []).map((item) => item.seed_post_id))];
    const [entriesResult, postsResult, profilesResult] = await Promise.all([
      chainIds.length ? db.from("exploration_chain_entries").select("id,chain_id,user_id,post_id,content,created_at").in("chain_id", chainIds).order("created_at") : Promise.resolve({ data: [], error: null }),
      postIds.length ? db.from("posts").select("id,title,images,cover_url,tag").in("id", postIds) : Promise.resolve({ data: [], error: null }),
      chainIds.length ? db.from("profiles").select("id,nickname,avatar_url").in("id", [...new Set((chains || []).map((item) => item.owner_id))]) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(entriesResult.error); dbError(postsResult.error); dbError(profilesResult.error);
    const entries = entriesResult.data || [];
    const entryAuthors = [...new Set(entries.map((item) => item.user_id))];
    const { data: authorRows, error: authorError } = entryAuthors.length ? await db.from("profiles").select("id,nickname,avatar_url").in("id", entryAuthors) : { data: [], error: null };
    dbError(authorError);
    const profiles = new Map([...(profilesResult.data || []), ...(authorRows || [])].map((profile) => [profile.id, profile]));
    const posts = new Map((postsResult.data || []).map((post) => [post.id, post]));
    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) grouped.set(entry.chain_id, [...(grouped.get(entry.chain_id) || []), entry]);
    return { items: (chains || []).map((chain) => ({ ...chain, seed: posts.get(chain.seed_post_id) || null, owner: profiles.get(chain.owner_id) || null, entries: (grouped.get(chain.id) || []).map((entry) => ({ ...entry, author: profiles.get(entry.user_id) || null })) })) };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const body = await jsonBody(req);
    const db = adminClient();
    if (body.action === "create") {
      const postId = uuid(body.postId, "起始卡片");
      const title = textField(body.title, "接龙标题", 4, 100);
      const prompt = textField(body.prompt, "接龙引子", 8, 220);
      const content = textField(body.content, "第一段内容", 8, 600);
      const { data: post, error: postError } = await db.from("posts").select("id").eq("id", postId).eq("status", "published").maybeSingle();
      dbError(postError); if (!post) throw new ApiError(404, "起始卡片暂不可用");
      const { data: chain, error } = await db.from("exploration_chains").insert({ owner_id: user!.id, seed_post_id: postId, title, prompt }).select("id").single();
      dbError(error);
      if (!chain) throw new ApiError(500, "接龙创建失败");
      const { error: entryError } = await db.from("exploration_chain_entries").insert({ chain_id: chain.id, user_id: user!.id, post_id: postId, content });
      if (entryError) { await db.from("exploration_chains").delete().eq("id", chain.id); dbError(entryError); }
      return { id: chain.id };
    }
    if (body.action === "contribute") {
      const chainId = uuid(body.chainId, "接龙");
      const content = textField(body.content, "接龙内容", 8, 600);
      const postId = body.postId ? uuid(body.postId, "关联卡片") : null;
      const { data: chain, error: chainError } = await db.from("exploration_chains").select("id,status,owner_id").eq("id", chainId).maybeSingle();
      dbError(chainError); if (!chain || chain.status !== "active") throw new ApiError(404, "这个接龙已结束");
      if (chain.owner_id === user!.id) throw new ApiError(409, "发起者已经写过开篇，请邀请其他探索者接续");
      if (postId) {
        const { data: post, error: postError } = await db.from("posts").select("id").eq("id", postId).eq("status", "published").maybeSingle();
        dbError(postError); if (!post) throw new ApiError(404, "关联卡片暂不可用");
      }
      const { error } = await db.from("exploration_chain_entries").insert({ chain_id: chainId, user_id: user!.id, post_id: postId, content });
      if (error?.code === "23505") throw new ApiError(409, "你已经为这个接龙续写过了");
      dbError(error);
      await db.from("exploration_chains").update({ updated_at: new Date().toISOString() }).eq("id", chainId);
      return { saved: true };
    }
    if (body.action === "close") {
      const chainId = uuid(body.chainId, "接龙");
      const { data, error } = await db.from("exploration_chains").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", chainId).eq("owner_id", user!.id).select("id").maybeSingle();
      dbError(error); if (!data) throw new ApiError(403, "只有接龙发起者可以结束接龙");
      return { closed: true };
    }
    throw new ApiError(400, "接龙操作无效");
  });
}
