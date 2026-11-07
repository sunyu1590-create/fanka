"use client";

import { Bell, Bookmark, CircleAlert, CircleCheck, Heart, Image as ImageIcon, MessageCircle, MessageSquare, ShieldCheck, Star, UserPlus } from "lucide-react";
import type { NoticeBannerItem } from "./NoticeBanner";

function ActionIcon({ kind }: { kind: NoticeBannerItem["kind"] }) {
  if (kind === "error") return <CircleAlert size={19} />;
  if (kind === "success") return <CircleCheck size={19} />;
  if (kind === "like") return <Heart size={19} fill="currentColor" />;
  if (kind === "comment") return <MessageSquare size={19} />;
  if (kind === "bookmark") return <Bookmark size={19} />;
  if (kind === "follow") return <UserPlus size={19} />;
  if (kind === "rating" || kind === "reward") return <Star size={19} />;
  if (kind === "message") return <MessageCircle size={19} />;
  if (kind === "content") return <ImageIcon size={19} />;
  if (kind === "account") return <ShieldCheck size={19} />;
  return <Bell size={19} />;
}

export default function ActionToast({ notice, leaving }: { notice: NoticeBannerItem; leaving: boolean }) {
  return (
    <div
      key={notice.id}
      className={`action-toast${leaving ? " is-leaving" : ""} is-${notice.kind}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${notice.title}：${notice.body}`}
    >
      <span className="action-toast-icon" aria-hidden="true"><ActionIcon kind={notice.kind} /></span>
      <span className="action-toast-copy">
        <strong>{notice.title}</strong>
        <span>{notice.body}</span>
      </span>
    </div>
  );
}
