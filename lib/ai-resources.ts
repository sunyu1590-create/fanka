export const AI_CONTENT_TYPES = ["knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial"] as const;
export type AiContentType = typeof AI_CONTENT_TYPES[number];
export type AiResourceData = Record<string, unknown>;

const resourceRequirements: Partial<Record<AiContentType, string[]>> = {
  agent: ["functionality", "platforms", "run_mode", "source_url", "version"],
  skill: ["functionality", "environments", "installation", "version", "source_url"],
  prompt: ["model", "scenario", "prompt"],
  ai_tool: ["functionality", "platforms", "source_url"],
  tutorial: ["difficulty", "requirements", "steps"],
};

function isSafeExternalUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (host.includes(":") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\d+$/.test(host) || /^0x[\da-f]+$/i.test(host)) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|::ffff:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i.test(host)) return false;
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    return port === 80 || port === 443;
  } catch {
    return false;
  }
}

export function validateAiResourceData(contentType: AiContentType, value: unknown) {
  if (contentType === "knowledge_article") return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "请填写 AI 资源的结构化信息" } as const;
  const data = value as Record<string, unknown>;
  const normalized: AiResourceData = {};
  for (const [key, entry] of Object.entries(data)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
    if (typeof entry === "string") {
      const text = entry.trim();
      if (text.length > 12000) return { error: "单项资源内容不能超过 12000 字" } as const;
      normalized[key] = text;
    } else if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) {
      const items = entry.map((item) => item.trim()).filter(Boolean);
      if (items.length > 40 || items.some((item) => item.length > 1200)) return { error: "资源列表项目过多或过长" } as const;
      normalized[key] = items;
    }
  }
  const missing = (resourceRequirements[contentType] || []).filter((key) => {
    const entry = normalized[key];
    return typeof entry !== "string" || !entry.trim();
  });
  if (missing.length) return { error: "请补全此类资源的必填字段" } as const;
  for (const [key, entry] of Object.entries(normalized)) {
    if (key.endsWith("_url") && typeof entry === "string" && entry && !isSafeExternalUrl(entry)) {
      return { error: "外部链接仅支持公开的 HTTP/HTTPS 地址，不能包含账号密码或内网地址" } as const;
    }
  }
  return normalized;
}

export function safeResourceLink(value: unknown) {
  return typeof value === "string" && isSafeExternalUrl(value) ? value.trim() : "";
}
