"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Heart, ListTree, MessageSquare, MoreHorizontal, X } from "lucide-react";
import { markdownOutline, type OutlineItem } from "./MarkdownContent";

export type ReaderCommentAttachment = { path: string; width?: number; height?: number };

type ReaderComment = {
  id: number;
  cloudId?: string;
  authorId?: string;
  name?: string;
  avatar?: string;
  post: number;
  body: string;
  parent?: number;
  replyToName?: string;
  time: number;
  likes: number;
  liked?: boolean;
  /** Discussion 2.0：作者置顶（服务端鉴权，每篇最多 1 条） */
  pinned?: boolean;
  /** 已删除占位：保留 id、时间与回复关系，正文不再展示 */
  deleted?: boolean;
  edited?: boolean;
  editedAt?: number;
  attachments?: ReaderCommentAttachment[];
  mentions?: string[];
  /** 乐观更新：待发送 / 发送失败 */
  pending?: boolean;
  failed?: boolean;
};

/** 正文中的 @昵称 高亮：纯前端展示，不额外调用任何接口 */
function renderMentions(text: string): ReactNode {
  if (!text || !text.includes("@")) return text;
  const parts = text.split(/(@[\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g);
  return parts.map((part, index) => (
    /^@[\u4e00-\u9fa5A-Za-z0-9_-]{1,20}$/.test(part)
      ? <span className="comment-mention" key={`mention-${index}`}>{part}</span>
      : part
  ));
}

export function relativeTime(time: number) {
  const diff = Date.now() - time;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

/**
 * 阅读进度：按正文真实滚动量计算，评论区、目录、分享面板的滚动都不参与。
 * 短文章（无可用标题结构）由调用方决定不渲染。
 */
export function useReadingProgress(mode: "page" | "overlay") {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const article = document.getElementById("detail-article");
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const height = rect.height || 1;
      const scroller = mode === "overlay" ? document.getElementById("detail-scroll") : null;
      const top = mode === "page" ? 64 : (scroller?.getBoundingClientRect().top ?? 54);
      const passed = top - rect.top;
      // 用「可滚动距离」做分母：顶部 0、末尾 1，和底部位置无关。
      const viewport = (scroller?.clientHeight ?? window.innerHeight) - (mode === "page" ? 64 : 0);
      const span = height - viewport;
      setProgress(span <= 40 ? 0 : Math.min(1, Math.max(0, passed / span)));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    // 详情浮层的正文滚在自己的容器里，scroll 事件不冒泡；用捕获阶段统一收口，
    // 容器换成哪个元素都不会漏掉进度更新。
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [mode]);
  return progress;
}

/** 当前所在章节：取「已经滚过顶栏」的最后一个标题，评论和目录滚动不参与。 */
export function useActiveHeading(outline: OutlineItem[], mode: "page" | "overlay") {
  const [activeId, setActiveId] = useState("");
  useEffect(() => {
    if (outline.length === 0) { setActiveId(""); return; }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const threshold = mode === "page" ? 140 : 120;
      let current = outline[0]?.id ?? "";
      for (const item of outline) {
        if (item.level > 3) continue;
        const node = document.getElementById(item.id);
        if (!node) continue;
        if (node.getBoundingClientRect().top <= threshold) current = item.id;
        else break;
      }
      setActiveId(current);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [outline, mode]);
  return activeId;
}

/**
 * 阅读系统 2.0 的详情页外壳状态：目录大纲、进度、当前章节与三个面板开关。
 * 一次成组返回，调用方只需在组件顶层调用一次，避免面板开关触发正文重挂。
 */

/* ---------- 阅读记忆：本地保存与恢复 ---------- */

type ReadingMemo = { anchor?: string; fraction: number; ts: number; length: number };

const MEMORY_PREFIX = "heika:reading-memo";

function memoryKey(accountId?: string | null) {
  return `${MEMORY_PREFIX}:${accountId || "guest"}`;
}

function readMemory(accountId?: string | null): Record<string, ReadingMemo> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(memoryKey(accountId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, ReadingMemo>) : {};
  } catch {
    return {};
  }
}

function writeMemory(accountId: string | null | undefined, postId: string, memo: ReadingMemo) {
  if (typeof window === "undefined") return;
  try {
    const store = readMemory(accountId);
    store[postId] = memo;
    // 只留最近 60 篇，localStorage 不会无限长大
    const kept = Object.entries(store)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 60);
    window.localStorage.setItem(memoryKey(accountId), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* 隐私模式写不进去就放弃，不影响阅读 */
  }
}

/**
 * 阅读记忆：再次打开同一篇长文时回到上次位置。
 * 章节锚点优先（内容改过也能落在有效章节上），没有锚点才按相对进度恢复；
 * 短文（可滚动距离不足）不恢复也不写入，滚动写盘做 700ms 防抖。
 */
export function useReadingMemo({
  postId,
  accountId,
  source,
  mode,
}: {
  postId?: string | null;
  accountId?: string | null;
  source?: string | null;
  mode: "page" | "overlay";
}) {
  const restoredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!postId || !source) return;
    const restore = () => {
      if (restoredFor.current === postId) return;
      const article = document.getElementById("detail-article");
      if (!article || article.offsetHeight < 1200) return;
      const scroller = mode === "overlay" ? document.getElementById("detail-scroll") : null;
      const viewport = mode === "page" ? window.innerHeight - 64 : (scroller?.clientHeight ?? window.innerHeight);
      const span = article.offsetHeight - viewport;
      if (span <= 120) return;
      // 明确的章节链接优先，不被历史进度抢走
      const hash = window.location.hash.replace("#", "");
      if (hash && document.getElementById(hash)) {
        restoredFor.current = postId;
        return;
      }
      const memo = readMemory(accountId)[postId];
      if (!memo || memo.fraction <= 0.04) {
        restoredFor.current = postId;
        return;
      }
      const baseTop = mode === "page" ? 64 : (scroller?.getBoundingClientRect().top ?? 54);
      const current = scroller ? scroller.scrollTop : window.scrollY;
      const offset = mode === "page" ? 96 : 78;
      const anchorNode = memo.anchor ? document.getElementById(memo.anchor) : null;
      let target: number;
      if (anchorNode) {
        target = current + (anchorNode.getBoundingClientRect().top - baseTop - offset);
      } else {
        const passed = baseTop - article.getBoundingClientRect().top;
        target = current + (memo.fraction * span - passed);
      }
      const max = scroller ? scroller.scrollHeight - viewport : document.documentElement.scrollHeight - window.innerHeight;
      target = Math.max(0, Math.min(target, Math.max(0, max - 8)));
      if (scroller) scroller.scrollTo({ top: target, behavior: "instant" });
      else window.scrollTo({ top: target, behavior: "instant" });
      restoredFor.current = postId;
    };
    // 正文是异步挂载的，图片解码还会再改一次高度，分两次尝试即可覆盖
    const early = window.setTimeout(restore, 320);
    const late = window.setTimeout(restore, 1100);
    return () => {
      window.clearTimeout(early);
      window.clearTimeout(late);
    };
  }, [postId, source, mode, accountId]);

  useEffect(() => {
    if (!postId || !source) return;
    let timer = 0;
    const save = () => {
      const article = document.getElementById("detail-article");
      if (!article || article.offsetHeight < 1200) return;
      const scroller = mode === "overlay" ? document.getElementById("detail-scroll") : null;
      const baseTop = mode === "page" ? 64 : (scroller?.getBoundingClientRect().top ?? 54);
      const viewport = mode === "page" ? window.innerHeight - 64 : (scroller?.clientHeight ?? window.innerHeight);
      const span = article.offsetHeight - viewport;
      if (span <= 120) return;
      const passed = baseTop - article.getBoundingClientRect().top;
      const fraction = Math.min(1, Math.max(0, passed / span));
      if (fraction < 0.03) return;
      let anchor: string | undefined;
      document.querySelectorAll<HTMLElement>("#detail-article h1[id], #detail-article h2[id], #detail-article h3[id]").forEach((node) => {
        if (node.getBoundingClientRect().top - baseTop <= 140) anchor = node.id;
      });
      writeMemory(accountId, postId, { anchor, fraction, ts: Date.now(), length: source.length });
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 700);
    };
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.clearTimeout(timer);
      // 关闭详情前兜底写一次，避免最后一次滚动没到防抖时间就离开
      save();
    };
  }, [postId, source, mode, accountId]);
}

export function useReaderShell(
  source: string | null | undefined,
  mode: "page" | "overlay",
  memory?: { postId?: string | null; accountId?: string | null },
) {
  const outline = useMemo(() => (source ? markdownOutline(source) : []), [source]);
  useReadingMemo({ postId: memory?.postId, accountId: memory?.accountId, source, mode });
  const progress = useReadingProgress(mode);
  const activeHeading = useActiveHeading(outline, mode);
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [commentPanelFocus, setCommentPanelFocus] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  return {
    outline, progress, activeHeading,
    commentPanelOpen, setCommentPanelOpen,
    commentPanelFocus, setCommentPanelFocus,
    tocOpen, setTocOpen,
  };
}

/**
 * 作者区右侧的关注按钮：真实读写 creator_follows，乐观更新失败即回滚。
 * 按钮本体 32px 视觉，外层保留 44px 热区；未登录或看自己时不渲染。
 */
export function AuthorFollowButton({ creatorId, accountId, onNotice }: {
  creatorId?: string | null;
  accountId?: string | null;
  onNotice?: (message: string) => void;
}) {
  const [following, setFollowing] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!creatorId || !accountId || creatorId === accountId) { setReady(false); return; }
    let alive = true;
    setReady(false);
    fetch(`/api/v1/creator-follows?creator=${encodeURIComponent(creatorId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (alive && result?.data) { setFollowing(Boolean(result.data.following)); setReady(true); } })
      .catch(() => { /* 读取失败就不显示关注态，不影响阅读 */ });
    return () => { alive = false; };
  }, [creatorId, accountId]);

  if (!creatorId || !accountId || creatorId === accountId || !ready) return null;
  const toggle = () => {
    if (busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next);
    fetch("/api/v1/creator-follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId }),
    }).then(async (response) => {
      const result = response.ok ? await response.json() : null;
      if (!result?.data) throw new Error("follow failed");
      setFollowing(Boolean(result.data.following));
      onNotice?.(result.data.following ? "已关注这位创作者" : "已取消关注");
    }).catch(() => {
      setFollowing(!next);
      onNotice?.("关注未同步，请稍后再试");
    }).finally(() => setBusy(false));
  };

  return (
    <button
      type="button"
      className={`reader-author-follow${following ? " is-following" : ""}`}
      aria-pressed={following}
      aria-label={following ? "取消关注作者" : "关注作者"}
      disabled={busy}
      onClick={toggle}
    >
      {following ? "已关注" : "关注"}
    </button>
  );
}

export function ReaderProgress({ progress }: { progress: number }) {
  return (
    <div className="reader-progress" aria-hidden="true">
      <i style={{ width: `${Math.round(progress * 100)}%` }} />
    </div>
  );
}

/** 移动端目录面板：实心底色，当前章节用品牌色标记。 */
export function ReaderTocSheet({ outline, activeId, onJump, onClose }: {
  outline: OutlineItem[];
  activeId: string;
  onJump: (item: OutlineItem) => void;
  onClose: () => void;
}) {
  const visible = outline.filter((item) => item.level <= 3);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="reader-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="reader-sheet" role="dialog" aria-modal="true" aria-label="文章目录">
        <div className="reader-sheet-handle" aria-hidden="true" />
        <header className="reader-sheet-head">
          <ListTree size={16} />
          <h2>目录</h2>
          <small>{visible.length} 节</small>
          <button type="button" className="reader-sheet-close" aria-label="关闭目录" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="reader-toc-list">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${item.level >= 3 ? "is-sub" : ""}${item.id === activeId ? " is-active" : ""}`.trim()}
              onClick={() => onJump(item)}
            >
              {item.text}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * 桌面左侧轻量目录：固定悬浮，不参与正文布局，因此正文宽度和位置都不变。
 * 窄屏（<1280）由 CSS 隐藏，改用顶栏的目录按钮打开上拉面板。
 */
export function ReaderTocAside({ outline, activeId, onJump }: {
  outline: OutlineItem[];
  activeId: string;
  onJump: (item: OutlineItem) => void;
}) {
  const items = outline.filter((item) => item.level <= 3);
  if (items.length < 3) return null;
  return (
    <nav className="reader-toc-aside" aria-label="文章目录">
      <p>目录</p>
      <div className="reader-toc-aside-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${item.level >= 3 ? "is-sub" : ""}${item.id === activeId ? " is-active" : ""}`.trim()}
            onClick={() => onJump(item)}
          >
            {item.text}
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * 评论面板：桌面是右侧抽屉，移动端是底部上拉面板（同一份 DOM，靠断点切换形态）。
 * 面板完全实心，正文不会透过来；关闭后保留已加载的评论与草稿（状态在父级）。
 */
export function CommentPanel({
  open,
  total,
  sort,
  comments,
  loading,
  error,
  hasMore,
  loadingMore,
  accountId,
  postAuthorId,
  composer,
  onClose,
  onSort,
  onLoadMore,
  onRetry,
  onLike,
  onReply,
  onDelete,
  onReport,
  onCopy,
  onEdit,
  onPin,
  onNotice,
  focusToken,
}: {
  open: boolean;
  total: number;
  sort: "hot" | "new";
  comments: ReaderComment[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  accountId: string | null;
  postAuthorId?: string | null;
  composer: ReactNode;
  onClose: () => void;
  onSort: (sort: "hot" | "new") => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onLike: (comment: ReaderComment) => void;
  onReply: (comment: ReaderComment) => void;
  onDelete: (comment: ReaderComment) => void;
  onReport: (comment: ReaderComment) => void;
  onCopy: (comment: ReaderComment) => void;
  onEdit: (comment: ReaderComment) => void;
  onPin: (comment: ReaderComment) => void;
  onNotice: (message: string) => void;
  focusToken: number;
}) {
  // 移动端抽屉三档：0 半屏（约 50%）、1 大屏（约 80%）、2 全屏；桌面端忽略档位。
  const [stage, setStage] = useState(0);
  // 拖动位移允许为负（向上拉），负值只用于判定，不真的把面板拉出屏幕。
  const [dragging, setDragging] = useState(0);
  const dragStart = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 入场动画结束后停掉 animation，避免拖动改内联样式后动画重播造成跳动。
  const [settled, setSettled] = useState(false);
  const [expandedBodies, setExpandedBodies] = useState<Record<number, boolean>>({});
  const [expandedThreads, setExpandedThreads] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!open) { setDragging(0); setStage(0); setSettled(false); return; }
    const settle = window.setTimeout(() => setSettled(true), 360);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // 桌面方案 A：评论与正文并列，正文必须继续可滚动，只有移动端抽屉才锁滚动。
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const previous = document.body.style.overflow;
    document.body.classList.add("comment-panel-open");
    if (!desktop) document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(settle);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("comment-panel-open");
      if (!desktop) document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // 从底栏「说说你的想法」进来时，面板展开完成后再聚焦输入框。
  useEffect(() => {
    if (!open || !focusToken) return;
    const timer = window.setTimeout(() => {
      const field = panelRef.current?.querySelector("textarea");
      field?.focus({ preventScroll: true });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, focusToken]);

  const roots = useMemo(() => {
    const all = comments;
    return all
      .filter((c) => !c.parent)
      .sort((a, b) => {
        // 作者置顶始终在最前，其余保持当前排序规则
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return sort === "new" ? b.time - a.time : b.likes - a.likes || b.time - a.time;
      });
  }, [comments, sort]);

  const childrenOf = useCallback((id: number) => comments.filter((c) => c.parent === id).sort((a, b) => a.time - b.time), [comments]);

  if (!open) return null;

  const onPointerDown = (event: React.PointerEvent) => {
    dragStart.current = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragging(event.clientY - dragStart.current);
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    const moved = dragging;
    dragStart.current = null;
    setDragging(0);
    if (moved > 96) {
      // 下滑：逐档降低，已在最低档则关闭并恢复阅读位置与草稿
      if (stage > 0) setStage((value) => Math.max(0, value - 1));
      else onClose();
    } else if (moved < -48) {
      // 上滑：逐档升高，最高到全屏
      setStage((value) => Math.min(2, value + 1));
    }
  };

  return (
    <div className="comment-panel-layer">
      <div className="comment-panel-scrim" role="presentation" onClick={onClose} />
      <section
        ref={panelRef}
        className={`comment-panel is-stage-${stage}${dragging ? " is-dragging" : ""}${settled ? " is-settled" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="评论"
        style={dragging ? { transform: `translateY(${Math.max(0, dragging)}px)` } : undefined}
      >
        <div
          className="reader-sheet-handle"
          role="separator"
          aria-label="拖动调整评论面板高度"
          style={{ cursor: "grab", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <header className="comment-panel-head">
          <MessageSquare size={16} />
          <h2>全部评论</h2>
          <small>{total > 0 ? total : comments.length}</small>
          <div className="comment-panel-tools">
            <button type="button" aria-label={stage === 2 ? "收起面板" : "展开到全屏"} onClick={() => setStage((value) => (value === 2 ? 0 : 2))}>
              {stage === 2 ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
            </button>
            <button type="button" aria-label="关闭评论" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="comment-sort-row" role="group" aria-label="评论排序">
          <button type="button" className={sort === "hot" ? "selected" : ""} onClick={() => onSort("hot")}>热门</button>
          <button type="button" className={sort === "new" ? "selected" : ""} onClick={() => onSort("new")}>最新</button>
        </div>
        <div className="comment-panel-body">
          {loading && comments.length === 0 && (
            <div className="comment-panel-skeleton" aria-label="正在加载评论" aria-busy="true">
              {[0, 1, 2, 3].map((row) => (
                <div className="comment-skeleton-row" key={row}>
                  <span className="comment-skeleton-avatar" />
                  <span className="comment-skeleton-lines"><i /><i /></span>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="comments-loading">
              {error}
              <button type="button" className="comment-expand" onClick={onRetry}>重试</button>
            </p>
          )}
          {!loading && !error && roots.length === 0 && <p className="comments-empty">还没有评论，来聊聊你的想法。</p>}
          {roots.map((comment) => {
            const replies = childrenOf(comment.id);
            const attachments = comment.attachments || [];
            const long = comment.body.length > 280;
            const shown = expandedBodies[comment.id] || !long ? comment.body : `${comment.body.slice(0, 280)}…`;
            const threadOpen = Boolean(expandedThreads[comment.id]);
            return (
              <article className="comment" key={comment.id}>
                <div className="comment-avatar" aria-hidden="true">
                  <span>{(comment.name || "探").slice(0, 1)}</span>
                  {comment.avatar && <img src={comment.avatar} alt="" loading="lazy" />}
                </div>
                <div className="comment-content">
                  <div className="comment-heading">
                    <strong>{comment.name || "探索者"}</strong>
                    {postAuthorId && comment.authorId === postAuthorId && <span className="comment-author-badge">作者</span>}
                    {comment.pinned && <span className="comment-pin-badge">置顶</span>}
                    {comment.pending && <span className="comment-edited">发送中…</span>}
                    {comment.failed && <span className="comment-edited">发送失败，内容已恢复</span>}
                  </div>
                  {comment.deleted ? (
                    <p className="comment-body comment-deleted">该评论已删除</p>
                  ) : (
                    <>
                      <p className="comment-body">{renderMentions(shown)}</p>
                      {attachments.length > 0 && (
                        <div className="comment-attachments">
                          {attachments.map((item) => (
                            <a key={item.path} className="comment-attachment" href={item.path} target="_blank" rel="noreferrer noopener">
                              <img src={item.path} alt="评论图片" loading="lazy" width={item.width} height={item.height} />
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {long && (
                    <button type="button" className="comment-expand" onClick={() => setExpandedBodies((current) => ({ ...current, [comment.id]: !current[comment.id] }))}>
                      {expandedBodies[comment.id] ? "收起" : "展开全文"}
                    </button>
                  )}
                  <div className="comment-meta">
                    <time dateTime={new Date(comment.time).toISOString()}>{relativeTime(comment.time)}</time>
                    {comment.edited && !comment.deleted && <span className="comment-edited">已编辑</span>}
                    {!comment.deleted && <button type="button" onClick={() => onReply(comment)}>回复</button>}
                    <details className="comment-actions-menu">
                      <summary aria-label="评论操作"><MoreHorizontal size={15} /></summary>
                      <div className="comment-actions-panel">
                        <button type="button" onClick={() => onCopy(comment)}>复制</button>
                        {accountId && comment.authorId === accountId && !comment.deleted && !comment.pending && !comment.failed && Date.now() - comment.time < 15 * 60 * 1000 && (
                          <button type="button" onClick={() => onEdit(comment)}>编辑</button>
                        )}
                        {accountId && postAuthorId && accountId === postAuthorId && !comment.deleted && !comment.parent && (
                          <button type="button" onClick={() => onPin(comment)}>{comment.pinned ? "取消置顶" : "置顶"}</button>
                        )}
                        {accountId && comment.authorId === accountId && !comment.deleted && !comment.pending && !comment.failed && <button type="button" onClick={() => onDelete(comment)}>删除</button>}
                        {accountId && comment.cloudId && comment.authorId !== accountId && <button type="button" onClick={() => onReport(comment)}>举报</button>}
                      </div>
                    </details>
                  </div>
                  {replies.length > 0 && (
                    <div className="comment-replies">
                      {(threadOpen ? replies : replies.slice(0, 2)).map((reply) => (
                        <div className="comment-reply" key={reply.id}>
                          <div className="comment-avatar small" aria-hidden="true">
                            <span>{(reply.name || "探").slice(0, 1)}</span>
                            {reply.avatar && <img src={reply.avatar} alt="" loading="lazy" />}
                          </div>
                          <div className="comment-reply-content">
                            <div className="comment-reply-heading">
                              <strong>{reply.name || "探索者"}</strong>
                              <span>回复</span>
                              <strong>{reply.replyToName || comment.name || "探索者"}</strong>
                            </div>
                            {reply.deleted ? <p className="comment-deleted">该评论已删除</p> : <p>{renderMentions(reply.body)}</p>}
                            <div className="comment-meta">
                              <time>{relativeTime(reply.time)}</time>
                              <button type="button" onClick={() => onReply({ ...reply, parent: comment.id })}>回复</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {replies.length > 2 && (
                        <button type="button" className="expand-replies" aria-expanded={threadOpen} onClick={() => setExpandedThreads((current) => ({ ...current, [comment.id]: !current[comment.id] }))}>
                          {threadOpen ? "收起回复" : `展开 ${replies.length - 2} 条回复`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`comment-like${comment.liked ? " selected" : ""}`}
                  aria-label={`${comment.liked ? "取消点赞" : "点赞评论"}，${comment.likes}`}
                  aria-pressed={!!comment.liked}
                  onClick={() => onLike(comment)}
                >
                  <Heart size={17} fill={comment.liked ? "currentColor" : "none"} />
                  <span>{comment.likes}</span>
                </button>
              </article>
            );
          })}
          {hasMore && (
            <button type="button" className="comments-load-more" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "正在加载…" : "加载更多评论"}
            </button>
          )}
        </div>
        <div className="comment-panel-composer">{composer}</div>
      </section>
    </div>
  );
}
