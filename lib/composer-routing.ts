import type { AiContentType } from "./ai-resources";

export type ComposerChannel = "community" | "ai";

export type ComposerRoute = {
  channel: ComposerChannel;
  contentType: AiContentType;
  category: string;
  confidence: number;
  reason: string;
  source: "ai" | "rule";
};

export const AI_CONTENT_TYPE_LABELS: Record<AiContentType, string> = {
  knowledge_article: "AI 知识文章",
  agent: "Agent 智能体",
  skill: "Skills 技能",
  prompt: "Prompt 提示词",
  ai_tool: "AI 工具",
  tutorial: "实战教程",
};

/** AI 内容类型的判定优先级：越靠前越具体，命中即采用。 */
const CONTENT_TYPE_SIGNALS: Array<{ type: AiContentType; words: RegExp; reason: string }> = [
  { type: "prompt", words: /提示词|咒语|prompt\s*(模板|大全|合集|工程)|系统指令/i, reason: "正文围绕提示词写法或模板" },
  { type: "agent", words: /智能体|agent\b|多智能体|自动化流程|工作流编排|机器人助手/i, reason: "内容描述智能体或自动化流程" },
  { type: "skill", words: /skills?\b|技能包|插件能力|扩展能力|自定义技能/i, reason: "内容围绕技能或插件能力" },
  { type: "tutorial", words: /教程|实战|手把手|入门|搭建|部署|配置指南|从零开始|保姆级/i, reason: "内容以步骤教学为主" },
  { type: "ai_tool", words: /工具|软件|应用|网站|平台|客户端|插件|替代方案|测评|对比/i, reason: "内容在介绍或评测工具" },
];

/** 判定「这是 AI 内容」的强信号，命中越多越确信。 */
const AI_STRONG_SIGNALS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /```/, label: "包含代码块" },
  { pattern: /\b(npm|pnpm|yarn)\s+(i|install|add)\b/i, label: "包含安装命令" },
  { pattern: /\bpip3?\s+install\b|\bconda\s+install\b|\bbrew\s+install\b|\bapt(-get)?\s+install\b/i, label: "包含安装命令" },
  { pattern: /\bdocker\s+(run|compose|pull)\b|\bgit\s+clone\b/i, label: "包含部署或拉取命令" },
  { pattern: /\bAPI\s*(Key|密钥)|\btoken\b|\bSDK\b|\bendpoint\b|\bJSON\b/i, label: "涉及接口或密钥配置" },
  { pattern: /\b(GPT|DeepSeek|Claude|Gemini|Llama|Qwen|Stable\s*Diffusion|Midjourney|ComfyUI|Ollama|LangChain|Dify|n8n|Cursor|Copilot)\b/i, label: "提到具体模型或 AI 产品" },
  { pattern: /模型|推理|微调|向量|embedding|RAG|上下文窗口|参数规模|算力|显存/i, label: "使用 AI 领域术语" },
  { pattern: /提示词|智能体|大模型|AI\s*(工具|写作|绘画|视频|编程|助手)|人工智能/i, label: "主题围绕 AI" },
  { pattern: /https?:\/\/(github\.com|huggingface\.co|modelscope\.cn)/i, label: "附有代码仓库或模型地址" },
];

const COMMUNITY_HINTS = /生活|日常|心情|旅行|美食|咖啡|摄影|读书|电影|音乐|穿搭|健身|工作|职场|朋友|家人|城市|季节|回忆|散步|周末|随手拍/i;

function countMatches(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (text.match(new RegExp(pattern.source, flags)) || []).length;
}

function pickAiContentType(text: string): { type: AiContentType; reason: string } {
  for (const signal of CONTENT_TYPE_SIGNALS) {
    if (signal.words.test(text)) return { type: signal.type, reason: signal.reason };
  }
  return { type: "knowledge_article", reason: "以知识讲解为主，按标准图文文章发布" };
}

export type RuleRouteInput = {
  title: string;
  body: string;
  communityCategories?: string[];
  aiCategories?: string[];
};

/**
 * 本地规则判断：没有 AI 密钥、未登录或请求失败时使用。
 * 目标不是替代模型，而是保证发布页永远有一个合理去向，不会卡住流程。
 */
export function routeByRules(input: RuleRouteInput): ComposerRoute {
  const title = (input.title || "").trim();
  const body = (input.body || "").trim();
  const text = `${title}\n${body}`;
  const hits = AI_STRONG_SIGNALS.filter((signal) => signal.pattern.test(text));
  const codeBlocks = countMatches(body, /```/g) / 2;
  const communityHits = countMatches(text, COMMUNITY_HINTS);
  const titleIsTool = /工具|教程|提示词|智能体|模型|插件|部署|API|Agent|Prompt/i.test(title);

  let score = hits.length * 22 + Math.min(codeBlocks, 3) * 10 + (titleIsTool ? 16 : 0) - communityHits * 12;
  // 没有标题、正文又很短时，保持社区默认，避免新用户凭空被丢进 AI 专区。
  if (text.length < 24) score -= 20;
  const isAi = score >= 34;

  if (!isAi) {
    const categories = input.communityCategories?.filter(Boolean) || [];
    const matched = categories.find((name) => name !== "全部" && text.includes(name));
    return {
      channel: "community",
      contentType: "knowledge_article",
      category: matched || categories[0] || "生活",
      confidence: Math.min(0.92, 0.5 + Math.max(0, -score) / 120),
      reason: communityHits > 0 ? "以生活记录和个人表达为主，投到社区精选" : "未发现 AI 主题信号，投到社区精选",
      source: "rule",
    };
  }

  const { type, reason } = pickAiContentType(text);
  const aiCategories = input.aiCategories?.filter(Boolean) || [];
  const category = aiCategories.find((name) => text.includes(name)) || aiCategories[0] || "AI 知识";
  return {
    channel: "ai",
    contentType: type,
    category,
    confidence: Math.min(0.95, 0.55 + score / 200),
    reason: `${hits[0]?.label || "内容主题偏 AI"}，${reason}`,
    source: "rule",
  };
}

const ALLOWED_TYPES: AiContentType[] = ["knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial"];

/** 校验模型返回的结构，任何一项不可信就整体回退到规则结果。 */
export function normalizeAiRoute(raw: unknown, fallback: ComposerRoute, input: RuleRouteInput): ComposerRoute {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Record<string, unknown>;
  const channel = value.channel === "ai" ? "ai" : value.channel === "community" ? "community" : null;
  if (!channel) return fallback;
  const contentType = ALLOWED_TYPES.includes(value.contentType as AiContentType) ? (value.contentType as AiContentType) : fallback.contentType;
  const categories = channel === "ai" ? input.aiCategories || [] : input.communityCategories || [];
  const category = typeof value.category === "string" && categories.includes(value.category) ? value.category : fallback.category;
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.min(0.99, Math.max(0.3, value.confidence)) : Math.max(fallback.confidence, 0.7);
  const reason = typeof value.reason === "string" && value.reason.trim() ? value.reason.trim().slice(0, 90) : fallback.reason;
  return {
    channel,
    // 社区内容没有 AI 类型，统一按普通文章处理，避免脏数据进入审核队列。
    contentType: channel === "ai" ? contentType : "knowledge_article",
    category,
    confidence,
    reason,
    source: "ai",
  };
}

export function describeRoute(route: ComposerRoute) {
  if (route.channel === "community") return `社区精选 · ${route.category}`;
  return `AI 空间 · ${AI_CONTENT_TYPE_LABELS[route.contentType]}`;
}

/** 话题建议：从已有话题里挑出与正文真正相关的，宁缺毋滥，不硬凑数量。 */
export function pickTopicsByRules(text: string, candidates: string[]): string[] {
  const content = (text || "").trim();
  if (!content || !candidates.length) return [];
  const scored = candidates.map((name) => {
    const clean = name.trim();
    if (!clean) return { name, score: 0 };
    let score = 0;
    if (content.includes(clean)) score += 10;
    // 两字以上的话题按字符二元组与正文重合度打分，避免单字误命中。
    if (clean.length >= 2) {
      for (let i = 0; i + 1 < clean.length; i += 1) {
        if (content.includes(clean.slice(i, i + 2))) score += 2;
      }
    }
    return { name: clean, score };
  });
  return scored
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.name)
    .slice(0, 5);
}

/** 校验模型给的话题建议：只保留候选列表里的名字，去重、限量。 */
export function normalizeTopicSuggestions(raw: unknown, candidates: string[], fallback: string[] = []): string[] {
  const allowed = new Set(candidates.map((name) => name.trim()).filter(Boolean));
  const picked = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => allowed.has(item))
    : [];
  const merged = [...new Set([...picked, ...fallback])];
  return merged.slice(0, 5);
}
