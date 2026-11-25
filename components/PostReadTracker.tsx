"use client";

import { useEffect, useRef } from "react";
import { trackRead } from "@/lib/track";

/**
 * 有效阅读计时：累计停留时长 + 正文滚动深度。
 * 只在达到阈值时上报，点开即走不会被算成已读。
 */
export default function PostReadTracker({ postId, seriesId }: { postId: string; seriesId?: string | null }) {
  const start = useRef(Date.now());
  const maxPercent = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    start.current = Date.now();
    maxPercent.current = 0;
    sent.current = false;

    const measure = () => {
      const scroller = document.querySelector<HTMLElement>(".overlay .detail");
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 40) {
        const percent = ((scroller.scrollTop + scroller.clientHeight) / scroller.scrollHeight) * 100;
        maxPercent.current = Math.max(maxPercent.current, Math.min(100, percent));
        return;
      }
      const height = document.documentElement.scrollHeight;
      if (height <= window.innerHeight + 40) { maxPercent.current = 100; return; }
      maxPercent.current = Math.max(maxPercent.current, Math.min(100, ((window.scrollY + window.innerHeight) / height) * 100));
    };

    const flush = () => {
      if (sent.current) return;
      const seconds = Math.round((Date.now() - start.current) / 1000);
      measure();
      if (maxPercent.current >= 25 || seconds >= 8) {
        sent.current = true;
        void trackRead({ postId, seriesId, percent: maxPercent.current, seconds, surface: "web" });
      }
    };

    const timer = window.setInterval(measure, 1200);
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [postId, seriesId]);

  return null;
}
