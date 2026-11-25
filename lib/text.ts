/**
 * 文本清洗工具：搜索结果、推荐理由、榜单副标题统一走这里，
 * 避免 Markdown 图片语法、裸链接、标题/引用符号直接漏到界面上。
 */

/** 把 Markdown / HTML 正文压成单行纯文本，可按字数截断并补省略号。 */
export function plainText(input: string | null | undefined, limit = 96) {
  const text = (input || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/[ \t]*\|[ \t]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}
