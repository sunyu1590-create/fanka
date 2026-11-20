export const AI_CONTENT_TYPES = ["knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial"] as const;
export type AiContentType = typeof AI_CONTENT_TYPES[number];
export type AiResourceData = Record<string, unknown>;

/**
 * 发布时不再要求填写任何「资源信息」字段。
 * 这里只做两件事：把用户可能遗留的字段收敛成安全结构，以及校验外部链接。
 * 附件仍然通过 resource_data.attachments 保存，与本次取消的字段无关。
 */

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
  // 取消资源信息后，任何内容类型都允许只发标题与正文。
  // 只有用户确实提交了旧字段（编辑历史作品）时才做格式与链接安全校验。
  void contentType;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const data = value as Record<string, unknown>;
  const normalized: AiResourceData = {};
  for (const [key, entry] of Object.entries(data)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
    if (typeof entry === "string") {
      const text = entry.trim();
      if (text.length > 12000) return { error: "单项资源内容不能超过 12000 字" } as const;
      if (text) normalized[key] = text;
    } else if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) {
      const items = entry.map((item) => item.trim()).filter(Boolean);
      if (items.length > 40 || items.some((item) => item.length > 1200)) return { error: "资源列表项目过多或过长" } as const;
      if (items.length) normalized[key] = items;
    }
  }
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
