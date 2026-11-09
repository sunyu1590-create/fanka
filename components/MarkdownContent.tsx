import type { ElementType, ReactNode } from "react";

function safeHref(value: string) {
  const trimmed = value.trim();
  if (/[\u0000-\u001f\\]/.test(trimmed)) return null;
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed) && !trimmed.startsWith("//")) return trimmed;
  return null;
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
    if (index > cursor) nodes.push(text.slice(cursor, index));
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
      nodes.push(href ? <a key={index} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer noopener" : undefined}>{link?.[1]}</a> : link?.[1] || token);
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
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
