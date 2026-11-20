"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Check, Link2, Share2, X } from "lucide-react";

type SharePlatform = "system" | "copy" | "wechat" | "moments" | "x" | "telegram" | "facebook" | "qq";

export type SharePayload = {
  title: string;
  blurb: string;
  url: string;
  text: string;
};

type Props = {
  open: boolean;
  payload: SharePayload | null;
  clientId?: string | null;
  surface?: "web" | "android" | "ios";
  onClose: () => void;
  onNotice: (message: string) => void;
};

/**
 * 分享面板：统一尺寸的官方品牌图标 + 一致的圆角方形容器。
 * 背景是真实高斯模糊的固态玻璃，遮罩只压低干扰，不把整页变黑。
 */
export default function SharePanel({ open, payload, clientId, surface = "web", onClose, onNotice }: Props) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const timer = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !payload) return null;

  const record = (platform: SharePlatform) => {
    if (!clientId) return;
    void fetch(`/api/v1/posts/${encodeURIComponent(clientId)}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, surface }),
      keepalive: true,
    }).catch(() => { /* 分享统计失败不影响分享本身 */ });
  };

  const copy = async (platform: SharePlatform, message: string) => {
    try {
      await navigator.clipboard.writeText(payload.text);
      setCopied(true);
      onNotice(message);
      record(platform);
    } catch {
      onNotice("当前浏览器不能访问剪贴板，请长按选择复制");
    }
  };

  const openWindow = (platform: SharePlatform, href: string) => {
    record(platform);
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const systemShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `《${payload.title}》`, text: payload.text, url: payload.url });
        record("system");
        onClose();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy("system", "系统分享不可用，分享文案已复制");
  };

  const quote = encodeURIComponent(`《${payload.title}》 ${payload.blurb}`);
  const encodedUrl = encodeURIComponent(payload.url);
  const items: Array<{ id: SharePlatform; label: string; tint: string; icon: ReactNode; onClick: () => void }> = [
    {
      id: "wechat", label: "微信", tint: "#07C160",
      icon: <WeChatIcon />,
      onClick: () => void copy("wechat", "分享文案已复制，去微信粘贴给朋友"),
    },
    {
      id: "moments", label: "朋友圈", tint: "#12B45A",
      icon: <MomentsIcon />,
      onClick: () => void copy("moments", "分享文案已复制，去朋友圈粘贴发布"),
    },
    {
      id: "x", label: "X", tint: "#0F1419",
      icon: <XIcon />,
      onClick: () => openWindow("x", `https://twitter.com/intent/tweet?text=${quote}&url=${encodedUrl}`),
    },
    {
      id: "telegram", label: "Telegram", tint: "#229ED9",
      icon: <TelegramIcon />,
      onClick: () => openWindow("telegram", `https://t.me/share/url?url=${encodedUrl}&text=${quote}`),
    },
    {
      id: "facebook", label: "Facebook", tint: "#1877F2",
      icon: <FacebookIcon />,
      onClick: () => openWindow("facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`),
    },
    {
      id: "qq", label: "QQ", tint: "#12B7F5",
      icon: <QQIcon />,
      onClick: () => openWindow("qq", `https://connect.qq.com/widget/shareqq/index.html?url=${encodedUrl}&title=${encodeURIComponent(payload.title)}&summary=${encodeURIComponent(payload.blurb)}`),
    },
  ];

  return (
    <div className="share-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        className="share-sheet heika-solid-glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
      >
        <header className="share-sheet-head">
          <div>
            <h2 id="share-sheet-title">分享这篇作品</h2>
            <p>选择一个去处，文案与链接会一起带过去。</p>
          </div>
          <button ref={closeRef} type="button" className="share-sheet-close" aria-label="关闭分享面板" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="share-sheet-preview">
          <strong>{payload.title}</strong>
          <span>{payload.blurb}</span>
        </div>

        <div className="share-sheet-grid" role="group" aria-label="分享平台">
          {items.map((item) => (
            <button key={item.id} type="button" className="share-sheet-item" onClick={item.onClick} aria-label={`分享到${item.label}`}>
              <span className="share-sheet-icon" style={{ "--brand": item.tint } as CSSProperties}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="share-sheet-actions">
          <button type="button" className="share-sheet-secondary" onClick={() => void systemShare()}>
            <Share2 size={16} /> 系统分享
          </button>
          <button type="button" className="share-sheet-secondary" onClick={() => void copy("copy", "分享文案已复制")}>
            {copied ? <Check size={16} /> : <Link2 size={16} />} {copied ? "已复制" : "复制文案与链接"}
          </button>
        </div>
      </section>
    </div>
  );
}

function WeChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  );
}

function MomentsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.6v4M12 17.4v4M2.6 12h4M17.4 12h4M5.4 5.4l2.8 2.8M15.8 15.8l2.8 2.8M18.6 5.4l-2.8 2.8M8.2 15.8l-2.8 2.8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="currentColor">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

function QQIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
    </svg>
  );
}
