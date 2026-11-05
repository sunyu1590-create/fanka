"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Flag, History, Link2 } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { safeResourceLink } from "@/lib/ai-resources";

type Version = { id: string; version_label: string; changelog: string; created_at: string };
type Props = { postId: string; contentType: string; resourceData: Record<string, unknown>; accountId: string | null; onLogin: () => void; onNotice: (message: string) => void };

const labels: Record<string, string> = {
  functionality: "功能说明", platforms: "兼容平台", run_mode: "运行方式", use_cases: "适用场景", tutorial: "使用教程",
  environments: "兼容环境", installation: "安装步骤", configuration: "配置内容", example: "使用示例", model: "适用模型",
  scenario: "应用场景", prompt: "完整提示词", variables: "可替换变量", pricing: "价格信息", difficulty: "难度", requirements: "准备条件", steps: "实战步骤",
  source_url: "资源来源", changelog: "更新记录", version: "版本",
};
const copyableKeys = new Set(["prompt", "installation", "configuration", "steps", "example", "tutorial"]);

export default function AIResourceDetails({ postId, contentType, resourceData, accountId, onLogin, onNotice }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [feedbackKind, setFeedbackKind] = useState("broken_link");
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const fields = useMemo(() => Object.entries(resourceData || {}).filter(([, value]) => (typeof value === "string" && value.trim()) || (Array.isArray(value) && value.length)), [resourceData]);

  useEffect(() => {
    let active = true;
    void cloudFetch(`/api/v1/ai-space/${postId}/versions`, { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (active && Array.isArray(result.data?.items)) setVersions(result.data.items as Version[]);
    }).catch(() => {});
    return () => { active = false; };
  }, [postId]);

  const copy = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopiedKey(key); onNotice("已复制到剪贴板"); window.setTimeout(() => setCopiedKey(""), 1600); }
    catch { onNotice("复制失败，请检查浏览器剪贴板权限"); }
  };
  const sendFeedback = async () => {
    if (!accountId) { onLogin(); return; }
    if (feedback.trim().length < 3) { onNotice("请补充至少 3 个字的说明"); return; }
    setSending(true);
    try {
      await cloudRequest(`/api/v1/ai-space/${postId}/feedback`, { kind: feedbackKind, details: feedback.trim() });
      setFeedback(""); onNotice("反馈已提交，管理员会尽快核查");
    } catch (error) { onNotice(error instanceof Error ? error.message : "反馈提交失败"); }
    finally { setSending(false); }
  };

  if (contentType === "knowledge_article" && fields.length === 0) return null;
  return <section className="ai-resource-detail" aria-label="AI 资源信息">
    <div className="ai-resource-detail-heading"><div><small>HEIKA / AI RESOURCE</small><h2>资源信息</h2></div><span>{contentType.replaceAll("_", " ")}</span></div>
    <dl className="ai-resource-detail-fields">{fields.map(([key, raw]) => {
      const values = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [String(raw)];
      const text = values.join("\n");
      const href = key.endsWith("_url") ? safeResourceLink(text) : "";
      return <div className="ai-resource-detail-field" key={key}>
        <dt>{labels[key] || key}</dt>
        <dd className={copyableKeys.has(key) ? "is-code" : ""}>{href ? <a href={href} target="_blank" rel="noopener noreferrer"><Link2 size={14}/>{href}<ExternalLink size={13}/></a> : <span>{values.map((value, index) => <span key={index}>{value}</span>)}</span>}
          {copyableKeys.has(key) && <button type="button" aria-label={`复制${labels[key] || key}`} onClick={() => void copy(key, text)}>{copiedKey === key ? <Check size={14}/> : <Copy size={14}/>} {copiedKey === key ? "已复制" : "复制"}</button>}
        </dd>
      </div>;
    })}</dl>
    {!!versions.length && <details className="ai-resource-version-history"><summary><History size={15}/> 版本记录 · {versions.length}</summary><ol>{versions.map((version) => <li key={version.id}><strong>{version.version_label}</strong><span>{version.changelog || "资源更新"}</span><time>{new Date(version.created_at).toLocaleDateString("zh-CN")}</time></li>)}</ol></details>}
    <details className="ai-resource-feedback"><summary><Flag size={15}/> 报告资源失效或风险</summary><label>反馈类型<select value={feedbackKind} onChange={(event) => setFeedbackKind(event.target.value)}><option value="broken_link">链接失效</option><option value="outdated">内容过时</option><option value="unsafe">存在安全风险</option><option value="other">其他问题</option></select></label><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={1000} placeholder="说明需要核查的链接或内容，至少 3 个字"/><button type="button" className="soft-button" disabled={sending || feedback.trim().length < 3} onClick={() => void sendFeedback()}>{sending ? "提交中…" : "提交反馈"}</button></details>
  </section>;
}
