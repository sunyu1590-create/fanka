"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export default function PostAISummary({ postId }: { postId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSummary(null);
    void fetch(`/api/v1/posts/${encodeURIComponent(postId)}/summary`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => { if (active) setSummary(typeof result?.data?.summary === "string" ? result.data.summary : null); })
      .catch(() => { if (active) setSummary(null); });
    return () => { active = false; };
  }, [postId]);
  if (!summary) return null;
  return <aside className="post-ai-summary" aria-label="AI 生成摘要"><span><Sparkles size={13}/> AI 摘要</span><p>{summary}</p></aside>;
}
