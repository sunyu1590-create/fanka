"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, Link2, X } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { safeResourceLink } from "@/lib/ai-resources";
import { formatAttachmentSize, readAttachments } from "@/lib/attachments";
import ChoiceSelect from "./ChoiceSelect";

type Version = { id: string; version_label: string; changelog: string; created_at: string };
type Props = { preview?: boolean; postId: string; contentType: string; resourceData: Record<string, unknown>; accountId: string | null; onLogin: () => void; onNotice: (message: string) => void; action?: "versions" | "feedback" | "resources" | null; onActionClose?: () => void; onVersionsAvailability?: (available: boolean) => void };

const labels: Record<string, string> = {
  functionality: "功能说明", platforms: "兼容平台", run_mode: "运行方式", use_cases: "适用场景", tutorial: "使用教程",
  environments: "兼容环境", installation: "安装步骤", configuration: "配置内容", example: "使用示例", model: "适用模型",
  scenario: "应用场景", prompt: "完整提示词", variables: "可替换变量", pricing: "价格信息", difficulty: "难度", requirements: "准备条件", steps: "实战步骤",
  source_url: "资源来源", changelog: "更新记录", version: "版本",
};
const copyableKeys = new Set(["prompt", "installation", "configuration", "steps", "example", "tutorial"]);
const contentTypeLabels: Record<string, string> = { knowledge_article: "AI 知识", agent: "智能体", skill: "技能", prompt: "提示词", ai_tool: "AI 工具", tutorial: "实战教程" };

export default function AIResourceDetails({ preview = false, postId, contentType, resourceData, accountId, onLogin, onNotice, action = null, onActionClose, onVersionsAvailability }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionError, setVersionError] = useState("");
  const [feedbackKind, setFeedbackKind] = useState("broken_link");
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const attachments = useMemo(() => readAttachments(resourceData), [resourceData]);
  const fields = useMemo(() => Object.entries(resourceData || {}).filter(([key, value]) => key !== "attachments" && ((typeof value === "string" && value.trim()) || (Array.isArray(value) && value.length))), [resourceData]);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void cloudFetch(`/api/v1/ai-space/${postId}/versions`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.data?.items)) throw new Error("版本记录读取失败");
      if (active) {
        const items = result.data.items as Version[];
        setVersions(items);
        onVersionsAvailability?.(items.length > 0);
      }
    }).catch(() => { if (active) setVersionError("更新记录暂时无法加载，请稍后重试。"); });
    return () => { active = false; };
  }, [postId, preview, onVersionsAvailability]);

  useEffect(() => {
    if (!action) return;
    if (action === "resources") {
      const target = document.getElementById("ai-resource-detail");
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "start" }); onActionClose?.(); }
      return;
    }
    document.getElementById("ai-resource-actions")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [action, onActionClose]);

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

  const downloadAttachment = async (path: string, name: string) => {
    try {
      const response = await cloudFetch(`/api/v1/attachments?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`);
      const payload = await response.json();
      if (!response.ok || !payload?.data?.url) throw new Error();
      window.open(payload.data.url, "_blank", "noopener,noreferrer");
    } catch { onNotice("附件下载链接获取失败，请稍后重试"); }
  };

  if (contentType === "knowledge_article" && fields.length === 0 && attachments.length === 0 && !action) return null;
  return <section className="ai-resource-detail" id="ai-resource-detail" aria-label="AI 资源信息">
    <div className="ai-resource-detail-heading"><div><h2>资源信息</h2></div><span>{contentTypeLabels[contentType] || "AI 内容"}</span></div>
    {!!attachments.length && <div className="ai-resource-attachments">
      <div className="ai-resource-attachments-head"><strong>附件</strong><span>{attachments.length} 个 · 由作者上传</span></div>
      <ul>{attachments.map((item) => <li key={item.path}>
        <span className="ai-resource-attachment-icon" aria-hidden="true">{item.name.split(".").pop()?.toUpperCase().slice(0, 4)}</span>
        <span className="ai-resource-attachment-copy"><strong title={item.name}>{item.name}</strong><small>{formatAttachmentSize(item.size)}</small></span>
        <button type="button" onClick={() => void downloadAttachment(item.path, item.name)}><Download size={14}/> 下载</button>
      </li>)}</ul>
      <p className="ai-resource-attachment-note">附件由作者上传，下载与使用请自行判断安全性，黑卡不对附件内容负责。</p>
    </div>}
    <dl className="ai-resource-detail-fields">{fields.map(([key, raw]) => {
      const values = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [String(raw)];
      const text = values.join("\n");
      const href = key.endsWith("_url") ? safeResourceLink(text) : "";
      return <div className="ai-resource-detail-field" key={key}>
        <dt>{labels[key] || "其他信息"}</dt>
        <dd className={copyableKeys.has(key) ? "is-code" : ""}>{href ? <a href={href} target="_blank" rel="noopener noreferrer"><Link2 size={14}/>{href}<ExternalLink size={13}/></a> : <span>{values.map((value, index) => <span key={index}>{value}</span>)}</span>}
          {copyableKeys.has(key) && <button type="button" aria-label={`复制${labels[key] || "其他信息"}`} onClick={() => void copy(key, text)}>{copiedKey === key ? <Check size={14}/> : <Copy size={14}/>} {copiedKey === key ? "已复制" : "复制"}</button>}
        </dd>
      </div>;
    })}</dl>
    {!preview && (action === "versions" || action === "feedback") && <section className="ai-resource-action-panel" id="ai-resource-actions" aria-label={action === "versions" ? "更新记录" : "资源反馈"}>
      <header><strong>{action === "versions" ? "更新记录" : "资源纠错"}</strong><button type="button" onClick={onActionClose} aria-label="关闭"><X size={16}/></button></header>
      {action === "versions" ? versionError ? <p role="status">{versionError}</p> : versions.length ? <ol className="ai-resource-version-list">{versions.map((version) => <li key={version.id}><strong>{version.version_label}</strong><span>{version.changelog || "资源更新"}</span><time>{new Date(version.created_at).toLocaleDateString("zh-CN")}</time></li>)}</ol> : typeof resourceData.version === "string" || typeof resourceData.changelog === "string" ? <ol className="ai-resource-version-list"><li><strong>{typeof resourceData.version === "string" ? resourceData.version : "当前版本"}</strong><span>{typeof resourceData.changelog === "string" ? resourceData.changelog : "暂无更新说明"}</span></li></ol> : <p>暂无更多版本记录。</p> : <>
        <label>反馈类型<ChoiceSelect label="反馈类型" value={feedbackKind} onChange={setFeedbackKind} options={[{value:"broken_link",label:"链接失效"},{value:"outdated",label:"内容过时"},{value:"unsafe",label:"存在安全风险"},{value:"other",label:"其他问题"}]}/></label>
        <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={1000} placeholder="说明需要核查的链接或内容，至少 3 个字"/>
        <button type="button" className="soft-button" disabled={sending || feedback.trim().length < 3} onClick={() => void sendFeedback()}>{sending ? "提交中…" : "提交反馈"}</button>
      </>}
    </section>}
  </section>;
}
