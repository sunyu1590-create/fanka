"use client";

import { BadgeCheck } from "lucide-react";
import type { CSSProperties } from "react";

export type ProfileBadge = { id: string; label: string; description?: string | null; color?: string | null };

export default function ProfileBadgeList({ badges, compact = false }: { badges: ProfileBadge[]; compact?: boolean }) {
  if (!badges.length) return null;
  return <span className={`profile-badge-list${compact ? " is-compact" : ""}`} aria-label="认证标识">
    {badges.map((badge) => <span
      key={badge.id}
      title={badge.description || badge.label}
      style={{ "--profile-badge-color": badge.color || "#78613B" } as CSSProperties}
    ><BadgeCheck size={compact ? 11 : 13} aria-hidden="true"/><span>{badge.label}</span></span>)}
  </span>;
}
