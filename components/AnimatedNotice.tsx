"use client";

import { useEffect, useRef, useState } from "react";

type NoticeState = {
  message: string;
  phase: "entering" | "leaving";
  id: number;
};

export default function AnimatedNotice({
  message,
  className,
  onClick,
}: {
  message: string;
  className?: string;
  onClick?: () => void;
}) {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const sequence = useRef(0);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    exitTimer.current = null;

    if (message) {
      sequence.current += 1;
      setNotice({ message, phase: "entering", id: sequence.current });
    } else if (sequence.current > 0) {
      setNotice((current) => current ? { ...current, phase: "leaving" } : null);
      const exitId = sequence.current;
      exitTimer.current = window.setTimeout(() => {
        setNotice((current) => current?.id === exitId ? null : current);
        exitTimer.current = null;
      }, 320);
    }

    return () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    };
  }, [message]);

  if (!notice) return null;
  return (
    <p
      key={notice.id}
      role="status"
      className={`${className || ""} animated-notice ${notice.phase === "leaving" ? "is-leaving" : ""}`.trim()}
      onClick={onClick}
    >
      {notice.message}
    </p>
  );
}
