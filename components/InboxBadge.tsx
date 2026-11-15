"use client";
import { useEffect, useRef, useState } from "react";
import { browserDb } from "@/lib/browser-db";
import { clearInboxSummary, readInboxSummary } from "@/lib/inbox-summary";
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
  // conversation_id -> 已见过的最后一条消息 id，用于在轮询中识别新消息
  const seen = useRef<Map<string, string>>(new Map());
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
            seen.current.clear();
            if (alive) setCount(0);
            return;
          }
          signedInUserId = session.session.user.id;
          const rows = await readInboxSummary(db, signedInUserId).catch(() => null);
          if (alive && rows) {
            const total = rows.reduce((sum, row) => sum + Number(row.unread), 0);

            // 首次加载只建立基线，不把历史消息当成新消息推送
            const firstPass = previous.current === null && seen.current.size === 0;
            const fresh = rows.filter((row) => {
              const latest = row.latest_message_id;
              if (!latest) return false;
              const known = seen.current.get(row.conversation_id);
              seen.current.set(row.conversation_id, latest);
              return !firstPass && known !== undefined && known !== latest && row.latest_sender_id !== signedInUserId;
            });

            if (fresh.length && notify.current && inApp.current && document.visibilityState === "visible") {
              fresh.sort((a, b) => String(b.latest_created_at || "").localeCompare(String(a.latest_created_at || "")));
              const newest = fresh[0];
              const senderId = newest.latest_sender_id || "";
              void db.from("profiles").select("nickname,avatar_url").eq("id", senderId).maybeSingle().then(({ data: sender }) => {
                if (!alive || document.visibilityState !== "visible" || !notify.current || !inApp.current) return;
                notice.current?.(newest.latest_media_path ? "向你发送了一张图片" : newest.latest_body || "你收到了一条新消息", {
                  title: sender?.nickname || "新消息",
                  avatarUrl: sender?.avatar_url,
                  kind: "message",
                  onActivate: () => openPeer.current?.(senderId),
                });
              });
            }

            if (
              previous.current !== null &&
              total > previous.current &&
              notify.current &&
              document.visibilityState !== "visible" &&
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
        // 云开发共享版实例不支持 Realtime，改用可见性感知的轮询：
        // 页面在后台时停止请求，回到前台立即补一次。
        const { data } = db.auth.onAuthStateChange((_event, session) => {
          const nextUserId = session?.user.id || null;
          if (signedInUserId && signedInUserId !== nextUserId) {
            clearInboxSummary(signedInUserId);
            previous.current = null;
            seen.current.clear();
          }
          signedInUserId = nextUserId;
          setTimeout(() => void refresh(), 0);
        });
        const refreshWhenVisible = () => {
          if (document.visibilityState === "visible") void refresh();
        };
        const timer = setInterval(refreshWhenVisible, 5000);
        window.addEventListener("heika-read", refresh);
        document.addEventListener("visibilitychange", refreshWhenVisible);
        dispose = () => {
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
