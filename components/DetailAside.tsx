"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ListTree, MessageSquare, UserCheck, UserPlus } from "lucide-react";
import type { Post } from "@/lib/content";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { ProfileBadgeMarks } from "./ProfileBadgeList";

type TocItem = { id: string; text: string; level: number };

type Props = {
  post: Post;
  accountId: string | null;
  related: Post[];
  onOpenAuthor: (id: string) => void;
  onOpenPost: (post: Post) => void;
  onMessage: (id: string) => void;
  onNotice: (message: string) => void;
  /** 独立详情页：用窗口滚动，目录高亮与跳转的参照系随之改变。 */
  pageMode?: boolean;
};

/**
 * 桌面长文右辅助栏：作者 → 目录 → 少量相关内容。
 * 目录从正文真实标题生成（含 MarkdownContent 渲染出的 h2/h3），无标题时整块不出现。
 */
export default function DetailAside({ post, accountId, related, onOpenAuthor, onOpenPost, onMessage, onNotice, pageMode = false }: Props) {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [tocOpen, setTocOpen] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const tocRef = useRef<HTMLDivElement | null>(null);

  const isSelf = Boolean(accountId && post.authorId && accountId === post.authorId);

  // 目录：扫正文真实标题。正文里有异步内容（AI 资源详情、附件），600ms 后补扫一次。
  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    const scan = () => {
      const article = document.getElementById("detail-article");
      if (!article) return;
      const headings = Array.from(article.querySelectorAll("h2, h3")) as HTMLElement[];
      const items: TocItem[] = headings
        .map((node, index) => {
          const text = (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 42);
          if (!text) return null;
          const id = node.id || `detail-toc-${index + 1}`;
          node.id = id;
          return { id, text, level: node.tagName === "H3" ? 3 : 2 };
        })
        .filter((item): item is TocItem => Boolean(item));
      setToc(items);
      if (!items.length) return;
      observer?.disconnect();
      observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) {
          const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          setActiveId(top.target.id);
        }
      }, {
        root: pageMode ? null : article.closest(".detail-scroll"),
        rootMargin: pageMode ? "-84px 0px -58% 0px" : "-72px 0px -60% 0px",
        threshold: [0, 1],
      });
      headings.forEach((node) => { if (node.id) observer!.observe(node); });
    };
    scan();
    const retry = window.setTimeout(scan, 700);
    return () => {
      window.clearTimeout(retry);
      observer?.disconnect();
    };
  }, [post.id, post.title, pageMode]);

  // 关注状态：只读接口，登录后才有 following。
  useEffect(() => {
    if (!post.authorId || isSelf) { setFollowing(false); setFollowerCount(0); return; }
    let alive = true;
    void cloudFetch(`/api/v1/creator-follows?creator=${encodeURIComponent(post.authorId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!alive) return;
        const data = payload?.data;
        if (!data) return;
        setFollowing(Boolean(data.following));
        setFollowerCount(Number(data.followerCount || 0));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [post.authorId, isSelf, accountId]);

  const toggleFollow = useCallback(async () => {
    if (!post.authorId) return;
    if (!accountId) { onNotice("登录后可以关注作者"); return; }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const result = await cloudRequest("/api/v1/creator-follows", { creatorId: post.authorId }) as { following?: boolean; followerCount?: number } | null;
      const next = Boolean(result?.following);
      setFollowing(next);
      setFollowerCount(Number(result?.followerCount ?? followerCount + (next ? 1 : -1)));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "关注失败，请稍后重试");
    } finally {
      setFollowBusy(false);
    }
  }, [accountId, followBusy, followerCount, onNotice, post.authorId]);

  const jumpTo = useCallback((id: string) => {
    const node = document.getElementById(id);
    if (!node) return;
    const scroller = document.querySelector<HTMLElement>(".detail-scroll");
    const pageScroll = pageMode || !scroller;
    if (!pageScroll && scroller) {
      const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 68;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      const top = node.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
    setActiveId(id);
  }, [pageMode]);

  const relatedItems = useMemo(() => related.filter((item) => item.id !== post.id).slice(0, 3), [related, post.id]);

  return (
    <aside className="detail-aside" aria-label="作者、目录与相关内容">
      <section className="detail-aside-card detail-author-card">
        <div className="detail-author-head">
          <button type="button" className="detail-author-avatar" onClick={() => post.authorId && onOpenAuthor(post.authorId)} aria-label={`查看 ${post.author} 的主页`}>
            {post.authorAvatar ? <img src={post.authorAvatar} alt="" loading="lazy" /> : <span>{(post.author || "探").slice(0, 1)}</span>}
          </button>
          <div className="detail-author-copy">
            <button type="button" className="detail-author-name" onClick={() => post.authorId && onOpenAuthor(post.authorId)}>
              <strong>{post.author}</strong>
              <ProfileBadgeMarks badges={post.authorBadges || []} />
            </button>
            <small>{post.date}{followerCount > 0 ? ` · ${followerCount} 位关注者` : ""}</small>
          </div>
        </div>
        <p className="detail-author-bio">{post.authorBio?.trim() || "还没有留下个人简介。"}</p>
        {!isSelf && (
          <div className="detail-author-actions">
            <button type="button" className={`detail-follow${following ? " is-following" : ""}`} disabled={followBusy} onClick={() => void toggleFollow()} aria-pressed={following}>
              {following ? <UserCheck size={15} /> : <UserPlus size={15} />}
              {following ? "已关注" : "关注"}
            </button>
            <button type="button" className="detail-message" onClick={() => post.authorId && onMessage(post.authorId)}>
              <MessageSquare size={15} /> 私信
            </button>
          </div>
        )}
      </section>

      {toc.length > 0 && (
        <section className="detail-aside-card detail-toc" ref={tocRef}>
          <button type="button" className="detail-toc-head" aria-expanded={tocOpen} onClick={() => setTocOpen((open) => !open)}>
            <span><ListTree size={14} /> 目录 <b>{toc.length}</b></span>
            <ChevronDown size={15} className={tocOpen ? "" : "is-collapsed"} />
          </button>
          {tocOpen && (
            <nav className="detail-toc-list" aria-label="文章目录">
              {toc.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${activeId === item.id ? "active" : ""}${item.level === 3 ? " is-sub" : ""}`}
                  onClick={() => jumpTo(item.id)}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          )}
        </section>
      )}

      {relatedItems.length > 0 && (
        <section className="detail-aside-card detail-related">
          <h2>相关内容</h2>
          {relatedItems.map((item) => (
            <button key={item.id} type="button" className="detail-related-item" onClick={() => onOpenPost(item)}>
              <span className="detail-related-thumb" aria-hidden="true">
                {item.image || item.images?.[0] ? <img src={item.image || item.images?.[0]} alt="" loading="lazy" /> : <i>{item.tag}</i>}
              </span>
              <span className="detail-related-copy">
                <strong>{item.title}</strong>
                <small>{item.author} · {item.date}</small>
              </span>
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
