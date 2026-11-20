import { NextRequest } from "next/server";
import { ApiError, context, jsonBody, respond } from "@/lib/server/api";
import { completeAiChat } from "@/lib/server/ai-provider";
import { describeRoute, normalizeAiRoute, routeByRules, type ComposerRoute } from "@/lib/composer-routing";

export const runtime = "nodejs";
export const maxDuration = 20;

const SYSTEM = `你是黑卡 HEIKA 的发布向导。作者只写标题和正文，你负责判断这条内容应该发到哪个频道，以及属于哪种 AI 内容类型。

判断规则：
1. channel 只能是 "community" 或 "ai"。
   - "ai"：内容在讲 AI 工具、模型、提示词、智能体、技能、教程、部署、代码、API 配置，或提供可下载/可复用的 AI 资源。
   - "community"：生活记录、个人表达、情绪、旅行、摄影、读书、职场日常、观点杂谈等非技术内容。
   - 拿不准时选 "community"，社区的门槛更低，误投 AI 专区影响更大。
2. channel 为 "ai" 时，contentType 从以下选一个最贴切的：
   - "prompt"：以提示词模板、系统指令、咒语为主
   - "agent"：智能体、多智能体协作、自动化工作流
   - "skill"：技能包、插件能力、可安装的扩展
   - "tutorial"：手把手教程、部署实战、从零搭建
   - "ai_tool"：工具介绍、软件测评、方案对比
   - "knowledge_article"：AI 领域知识讲解，不属于以上任何一种
   channel 为 "community" 时 contentType 固定 "knowledge_article"。
3. category 必须从给出的候选分类里原样选择，不要自造新分类。没有合适的就选第一个。
4. reason 用一句不超过 40 字的中文说明依据，写给作者看，不要提到"模型""分类器"这类词。
5. confidence 是 0-1 的小数，表示你对自己的判断有多确定。

只返回 JSON，不要代码块、不要解释。`;

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req, false);
    const body = await jsonBody(req);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const content = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";
    const communityCategories = Array.isArray(body.communityCategories)
      ? body.communityCategories.filter((item): item is string => typeof item === "string").slice(0, 30)
      : [];
    const aiCategories = Array.isArray(body.aiCategories)
      ? body.aiCategories.filter((item): item is string => typeof item === "string").slice(0, 30)
      : [];

    const fallback = routeByRules({ title, body: content, communityCategories, aiCategories });
    if (!title && !content) return { route: fallback, source: "rule" as const };
    // 未登录时不消耗模型额度：本地规则足够给出合理去向，也避免匿名请求刷接口。
    if (!user) return { route: fallback, source: "rule" as const };

    const prompt = [
      `候选社区分类：${communityCategories.join("、") || "（暂无）"}`,
      `候选 AI 分类：${aiCategories.join("、") || "（暂无）"}`,
      `标题：${title || "（未填写）"}`,
      `正文：${content.slice(0, 6000) || "（未填写）"}`,
      `本地规则的初判是「${describeRoute(fallback)}」，如果你判断一致可以直接沿用，不一致请给出你的理由。`,
      `返回格式：{"channel":"community|ai","contentType":"...","category":"...","confidence":0.0,"reason":"..."}`,
    ].join("\n");

    try {
      const result = await completeAiChat({
        purpose: "classification",
        maxTokens: 300,
        temperature: 0.2,
        jsonObject: true,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      });
      const parsed = JSON.parse(result.output.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
      const route: ComposerRoute = normalizeAiRoute(parsed, fallback, { title, body: content, communityCategories, aiCategories });
      return { route, source: route.source, model: result.model, requestId: result.requestId };
    } catch (error) {
      // 模型不可用、额度用尽、返回不是 JSON —— 都不该让作者卡在发布页。
      if (error instanceof ApiError && error.status === 401) throw error;
      return { route: fallback, source: "rule" as const, degraded: true };
    }
  });
}
