import { NextRequest } from "next/server";
import { ApiError, context, jsonBody, respond } from "@/lib/server/api";
import { readAiKey } from "@/lib/server/ai-secret";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const maxDuration = 30;

const modes = {
  title: { label: "标题建议", instruction: "给这篇内容提供 5 个简洁、真实、不标题党的中文标题。每行一个。" },
  outline: { label: "写作提纲", instruction: "根据作者提供的真实素材，整理一份清晰自然的中文写作提纲，包含开头、展开和收尾。不要虚构经历。" },
  polish: { label: "润色正文", instruction: "在不改变事实和原意的前提下润色中文正文，保留作者的个人语气，不添加不存在的信息。" },
  topics: { label: "推荐话题", instruction: "推荐最多 5 个适合这篇内容的中文话题，每行一个，格式为 #话题。只返回话题。" },
} as const;

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const body = await jsonBody(req);
    const mode = body.mode as keyof typeof modes;
    if (!Object.hasOwn(modes, mode)) throw new ApiError(400, "创作模式无效");
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 6000) : "";
    const category = typeof body.category === "string" ? body.category.trim().slice(0, 40) : "生活";
    if (!title && !content) throw new ApiError(400, "先填写标题或正文，再让 AI 帮你整理");
    const { data: allowed, error: quotaError } = await adminClient().rpc("consume_ai_workbench_slot", { p_user_id: user!.id });
    if (quotaError) throw new ApiError(503, "AI 服务暂时不可用，请稍后再试");
    if (!allowed) throw new ApiError(429, "AI 请求太频繁了，请稍后再试；每分钟最多 4 次，每日最多 60 次");
    const key = await readAiKey();
    if (!key) throw new ApiError(503, "AI 工作台尚未配置，请联系管理员设置 DeepSeek 密钥");
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.7,
        max_tokens: mode === "polish" ? 1200 : 700,
        messages: [
          { role: "system", content: `你是黑卡 HEIKA 的中文创作助手。${modes[mode].instruction}不输出英文解释，不要声称内容已发布。` },
          { role: "user", content: `分类：${category}\n标题：${title || "（未填写）"}\n正文：${content || "（未填写）"}` },
        ],
      }),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
    if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429 ? "AI 请求较多，请稍后再试" : "DeepSeek 暂时无法完成生成，请稍后重试");
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const output = result.choices?.[0]?.message?.content?.trim();
    if (!output) throw new ApiError(502, "AI 暂时没有返回内容，请再试一次");
    return { output, mode };
  });
}
