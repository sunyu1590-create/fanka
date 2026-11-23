"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * 详情页的 AI 摘要：内联在标题与作者之间，不再是一张独立卡片。
 * 摘要本身不触发模型调用——数据由 /api/v1/posts/:id/summary 读取，命中缓存时直接返回。
 */
export default function PostAISummary({ postId }: { postId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    setSummary(null);
    setExpanded(false);
    void fetch(`/api/v1/posts/${encodeURIComponent(postId)}/summary`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => { if (active) setSummary(typeof result?.data?.summary === "string" ? result.data.summary : null); })
      .catch(() => { if (active) setSummary(null); });
    return () => { active = false; };
  }, [postId]);
  if (!summary) return null;
  const collapsible = summary.length > 96;
  return (
    <aside className="post-ai-summary" data-expanded={expanded || !collapsible} aria-label="AI 生成摘要">
      <button
        type="button"
        className="post-ai-summary-head"
        onClick={() => { if (collapsible) setExpanded((value) => !value); }}
        aria-expanded={collapsible ? expanded : undefined}
        disabled={!collapsible}
      >
        <Sparkles size={12} aria-hidden="true" />
        <span>AI 摘要</span>
        {collapsible && <small>{expanded ? "收起" : "展开"}</small>}
      </button>
      <p>{summary}</p>
    </aside>
  );
}
