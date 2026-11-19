"use client";

import { useMemo, useState } from "react";
import { Download, Eye, Paperclip } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { formatAttachmentSize, isPreviewableAttachment, readAttachments } from "@/lib/attachments";

export default function PostAttachmentsPanel({ resourceData, onNotice }: {
  resourceData: Record<string, unknown>;
  onNotice: (message: string) => void;
}) {
  const items = useMemo(() => readAttachments(resourceData), [resourceData]);
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;

  const open = async (path: string, name: string, preview: boolean) => {
    setBusy(path);
    try {
      const result = await cloudRequest(`/api/v1/attachments?path=${encodeURIComponent(path)}${preview ? "&preview=1" : `&name=${encodeURIComponent(name)}`}`) as { url?: string } | null;
      if (!result?.url) throw new Error("附件链接暂时不可用");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "附件打开失败，请稍后重试");
    } finally { setBusy(null); }
  };

  return <section className="post-attachments-panel" aria-label="作品附件">
    <header><strong><Paperclip size={15}/> 附件</strong><span>{items.length} 个</span></header>
    <ul>{items.map((item) => {
      const ext = item.name.split(".").pop()?.toLowerCase() || "";
      const canPreview = isPreviewableAttachment(item.name);
      return <li key={item.path}>
        <span className="post-attachment-copy"><strong title={item.name}>{item.name}</strong><small>{formatAttachmentSize(item.size)} · {ext.toUpperCase() || "文件"}</small></span>
        <span className="post-attachment-actions">
          {canPreview && <button type="button" disabled={busy === item.path} onClick={() => void open(item.path, item.name, true)}><Eye size={14}/> 预览</button>}
          <button type="button" disabled={busy === item.path} onClick={() => void open(item.path, item.name, false)}><Download size={14}/> 下载</button>
        </span>
      </li>;
    })}</ul>
    <p>附件由作者上传，请在下载或打开前确认来源可靠。</p>
  </section>;
}
