import type { ElementType, ReactNode } from "react";

/** 站外链接一律先过风险提示页，用户确认后再跳转。 */
export function guardedHref(href: string) {
  if (!/^https?:/i.test(href)) return href;
  return `/link-warning?u=${encodeURIComponent(href)}`;
}

function safeHref(value: string) {
  const trimmed = value.trim();
  if (/[\u0000-\u001f\\]/.test(trimmed)) return null;
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed) && !trimmed.startsWith("//")) return trimmed;
  return null;
}

/**
 * 裸链接识别：用户不必手动加 https:// 或中括号，正文里写到域名就能被识别。
 *
 * 只认「带协议 / 带 www / 带路径的域名 / 常见顶级域」，避免把 1.5、文件名之类的
 * 普通文本误判成链接；结尾的标点会被剔除，保证括号里的链接也能点准。
 */
const BARE_URL = /((?:https?:\/\/|www\.)[^\s<>"'`）)，。；！？、]+|(?<![\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|cn|net|org|io|co|me|app|dev|ai|shop|top|xyz|cc|tv|info|biz|live|site|online|store|club|design|art|blog|tech|link|pro|fun|wiki|space|website|today|world|life|news|moe|ink|page|tools|run|build|codes|cloud|dev)(?:\/[^\s<>"'`）)，。；！？、]*)?)/gi;

const TRAILING = /[.,;:!?。，；：！？、)）\]】}>"']+$/;

function trimUrl(value: string) {
  return value.replace(TRAILING, "");
}

function normalizeUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

/** 话题：正文里的 #话题 高亮显示，不参与审核。 */
const TOPIC_TAG = /(^|[\s（(【[>])(#[\p{L}\p{N}_]{1,24})/gu;

/** 把普通文本切成 文本 / 链接 / 话题 三种节点。 */
function autoRichText(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const parts: ReactNode[] = [];
  let cursor = 0;
  let seq = 0;
  for (const match of text.matchAll(BARE_URL)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > cursor) parts.push(...topicNodes(text.slice(cursor, start), `${keyPrefix}-t${seq++}`));
    const url = trimUrl(raw);
    if (!url) { parts.push(...topicNodes(raw, `${keyPrefix}-t${seq++}`)); cursor = start + raw.length; continue; }
    const href = normalizeUrl(url);
    parts.push(
      <a key={`${keyPrefix}-u${seq++}`} className="md-autolink" href={guardedHref(href)} rel="nofollow noopener noreferrer" target="_blank">
        {url}
      </a>,
    );
    if (url.length < raw.length) parts.push(raw.slice(url.length));
    cursor = start + raw.length;
  }
  if (cursor < text.length) parts.push(...topicNodes(text.slice(cursor), `${keyPrefix}-t${seq++}`));
  return parts;
}

function topicNodes(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const parts: ReactNode[] = [];
  let cursor = 0;
  let seq = 0;
  for (const match of text.matchAll(TOPIC_TAG)) {
    const prefix = match[1];
    const tag = match[2];
    const start = (match.index ?? 0) + prefix.length;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<span key={`${keyPrefix}-h${seq++}`} className="md-topic">{tag}</span>);
    cursor = start + tag.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function markdownToText(source: string) {
  return source.replace(/```[\s\S]*?```/g, " ").replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*>\s?/gm, "").replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*\d+[.)]\s+/gm, "").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
}

function inline(text: string): ReactNode[] {
  const pattern = /(!\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(...autoRichText(text.slice(cursor, index), `pre-${index}`));
    const token = match[0];
    if (token.startsWith("![")) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const src = image && safeHref(image[2]);
      nodes.push(src ? <img key={index} src={src} alt={image?.[1] || ""} loading="lazy" decoding="async"/> : image?.[1] || token);
    }
    else if (token.startsWith("`")) nodes.push(<code key={index}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<del key={index}>{token.slice(2, -2)}</del>);
    else if (token.startsWith("*")) nodes.push(<em key={index}>{token.slice(1, -1)}</em>);
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link && safeHref(link[2]);
      nodes.push(href ? <a key={index} href={guardedHref(href)} rel={href.startsWith("http") ? "nofollow noopener noreferrer" : undefined}>{link?.[1]}</a> : link?.[1] || token);
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) nodes.push(...autoRichText(text.slice(cursor), `tail-${cursor}`));
  return nodes;
}

function isBlockStart(line: string) {
  return /^(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```|\s*---+\s*$)/.test(line);
}

export function MarkdownContent({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      const code: string[] = []; index++;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={`code-${index}`}><code className={fence[1] ? `language-${fence[1]}` : undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2]);
      const Tag = `h${level}` as ElementType;
      blocks.push(<Tag key={`heading-${index}`}>{content}</Tag>); index++; continue;
    }
    if (/^\s*---+\s*$/.test(line)) { blocks.push(<hr key={`rule-${index}`} />); index++; continue; }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((item, i) => <p key={i}>{inline(item)}</p>)}</blockquote>); continue;
    }
    const listItem = line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      const ordered = /^\d/.test(listItem[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]); index++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</List>); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((item, i) => <span key={i}>{i > 0 && <br/>}{inline(item)}</span>)}</p>);
  }
  return <div className={className ? `markdown-content ${className}` : "markdown-content"}>{blocks}</div>;
}
