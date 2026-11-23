/**
 * 剪贴板文本清洗与富文本转换。
 *
 * 网页端正文是 Markdown 文本域，从网页 / Word / Notion 复制过来的内容会带
 * 大量不可见字符、硬换行和零宽空格；直接粘进去会变成一坨没有结构的文字。
 * 这里做两件事：
 * 1. 纯文本清洗：统一换行、去掉零宽与 BOM、压缩连续空行、去行尾空格；
 * 2. 富文本降级：把常见 HTML 结构转成等价 Markdown（标题、列表、引用、加粗、链接、代码），
 *    让网页端与 APP 端粘贴后的正文结构一致，而不是退化成一段平文。
 *
 * 只保留 http/https 链接与图片，其余协议（javascript:、data: 等）一律丢弃，
 * 避免把不可信内容带进正文。
 */

const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g;

/** 清洗纯文本：只做不改语义的整理。 */
export function sanitizePastedText(input: string): string {
  const normalized = String(input || "")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/\u00a0/g, " ");
  const lines = normalized.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}

/** 只放行 http/https，其余协议（javascript:、data:、blob:）一律丢弃。 */
function safeUrl(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}

function inlineText(node: Node): string {
  if (node.nodeType === 3) return (node.textContent || "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const element = node as HTMLElement;
  const tag = element.tagName;
  const inner = () => Array.from(element.childNodes).map(inlineText).join("");
  switch (tag) {
    case "BR": return "\n";
    case "STRONG": case "B": {
      const text = inner().trim();
      return text ? `**${text}**` : "";
    }
    case "EM": case "I": {
      const text = inner().trim();
      return text ? `*${text}*` : "";
    }
    case "DEL": case "S": {
      const text = inner().trim();
      return text ? `~~${text}~~` : "";
    }
    case "CODE": {
      const text = element.textContent || "";
      return text ? `\`${text.replace(/`/g, "")}\`` : "";
    }
    case "A": {
      const text = inner().trim() || element.getAttribute("href") || "";
      const href = safeUrl(element.getAttribute("href"));
      return href ? `[${text}](${href})` : text;
    }
    case "IMG": {
      const src = safeUrl(element.getAttribute("src"));
      return src ? `![${(element.getAttribute("alt") || "").trim()}](${src})` : "";
    }
    default: return inner();
  }
}

function blockText(node: Node, depth = 0): string {
  if (node.nodeType === 3) return (node.textContent || "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const element = node as HTMLElement;
  const tag = element.tagName;
  const children = () => Array.from(element.childNodes).map((child) => blockText(child, depth)).join("");

  if (/^H[1-6]$/.test(tag)) {
    const text = inlineText(element).trim();
    return text ? `\n\n${"#".repeat(Number(tag[1]))} ${text}\n\n` : "";
  }
  switch (tag) {
    case "P": case "DIV": case "SECTION": case "ARTICLE": case "FIGURE": {
      const text = inlineText(element).trim();
      return text ? `\n\n${text}\n\n` : "";
    }
    case "BR": return "\n";
    case "HR": return "\n\n---\n\n";
    case "UL": case "OL": {
      const items = Array.from(element.children).filter((child) => child.tagName === "LI");
      const lines = items.map((item, index) => {
        const text = blockText(item, depth + 1).trim().replace(/\n+/g, " ");
        const marker = tag === "OL" ? `${index + 1}.` : "-";
        return `${"  ".repeat(depth)}${marker} ${text}`;
      });
      return `\n\n${lines.join("\n")}\n\n`;
    }
    case "LI": {
      const text = inlineText(element).trim();
      return text ? `- ${text}\n` : "";
    }
    case "BLOCKQUOTE": {
      const text = blockText(element, depth).trim();
      if (!text) return "";
      return `\n\n${text.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    }
    case "PRE": {
      const code = (element.textContent || "").replace(/\n+$/, "");
      if (!code.trim()) return "";
      const language = /language-([\w-]+)/.exec(element.className)?.[1] || "";
      return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    }
    case "TABLE": {
      const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
        Array.from(row.querySelectorAll("th,td")).map((cell) => inlineText(cell).trim().replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const header = rows[0];
      const divider = header.map(() => "---");
      const body = rows.slice(1);
      return `\n\n${[header, divider, ...body].map((cells) => `| ${cells.join(" | ")} |`).join("\n")}\n\n`;
    }
    default: return children();
  }
}

/** HTML → Markdown。没有 DOM 环境（服务端）时直接返回空串，调用方退回纯文本。 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof document === "undefined") return "";
  const holder = document.createElement("div");
  holder.innerHTML = html;
  // 脚本、样式、注释对正文没有意义，先摘掉再遍历。
  holder.querySelectorAll("script,style,noscript,meta,link").forEach((node) => node.remove());
  return sanitizePastedText(blockText(holder));
}

/**
 * 决定粘贴内容用哪一份：富文本转换结果有结构就优先，否则退回清洗后的纯文本。
 * 判断标准是「转换后仍有 Markdown 结构标记」，避免把一句话的 HTML 包一层空行。
 */
export function resolvePastedText(plain: string, html: string): string {
  const cleanPlain = sanitizePastedText(plain);
  if (!html) return cleanPlain;
  const markdown = htmlToMarkdown(html);
  if (!markdown.trim()) return cleanPlain;
  const hasStructure = /(^|\n)(#{1,6} |[-*] |\d+\. |> |```|\| )|(\*\*|\[[^\]]+\]\(https?:)/.test(markdown);
  if (!hasStructure) return cleanPlain || markdown;
  // 转换结果明显缩水说明解析失败，宁可退回纯文本也不要丢内容。
  if (cleanPlain && markdown.replace(/\s/g, "").length < cleanPlain.replace(/\s/g, "").length * 0.5) return cleanPlain;
  return markdown;
}
