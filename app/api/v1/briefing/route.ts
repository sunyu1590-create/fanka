/**
 * 桌面右侧简报 API：按分类+时间窗口聚合精选内容，提供轻量每日阅读清单。
 * 输出格式：{ sections: [{ label, icon, items: PostCard[] }], generated_at, rotate_hours }
 */
import { NextRequest } from "next/server";
import { context, respond } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/distribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BriefingPost {
  id: string;
  title: string;
  excerpt: string;
  cover: string | null;
  channel: string;
  kind: string;
  tag_id: number;
  author_id: string;
  created_at: string;
  hot_score: number;
}

const SECTION_DEFS = [
  { key: "recommended", label: "今日精选", icon: "Sparkles", channel: null, sort: "hot" },
  { key: "ai", label: "AI 前沿", icon: "Wand2", channel: "ai", sort: "hot" },
  { key: "fresh", label: "新鲜出炉", icon: "Clock", channel: null, sort: "fresh" },
  { key: "rising", label: "正在上升", icon: "TrendingUp", channel: null, sort: "rising" },
];

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await context(req, false);
    const config = (await loadConfig(db)).config;
    const perSection = config.briefing.postsPerSection;

    if (!config.briefing.enabled) {
      return { enabled: false, sections: [], generated_at: new Date().toISOString() };
    }

    const now = new Date().toISOString();
    const freshSince = new Date(Date.now() - 72 * 3600_000).toISOString();

    const sections: { key: string; label: string; icon: string; items: BriefingPost[] }[] = [];

    for (const sec of SECTION_DEFS) {
      let query = db.from("posts")
        .select("id,title,excerpt,cover,channel,kind,tag_id,author_id,created_at,hot_score")
        .eq("status", "published");

      if (sec.channel) query = query.eq("channel", sec.channel);
      if (sec.sort === "fresh") {
        query = query.gte("created_at", freshSince).order("created_at", { ascending: false });
      } else if (sec.sort === "rising") {
        query = query.gte("created_at", freshSince).order("hot_score", { ascending: false });
      } else {
        query = query.order("hot_score", { ascending: false });
      }

      const { data, error } = await query.limit(perSection);
      if (!error && data) {
        sections.push({ key: sec.key, label: sec.label, icon: sec.icon, items: data as BriefingPost[] });
      }
    }

    return {
      enabled: true,
      sections,
      rotate_hours: config.briefing.rotateHours,
      generated_at: now,
    };
  });
}
