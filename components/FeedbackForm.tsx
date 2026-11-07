"use client";

import { FormEvent, useEffect, useState } from "react";
import { cloudFetch } from "@/lib/cloud";

export default function FeedbackForm({ accountId, onLogin, onNotice }: { accountId: string | null; onLogin: () => void; onNotice: (message: string) => void }) {
  const [category, setCategory] = useState("suggestion");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!attachment) { setPreview(""); return; } const url = URL.createObjectURL(attachment); setPreview(url); return () => URL.revokeObjectURL(url); }, [attachment]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountId) return onLogin();
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("category", category); form.set("message", message); form.set("website", website); if (attachment) form.set("attachment", attachment);
      const response = await cloudFetch("/api/v1/feedback", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败，请重试");
      setMessage(""); setWebsite(""); setAttachment(null);
      onNotice("反馈已提交，感谢你的建议");
    } catch (cause) { setError(cause instanceof TypeError ? "网络连接不可用，请检查后重试" : cause instanceof Error ? cause.message : "提交失败，请重试"); }
    finally { setBusy(false); }
  };
  if (!accountId) return <div className="feedback-login"><p>登录后可提交并查看处理进度。</p><button type="button" className="primary-button" onClick={onLogin}>前往登录</button></div>;
  return <form className="feedback-form" onSubmit={(event) => void submit(event)}>
    <label>反馈分类<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="suggestion">功能建议</option><option value="problem">使用问题</option><option value="other">其他反馈</option></select></label>
    <label>反馈内容<textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={3000} rows={7} placeholder="请描述你遇到的情况或建议（10–3000 字）" required /></label>
    <label className="feedback-honeypot" aria-hidden="true">网站<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
    <label className="feedback-attachment">图片（可选）<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file && file.size > 5 * 1024 * 1024) { setError("图片不能超过 5 MB"); event.target.value = ""; return; } setError(""); setAttachment(file || null); }}/><small>支持 JPG、PNG、WebP，单张不超过 5 MB</small></label>
    {preview && <div className="feedback-attachment-preview"><img src={preview} alt="反馈图片预览"/><button type="button" onClick={() => setAttachment(null)}>移除图片</button></div>}
    <p className="settings-note">反馈会关联当前账号，仅授权的社区管理人员可查看。</p>
    {error && <p className="settings-error" role="alert">{error}</p>}
    <button className="primary-button full" disabled={busy || message.trim().length < 10}>{busy ? "正在提交…" : "提交反馈"}</button>
  </form>;
}
