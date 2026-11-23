"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ChevronDown, Image as ImageIcon, PenLine, X } from "lucide-react";
import { coverBackground, type CoverMeta } from "./CoverEditor";

type Props = {
  mode: "self" | "other";
  nickname: string;
  avatar?: string | null;
  coverUrl?: string | null;
  coverMeta?: Partial<CoverMeta> | null;
  /** 昵称右侧的认证与等级 */
  badges?: ReactNode;
  level?: ReactNode;
  bio?: string;
  accountLine?: string;
  facts?: ReactNode;
  stats?: ReactNode;
  actions?: ReactNode;
  /** 昵称旁小铅笔：进入资料编辑 */
  onEditProfile?: () => void;
  /** 自己的主页显示「更换封面」按钮 */
  onEditCover?: () => void;
  onNotice?: (message: string) => void;
  /** 内容标签与列表 */
  children?: ReactNode;
};

const MAX_EXTRA = 190;

/**
 * 自己与他人的主页共用同一套结构。
 * 对齐原则：昵称以头像为基准垂直居中；头像跨在封面下边缘与纯色资料区之间，
 * 并通过 --profile-avatar-shift 略微下移，让昵称自然地落在纯色区。
 */
export default function ProfileHeader({
  mode, nickname, avatar, coverUrl, coverMeta, badges, level, bio, accountLine, facts, stats, actions, onEditProfile, onEditCover, onNotice, children,
}: Props) {
  const [extra, setExtra] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const dragRef = useRef<{ startY: number; startExtra: number; active: boolean; scrollTop: number } | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  // 沉浸式全幅封面：移动端 264 起步，用户自定义的折叠高度仍以 320 为上限。
  const baseHeight = Math.min(320, Math.max(260, Number(coverMeta?.collapsedHeight) || 284));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setViewer(false); };
    if (viewer) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
    }
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [viewer]);

  const scrollTopOf = () => {
    // 他人主页在内部滚动容器里，自己的主页用窗口滚动。
    const container = coverRef.current?.closest<HTMLElement>(".public-profile-scroll, .app");
    if (container && container.scrollHeight > container.clientHeight) return container.scrollTop;
    return window.scrollY;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (scrollTopOf() > 0) return;
    dragRef.current = { startY: event.clientY, startExtra: 0, active: false, scrollTop: 0 };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientY - drag.startY;
    if (!drag.active) {
      // 先判定方向：横向滑动（例如浏览标签）不触发展开。
      if (delta < 14) return;
      drag.active = true;
      setDragging(true);
    }
    setExtra(Math.min(MAX_EXTRA, (delta - 14) * 0.62));
  };

  const onPointerUp = () => {
    if (dragRef.current?.active) {
      // 松手自然收回，不做跳切。
      setDragging(false);
      setExtra(0);
    }
    dragRef.current = null;
  };

  const background = coverUrl && !imageFailed ? coverBackground(coverUrl, coverMeta) : undefined;

  return (
    <section className={`profile-hero profile-hero-${mode}`} aria-label="个人资料">
      <div
        ref={coverRef}
        className={`profile-hero-cover${coverUrl ? " has-cover" : " is-default"}${dragging ? " is-dragging" : ""}`}
        style={{ height: baseHeight + extra, ...(background || {}) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!coverUrl && <span className="profile-hero-cover-fallback" aria-hidden="true" />}
        {coverUrl && imageFailed && <span className="profile-hero-cover-fallback is-error"><ImageIcon size={20} /><small>封面暂时无法加载</small></span>}
        {coverUrl && <img className="profile-hero-cover-probe" src={coverUrl} alt="" aria-hidden="true" onError={() => setImageFailed(true)} />}
        <div className="profile-hero-cover-actions">
          {mode === "self" && onEditCover && (
            <button type="button" onClick={(event) => { event.stopPropagation(); onEditCover(); }}><Camera size={15} /> 更换封面</button>
          )}
          {coverUrl && (
            <button type="button" onClick={(event) => { event.stopPropagation(); setViewer(true); }} aria-label="查看完整封面"><ImageIcon size={15} /></button>
          )}
        </div>
        {coverUrl && (
          <button type="button" className="profile-hero-cover-expand" aria-label="展开或查看完整封面" onClick={(event) => { event.stopPropagation(); setViewer(true); }}>
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      <div className="profile-hero-body">
        <div className="profile-hero-identity">
          <span className={`profile-hero-avatar${avatar ? "" : " is-empty"}`}>
            {/* 占位字始终在底层：头像图片加载失败时自然露出统一占位，而不是破图 */}
            <i aria-hidden="true">{(nickname || "探")[0]}</i>
            {avatar ? <img src={avatar} alt={`${nickname}的头像`} onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
          </span>
          <div className="profile-hero-name-block">
            <div className="profile-hero-name-row">
              <h1 title={nickname}>{nickname || "探索者"}</h1>
              {mode === "self" && onEditProfile && (
                <button
                  type="button"
                  className="profile-hero-edit-pencil"
                  aria-label="编辑资料"
                  title="编辑资料"
                  onClick={onEditProfile}
                >
                  <PenLine size={13} />
                </button>
              )}
              {badges}
              {level}
            </div>
            {accountLine && <small className="profile-hero-account">{accountLine}</small>}
          </div>
        </div>
        {bio !== undefined && (
          <div className="profile-hero-bio-block">
            <p className={`profile-hero-bio${bioOpen ? " is-expanded" : ""}`}>{bio || "还没有填写简介。"}</p>
            {String(bio || "").trim().length > 76 && (
              <button type="button" className="profile-hero-bio-toggle" aria-expanded={bioOpen} onClick={() => setBioOpen((open) => !open)}>{bioOpen ? "收起" : "展开"}</button>
            )}
          </div>
        )}
        {facts}
        {stats}
        {actions && <div className="profile-hero-actions">{actions}</div>}
      </div>

      {children}

      {viewer && coverUrl && (
        <div className="profile-cover-viewer" role="dialog" aria-modal="true" aria-label="完整封面" onClick={() => setViewer(false)}>
          <button type="button" aria-label="关闭" onClick={() => setViewer(false)}><X size={20} /></button>
          <img src={coverUrl} alt={`${nickname}的封面`} onClick={(event) => event.stopPropagation()} />
          <small>点击空白处关闭 · 这是完整原图</small>
        </div>
      )}
      {onNotice && <span className="sr-only" aria-live="polite" />}
    </section>
  );
}
