/**
 * 详情页七模块推荐 API：基于当前作品上下文，返回七个推荐模块。
 * 模块：同系列、同标签、同作者、标签热门、标签探索、相似用户、编辑精选。
 */
import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/distribution";
import { recordSeen } from "@/lib/server/dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModuleKey = "sameSeries" | "sameTag" | "sameAuthor" | "hotInTag" | "exploreTag" | "simUsers" | "editorPick";

interface PostCard {
  id: string;
  title: string;
  excerpt?: string;
  cover?: string | null;
  channel?: string;
  kind?: string;
  tag_id?: number;
  author_id?: string;
  created_at?: string;
  hot_score?: number;
  reason?: string;
}

interface ContextPost {
  id: string;
  title: string;
  tag_id: number | null;
  series_id: string | null;
  author_id: string | null;
  channel: string;
  kind: string;
  cover: string | null;
  created_at: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params;
    const { db, user } = await context(req, false);
    const config = (await loadConfig(db)).config;
    const slots = config.recommend.detailSlots;
    const sessionKey = req.nextUrl.searchParams.get("session") || user?.id || `anon-${Date.now()}`;
    const excludeIds = new Set<string>([id]);

    const { data: postRow } = await db.from("posts")
      .select("id,title,tag_id,series_id,author_id,channel,kind,cover,created_at")
      .eq("id", id).eq("status", "published").maybeSingle();
    const post = postRow as ContextPost | null;

    if (!post) return { error: "not_found", modules: {} };

    const results: Record<ModuleKey, PostCard[]> = {
      sameSeries: [], sameTag: [], sameAuthor: [], hotInTag: [], exploreTag: [], simUsers: [], editorPick: [],
    };

    // 模块 1：同系列
    if (slots.sameSeries > 0 && post.series_id) {
      const { data } = await db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("series_id", post.series_id).eq("status", "published").neq("id", id)
        .order("created_at", { ascending: false }).limit(slots.sameSeries);
      const items = (data || []) as PostCard[];
      results.sameSeries = items.map((p) => ({ ...p, reason: "同系列作品" }));
    }

    // 模块 2：同标签（排除同系列）
    if (slots.sameTag > 0 && post.tag_id) {
      const { data } = await db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("tag_id", post.tag_id).eq("status", "published").neq("id", id)
        .order("hot_score", { ascending: false }).limit(slots.sameTag);
      const items = (data || []) as PostCard[];
      results.sameTag = items.map((p) => ({ ...p, reason: "同主题热门" }));
    }

    // 模块 3：同作者
    if (slots.sameAuthor > 0 && post.author_id) {
      const { data } = await db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("author_id", post.author_id).eq("status", "published").neq("id", id)
        .order("created_at", { ascending: false }).limit(slots.sameAuthor);
      const items = (data || []) as PostCard[];
      results.sameAuthor = items.map((p) => ({ ...p, reason: "同作者作品" }));
    }

    // 模块 4：同标签热门（跨作者）
    if (slots.hotInTag > 0 && post.tag_id) {
      const { data } = await db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("tag_id", post.tag_id).eq("status", "published")
        .neq("id", id).neq("author_id", post.author_id || "__none__")
        .order("hot_score", { ascending: false }).limit(slots.hotInTag);
      const items = (data || []) as PostCard[];
      results.hotInTag = items.map((p) => ({ ...p, reason: "此标签下的热门" }));
    }

    // 模块 5：标签探索（非当前标签）
    if (slots.exploreTag > 0) {
      const { data } = await db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("status", "published").neq("id", id)
        .neq("author_id", post.author_id || "__none__")
        .order("hot_score", { ascending: false }).limit(slots.exploreTag * 2);
      const items = (data || []) as PostCard[];
      const others = items.filter((p) => p.tag_id !== post.tag_id).slice(0, slots.exploreTag);
      results.exploreTag = others.map((p) => ({ ...p, reason: "探索发现" }));
    }

    // 模块 6：相似用户
    if (slots.simUsers > 0 && user?.id && post.tag_id) {
      const { data } = await db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("status", "published").neq("id", id)
        .neq("author_id", post.author_id || "__none__")
        .neq("tag_id", post.tag_id).order("hot_score", { ascending: false }).limit(slots.simUsers);
      const items = (data || []) as PostCard[];
      results.simUsers = items.map((p) => ({ ...p, reason: "同好也在看" }));
    }

    // 模块 7：编辑精选
    if (slots.editorPick > 0) {
      const { data } = await db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("status", "published").neq("id", id)
        .order("hot_score", { ascending: false }).limit(slots.editorPick);
      const items = (data || []) as PostCard[];
      results.editorPick = items.map((p) => ({ ...p, reason: "编辑精选" }));
    }

    // 记录已推荐
    const allIds = Object.values(results).flat().map((p) => p.id);
    if (allIds.length > 0) {
      recordSeen(sessionKey, allIds, config.dedup.maxHistorySize);
    }

    // 清理空模块
    const modules: Record<string, PostCard[]> = {};
    for (const [key, items] of Object.entries(results)) {
      if (items.length > 0) modules[key] = items;
    }

    return { post_id: id, modules, generated_at: new Date().toISOString() };
  });
}
