"use client";

import { useRef } from "react";
import { Bell, Bookmark, CircleAlert, CircleCheck, Heart, Image as ImageIcon, MessageCircle, MessageSquare, ShieldCheck, Star, UserPlus, X } from "lucide-react";

export type NoticeKind = "general" | "success" | "error" | "message" | "content" | "reward" | "account" | "like" | "comment" | "bookmark" | "follow" | "rating";

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

function BadgeIcon({ kind }: { kind: NoticeKind }) {
  if (kind === "error") return <CircleAlert size={16} />;
  if (kind === "success") return <CircleCheck size={16} />;
  if (kind === "like") return <Heart size={16} fill="currentColor" />;
  if (kind === "comment") return <MessageSquare size={16} />;
  if (kind === "bookmark") return <Bookmark size={16} />;
  if (kind === "follow") return <UserPlus size={16} />;
  if (kind === "rating") return <Star size={16} />;
  if (kind === "message") return <MessageCircle size={16} />;
  if (kind === "content") return <ImageIcon size={16} />;
  if (kind === "reward") return <Star size={16} />;
  if (kind === "account") return <ShieldCheck size={16} />;
  return <Bell size={16} />;
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
      aria-label={`${notice.title}：${notice.body}`}
    >
      <span className={`toast-icon is-${notice.kind}`} aria-hidden="true"><BadgeIcon kind={notice.kind} /></span>
      <button className="toast-copy" type="button" onClick={activate} aria-label={notice.onActivate ? `打开${notice.title}` : `查看提示：${notice.body}`}>
        {notice.body}
      </button>
      <button type="button" className="toast-dismiss" aria-label="关闭通知" onClick={(event) => { event.stopPropagation(); onDismiss(); }}><X size={16} /></button>
    </div>
  );
}
