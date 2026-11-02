"use client";
import { useEffect, useRef, useState } from "react";
import { browserDb } from "@/lib/browser-db";
export default function InboxBadge({ enabled = false }: { enabled?: boolean }) {
  const notify = useRef(enabled);
  notify.current = enabled;
  const previous = useRef<number | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    let dispose = () => {};
    void browserDb()
      .then((db) => {
        if (!alive) return;
        const refresh = async () => {
          const { data: session } = await db.auth.getSession();
          if (!session.session) {
            if (alive) setCount(0);
            return;
          }
          const { data } = await db.rpc("dm_unread_counts");
          if (alive && data) {
            const total = data.reduce(
              (sum: number, row: { unread: number }) =>
                sum + Number(row.unread),
              0,
            );
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
            () => void refresh(),
          )
          .subscribe();
        const { data } = db.auth.onAuthStateChange(() => {
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
