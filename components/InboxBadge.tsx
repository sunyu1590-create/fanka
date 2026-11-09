"use client";
import { useEffect, useRef, useState } from "react";
import { browserDb } from "@/lib/browser-db";
import { clearInboxSummary, readInboxSummary } from "@/lib/inbox-summary";
import { hasNativeBridge } from "@/lib/native-bridge";
import type { NoticeOptions } from "./NoticeBanner";
export default function InboxBadge({ enabled = false, inAppEnabled = true, onNotice, onOpenConversationPeer }: { enabled?: boolean; inAppEnabled?: boolean; onNotice?: (message: string, options?: NoticeOptions) => void; onOpenConversationPeer?: (id: string) => void }) {
  const notify = useRef(enabled);
  notify.current = enabled;
  const inApp = useRef(inAppEnabled);
  inApp.current = inAppEnabled;
  const notice = useRef(onNotice);
  notice.current = onNotice;
  const openPeer = useRef(onOpenConversationPeer);
  openPeer.current = onOpenConversationPeer;
  const previous = useRef<number | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    let dispose = () => {};
    let signedInUserId: string | null = null;
    void browserDb()
      .then((db) => {
        if (!alive) return;
        const refresh = async () => {
          const { data: session } = await db.auth.getSession();
          if (!session.session) {
            if (signedInUserId) clearInboxSummary(signedInUserId);
            signedInUserId = null;
            if (alive) setCount(0);
            return;
          }
          signedInUserId = session.session.user.id;
          const rows = await readInboxSummary(db, signedInUserId).catch(() => null);
          if (alive && rows) {
            const total = rows.reduce((sum, row) => sum + Number(row.unread), 0);
            if (
              previous.current !== null &&
              total > previous.current &&
              notify.current &&
              document.visibilityState !== "visible" &&
              !hasNativeBridge() &&
              "Notification" in window &&
              Notification.permission === "granted"
            )
              new Notification("黑卡 · 新消息", {
                body: "你收到了一条私聊消息",
                icon: "/icons/heika-192.png",
              });
            previous.current = total;
            setCount(total);
          }
        };
        void refresh();
        const channel = db
          .channel("heika-unread")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "dm_messages" },
            (payload) => {
              if (payload.eventType === "INSERT") {
                const row = payload.new as { sender_id?: string; body?: string; media_path?: string | null };
                const senderId = row.sender_id;
                if (senderId && senderId !== signedInUserId && inApp.current && notify.current && document.visibilityState === "visible") {
                  void db.from("profiles").select("nickname,avatar_url").eq("id", senderId).maybeSingle().then(({ data: sender }) => {
                    if (!alive || document.visibilityState !== "visible" || !notify.current || !inApp.current) return;
                    notice.current?.(row.media_path ? "向你发送了一张图片" : row.body || "你收到了一条新消息", {
                      title: sender?.nickname || "新消息",
                      avatarUrl: sender?.avatar_url,
                      kind: "message",
                      onActivate: () => openPeer.current?.(senderId),
                    });
                  });
                }
              }
              void refresh();
            },
          )
          .subscribe();
        const { data } = db.auth.onAuthStateChange((_event, session) => {
          const nextUserId = session?.user.id || null;
          if (signedInUserId && signedInUserId !== nextUserId) {
            clearInboxSummary(signedInUserId);
            previous.current = null;
          }
          signedInUserId = nextUserId;
          // Supabase emits auth events while holding its session lock. A
          // microtask can run before that lock is released and stall getSession.
          setTimeout(() => void refresh(), 0);
        });
        const refreshWhenVisible = () => {
          if (document.visibilityState === "visible") void refresh();
        };
        const timer = setInterval(refreshWhenVisible, 12000);
        window.addEventListener("heika-read", refresh);
        document.addEventListener("visibilitychange", refreshWhenVisible);
        dispose = () => {
          void db.removeChannel(channel);
          data.subscription.unsubscribe();
          clearInterval(timer);
          window.removeEventListener("heika-read", refresh);
          document.removeEventListener("visibilitychange", refreshWhenVisible);
        };
      })
      .catch(() => {});
    return () => {
      alive = false;
      dispose();
    };
  }, []);
  return count > 0 ? (
    <span className="unread-badge" aria-label={`${count} 条未读消息`}>
      {count > 99 ? "99+" : count}
    </span>
  ) : null;
}
