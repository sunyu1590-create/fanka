"use client";

import { useRef } from "react";
import { Bell, ChevronDown, ChevronUp, CircleAlert, CircleCheck, Image as ImageIcon, MessageCircle, ShieldCheck, Star, X } from "lucide-react";

export type NoticeKind = "general" | "success" | "error" | "message" | "content" | "reward" | "account";

export type NoticeOptions = {
  title?: string;
  avatarUrl?: string | null;
  kind?: NoticeKind;
  onActivate?: () => void;
};

export type NoticeBannerItem = NoticeOptions & {
  id: number;
  title: string;
  body: string;
  createdAt: number;
  kind: NoticeKind;
};

function noticeTime(timestamp: number) {
  const now = new Date();
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const age = now.getTime() - date.getTime();
  if (age < 60_000) return "现在";
  if (date.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} ${time}`;
}

function BadgeIcon({ kind }: { kind: NoticeKind }) {
  if (kind === "error") return <CircleAlert size={12} />;
  if (kind === "success") return <CircleCheck size={12} />;
  if (kind === "message") return <MessageCircle size={12} />;
  if (kind === "content") return <ImageIcon size={12} />;
  if (kind === "reward") return <Star size={12} />;
  if (kind === "account") return <ShieldCheck size={12} />;
  return <Bell size={12} />;
}

export default function NoticeBanner({
  notice,
  leaving,
  expanded,
  onExpand,
  onDismiss,
}: {
  notice: NoticeBannerItem;
  leaving: boolean;
  expanded: boolean;
  onExpand: () => void;
  onDismiss: () => void;
}) {
  const pointerStart = useRef<{ id: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const avatar = notice.avatarUrl || "/icons/heika-192.png";

  const activate = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (notice.onActivate) notice.onActivate();
    onDismiss();
  };

  return (
    <div
      className={`toast${leaving ? " is-leaving" : ""}${expanded ? " is-expanded" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointerStart.current = { id: event.pointerId, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (!start || start.id !== event.pointerId) return;
        const offset = event.clientY - start.y;
        if (offset < -46) {
          suppressClick.current = true;
          onDismiss();
        } else if (offset > 46) {
          suppressClick.current = true;
          onExpand();
        }
      }}
      onPointerCancel={() => { pointerStart.current = null; }}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
    >
      <span
        className="toast-avatar"
        aria-hidden="true"
        style={{ backgroundImage: `url(${JSON.stringify(avatar)})` }}
      >
        <i className={`toast-kind-icon is-${notice.kind}`}><BadgeIcon kind={notice.kind} /></i>
      </span>
      <div className="toast-content">
        <div className="toast-heading">
          <strong>{notice.title}</strong>
          <time dateTime={new Date(notice.createdAt).toISOString()}>{noticeTime(notice.createdAt)}</time>
        </div>
        <button className="toast-message" type="button" onClick={activate} aria-label={notice.onActivate ? `打开${notice.title}` : `关闭提示：${notice.body}`}>
          <span>{notice.body}</span>
        </button>
        <div className="toast-footer">
          {notice.body.length > 52 && <button type="button" className="toast-expand-button" aria-expanded={expanded} onClick={onExpand}>{expanded ? "收起" : "展开"}{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>}
          {notice.onActivate && <span className="toast-open-hint">点击查看</span>}
        </div>
      </div>
      <button type="button" className="toast-dismiss" aria-label="关闭通知" onClick={(event) => { event.stopPropagation(); onDismiss(); }}><X size={17} /></button>
    </div>
  );
}
