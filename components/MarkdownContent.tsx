"use client";

import { useEffect, useId, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";

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
const BARE_URL = /((?:https?:\/\/|www\.)[^\s<>"'`）)，。；！？、]+|(?<![\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|cn|net|org|io|co|me|app|dev|ai|shop|top|xyz|cc|tv|info|biz|live|site|online|store|club|design|art|blog|tech|link|pro|fun|wiki|space|website|today|world|life|news|moe|ink|page|tools|run|build|codes|cloud)(?:\/[^\s<>"'`）)，。；！？、]*)?)/gi;

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
  return source.replace(/```[\s\S]*?```/g, " ").replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*>\s?/gm, "").replace(/^\s*\|.*\|\s*$/gm, "").replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, "").replace(/^\s*\d+[.)]\s+/gm, "").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
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
  return /^(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```|\||\s*---+\s*$)/.test(line);
}

/* ---------- 代码块：语言标识 + 复制 ---------- */

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return <div className="md-code">
    <div className="md-code-head">
      <span>{language || "text"}</span>
      <button type="button" onClick={() => void copy()}>{copied ? "已复制" : "复制"}</button>
    </div>
    <pre><code className={language ? `language-${language}` : undefined}>{code}</code></pre>
  </div>;
}

/* ---------- 流程图：mermaid（按需从 CDN 加载，避免拖慢首屏） ---------- */

type MermaidApi = { initialize: (config: Record<string, unknown>) => void; render: (id: string, code: string) => Promise<{ svg: string }> };

async function loadMermaid(): Promise<MermaidApi> {
  const dynamicImport = new Function("url", "return import(url)") as (url: string) => Promise<{ default?: MermaidApi } & MermaidApi>;
  const loaded = await dynamicImport("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
  return (loaded.default ?? loaded) as MermaidApi;
}

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        const dark = document.documentElement.dataset.theme === "dark" || document.body.classList.contains("theme-dark");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "neutral",
          fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
          // 关掉 HTML 标签：foreignObject 在窄容器里会被缩放，连线上的「是/否」会被裁掉。
          flowchart: { htmlLabels: false, useMaxWidth: false },
        });
        const result = await mermaid.render(`mmd${id}`, code);
        if (!cancelled) setSvg(result.svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code, id]);

  if (svg) return <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
  return <div className="md-mermaid is-pending">
    <div className="md-mermaid-head"><span>流程图</span><small>{failed ? "渲染失败，已按源码显示" : "正在渲染…"}</small></div>
    <pre><code>{code}</code></pre>
  </div>;
}

/* ---------- 表格 ---------- */

function splitRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function alignments(line: string) {
  return splitRow(line).map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : undefined);
}

/* ---------- 正文 ---------- */

export function MarkdownContent({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const out: ReactNode[] = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }

      const fence = line.match(/^```\s*([\w+-]*)\s*$/);
      if (fence) {
        const language = (fence[1] || "").toLowerCase();
        const code: string[] = []; index++;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
        if (index < lines.length) index++;
        const body = code.join("\n");
        out.push(language === "mermaid"
          ? <MermaidBlock key={`mmd-${index}`} code={body} />
          : <CodeBlock key={`code-${index}`} code={body} language={language} />);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        const Tag = `h${level}` as ElementType;
        out.push(<Tag key={`heading-${index}`}>{inline(heading[2])}</Tag>);
        index++;
        continue;
      }

      if (/^\s*---+\s*$/.test(line)) { out.push(<hr key={`rule-${index}`} />); index++; continue; }

      // 表格：表头 + 分隔行
      if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
        const header = splitRow(line);
        const aligns = alignments(lines[index + 1]);
        index += 2;
        const rows: string[][] = [];
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
          rows.push(splitRow(lines[index++]));
        }
        out.push(<div className="md-table-wrap" key={`table-${index}`}>
          <table className="md-table">
            <thead><tr>{header.map((cell, i) => <th key={i} style={{ textAlign: aligns[i] }}>{inline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, r) => <tr key={r}>{header.map((_, c) => <td key={c} style={{ textAlign: aligns[c] }}>{inline(row[c] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>);
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quote: string[] = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
        out.push(<blockquote key={`quote-${index}`}>{quote.map((item, i) => <p key={i}>{inline(item)}</p>)}</blockquote>);
        continue;
      }

      const listItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
      if (listItem) {
        const ordered = /^\d/.test(listItem[2]);
        const items: { text: string; depth: number; task?: boolean; checked?: boolean }[] = [];
        while (index < lines.length) {
          const item = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
          if (!item || /^\d/.test(item[2]) !== ordered) break;
          const depth = Math.min(2, Math.floor(item[1].replace(/\t/g, "  ").length / 2));
          const task = /^\[([ xX])\]\s+/.exec(item[3]);
          items.push({
            depth,
            text: task ? item[3].replace(/^\[([ xX])\]\s+/, "") : item[3],
            task: Boolean(task),
            checked: task ? task[1].toLowerCase() === "x" : false,
          });
          index++;
        }
        const List = ordered ? "ol" : "ul";
        out.push(<List key={`list-${index}`} className={items.some((item) => item.task) ? "md-task-list" : undefined}>
          {items.map((item, i) => <li key={i} className={item.task ? "md-task" : undefined} style={{ marginLeft: item.depth * 18 }}>
            {item.task && <input type="checkbox" checked={item.checked} readOnly aria-label={item.checked ? "已完成" : "未完成"} />}
            {inline(item.text)}
          </li>)}
        </List>);
        continue;
      }

      const paragraph = [line]; index++;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
      out.push(<p key={`paragraph-${index}`}>{paragraph.map((item, i) => <span key={i}>{i > 0 && <br/>}{inline(item)}</span>)}</p>);
    }
    return out;
  }, [source]);

  return <div className={className ? `markdown-content ${className}` : "markdown-content"}>{blocks}</div>;
}
