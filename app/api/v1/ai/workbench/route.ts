import { NextRequest } from "next/server";
import { ApiError, context, jsonBody, respond } from "@/lib/server/api";
import { markdownPreservationIssues } from "@/lib/markdown-preservation.mjs";
import { completeAiChat } from "@/lib/server/ai-provider";
import { requireFeature } from "@/lib/server/feature-flags";

export const runtime = "nodejs";
export const maxDuration = 30;

const modes = {
  title: { label: "标题建议", instruction: "给这篇内容提供 5 个简洁、真实、不标题党的中文标题。每行一个。" },
  outline: { label: "写作提纲", instruction: "根据作者提供的真实素材，整理一份清晰自然的中文写作提纲，包含开头、展开和收尾。不要虚构经历。" },
  polish: { label: "润色正文", instruction: "在不改变事实和原意的前提下润色中文正文，保留作者的个人语气，不添加不存在的信息。" },
  continue: { label: "内容续写", instruction: "沿用作者的语气和结构，接着现有正文继续写，不重复已有段落，不增加未经提供的事实。" },
  markdown: { label: "Markdown 优化", instruction: "只优化 Markdown 结构与排版，保持原意。必须逐字保留代码块及语言标识、表格中的数据、链接地址和图片地址；不得重写代码逻辑、删除结构或补造内容。" },
  topics: { label: "推荐话题", instruction: "推荐最多 5 个适合这篇内容的中文话题，每行一个，格式为 #话题。只返回话题。" },
} as const;

export async function POST(req: NextRequest) {
  return respond(async () => {
    await requireFeature("ai");
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const mode = body.mode as keyof typeof modes;
    if (!Object.hasOwn(modes, mode)) throw new ApiError(400, "创作模式无效");
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 6000) : "";
    const category = typeof body.category === "string" ? body.category.trim().slice(0, 40) : "生活";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
    if (!title && !content && !prompt) throw new ApiError(400, "先填写标题、正文或修改要求，再让 AI 帮你整理");
    const history = Array.isArray(body.messages) ? body.messages.slice(-8).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
      const text = item.content.trim().slice(0, 2400);
      return text ? [{ role: item.role, content: text } as { role: "user" | "assistant"; content: string }] : [];
    }) : [];
    const { data: allowed, error: quotaError } = await db.rpc("consume_ai_workbench_slot", { p_user_id: user!.id });
    if (quotaError) throw new ApiError(503, "AI 调用额度校验失败，请稍后重试");
    if (!allowed) throw new ApiError(429, "AI 请求太频繁了，请稍后再试；每分钟最多 4 次，每日最多 60 次");
    const result = await completeAiChat({
      purpose: mode === "markdown" ? "markdown" : mode === "title" ? "title" : "polish",
      // 推理模型会先消耗一轮推理 token；给足额度，避免正文被截成空字符串。
      maxTokens: mode === "markdown" ? 4000 : mode === "polish" ? 3000 : mode === "continue" ? 2000 : 1000,
      temperature: 0.7,
      messages: [
        { role: "system", content: `你是黑卡 HEIKA 的中文创作助手。${modes[mode].instruction}不输出英文解释，不要声称内容已发布。` },
        { role: "user", content: `当前草稿上下文（仅供理解，只有明确要求时才修改）：\n分类：${category}\n标题：${title || "（未填写）"}\n正文：${content || "（未填写）"}` },
        ...history,
        { role: "user", content: prompt || `请根据上面的当前草稿执行「${modes[mode].label}」。只返回结果。` },
      ],
    });
    const output = result.output;
    // 结构校验只做提示，不再 422 直接吞掉结果。
    // 旧逻辑里模型只要把 ```js 写成 ```javascript，整次优化就失败，用户看到的是“没有输出”。
    const preservationIssues = mode === "markdown" && content ? markdownPreservationIssues(content, output) : [];
    return {
      output,
      mode,
      warning: preservationIssues.length ? `已生成，但检测到${preservationIssues.join("、")}；替换前请核对代码块、链接与表格。` : undefined,
      preservationIssues,
      requestId: result.requestId,
      model: result.model,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, elapsedMs: result.elapsedMs },
    };
  });
}
