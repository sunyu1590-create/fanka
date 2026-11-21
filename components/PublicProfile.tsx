"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Heart, LockKeyhole, MessageCircle, MoreHorizontal, Share2, UserRound } from "lucide-react";
import AnimatedNotice from "./AnimatedNotice";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import ProfileBadgeList, { type ProfileBadge } from "./ProfileBadgeList";
import ProfileHeader from "./ProfileHeader";
import type { CoverMeta } from "./CoverEditor";

type PublicInfo = {
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url?: string | null;
  cover_meta?: Partial<CoverMeta> | null;
  show_bookmarks: boolean;
};
type PublicAttribute = { attribute: "gender" | "mbti" | "birthday" | "hobbies"; value: string };
type ApiPost = {
  id: number;
  cloudId?: string;
  title?: string;
  body?: string;
  image?: string;
  imageRetina?: string;
  thumbnailImages?: string[];
  video?: string;
  date?: string;
  likedAt?: string | null;
};
type ProfileLayout = "masonry" | "list";
type ProfileCollection = { id: string; title: string; kind: string; coverUrl: string | null; publishedCount?: number };
type Section = "posts" | "collections" | "bookmarks" | "likes";

function displayAttributeValue(item: PublicAttribute) {
  if (item.attribute === "gender") return ({ female: "女", male: "男", nonbinary: "非二元", undisclosed: "不愿透露" }[item.value] || item.value);
  if (item.attribute !== "hobbies") return item.value;
  try { return (JSON.parse(item.value) as string[]).join("、"); }
  catch { return item.value; }
}

function gridMedia(post: ApiPost) {
  return post.thumbnailImages?.[0] || post.image || "";
}

function ProfileMedia({ post, layout }: { post: ApiPost; layout: ProfileLayout }) {
  const src = gridMedia(post);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(4 / 5);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setAspectRatio(4 / 5);
  }, [src, post.video]);

  const setNaturalRatio = (width: number, height: number) => {
    if (width > 0 && height > 0) setAspectRatio(width / height);
    setLoaded(true);
  };

  return (
    <span className={`public-profile-cover${loaded ? " is-loaded" : " is-loading"}${failed ? " is-failed" : ""}`} style={layout === "masonry" ? { aspectRatio: String(aspectRatio) } : undefined}>
      {!loaded && !failed && <span className="public-profile-cover-skeleton" aria-hidden="true" />}
      {src ? <img
        src={src}
        alt={post.title ? `${post.title}封面` : "作品封面"}
        loading="lazy"
        decoding="async"
        onLoad={(event) => setNaturalRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
        onError={() => setFailed(true)}
      /> : post.video ? <video
        src={post.video}
        muted
        playsInline
        preload="metadata"
        aria-label="视频作品封面"
        onLoadedMetadata={(event) => setNaturalRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
        onError={() => setFailed(true)}
      /> : null}
      {failed && <span className="public-profile-cover-fallback" role="img" aria-label="图片暂不可用">图片暂不可用</span>}
    </span>
  );
}

export default function PublicProfile({
  id,
  currentUserId,
  accountReady,
  layout,
  onClose,
  onMessage,
  onSelectPost,
  onOpenMine,
  onOpenCollection,
  onNotice,
}: {
  id: string;
  currentUserId: string | null;
  accountReady: boolean;
  layout: ProfileLayout;
  onClose: () => void;
  onMessage: (id: string) => void;
  onSelectPost: (id: number) => void;
  onOpenMine: () => void;
  onOpenCollection?: (seriesId: string) => void;
  onNotice: (message: string) => void;
}) {
  const [profile, setProfile] = useState<PublicInfo>();
  const [attributes, setAttributes] = useState<PublicAttribute[]>([]);
  const [badges, setBadges] = useState<ProfileBadge[]>([]);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [bookmarks, setBookmarks] = useState<ApiPost[]>([]);
  const [likes, setLikes] = useState<ApiPost[]>([]);
  const [collections, setCollections] = useState<ProfileCollection[]>([]);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [section, setSection] = useState<Section>("posts");
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let alive = true;
    setProfile(undefined);
    setAttributes([]);
    setBadges([]);
    setPosts([]);
    setBookmarks([]);
    setLikes([]);
    setCollections([]);
    setFollowing(false);
    setFollowerCount(0);
    setSection("posts");
    setError("");
    setMoreOpen(false);
    void Promise.all([
      cloudFetch(`/api/v1/profiles/${encodeURIComponent(id)}`, { cache: "no-store" }),
      cloudFetch(`/api/v1/creator-follows?creator=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch(`/api/v1/series?creator=${encodeURIComponent(id)}`, { cache: "no-store" }),
    ])
      .then(async ([profileResponse, followResponse, collectionResponse]) => {
        if (!alive) return;
        if (!profileResponse.ok) {
          const payload = await profileResponse.json().catch(() => null);
          setError(payload?.error?.message || "暂时无法加载这位创作者的主页。");
          return;
        }
        const payload = await profileResponse.json();
        const info = payload?.data?.profile as PublicInfo | undefined;
        if (!info) { setError("暂时无法加载这位创作者的主页。"); return; }
        setProfile(info);
        setAttributes((payload?.data?.details || []) as PublicAttribute[]);
        setBadges((payload?.data?.badges || []) as ProfileBadge[]);
        setPosts((payload?.data?.posts || []) as ApiPost[]);
        setBookmarks((payload?.data?.bookmarks || []) as ApiPost[]);
        setLikes((payload?.data?.likes || []) as ApiPost[]);
        if (followResponse.ok) {
          const followData = await followResponse.json();
          if (!alive) return;
          setFollowing(Boolean(followData.data?.following));
          setFollowerCount(Number(followData.data?.followerCount) || 0);
        }
        if (collectionResponse.ok) {
          const collectionPayload = await collectionResponse.json();
          if (!alive) return;
          setCollections(Array.isArray(collectionPayload?.data?.items) ? collectionPayload.data.items : []);
        }
      })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "主页加载失败"); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (moreOpen) setMoreOpen(false);
      else onCloseRef.current();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const isOwnProfile = accountReady && currentUserId === id;
  const canSeeSaved = Boolean(profile?.show_bookmarks);

  const toggleFollow = async () => {
    if (followBusy || isOwnProfile) return;
    setFollowBusy(true);
    try {
      const result = await cloudRequest("/api/v1/creator-follows", { creatorId: id }) as { following: boolean; followerCount: number } | null;
      if (!result) throw new Error("登录后可以关注创作者");
      setFollowing(result.following);
      setFollowerCount(result.followerCount);
      onNotice(result.following ? "已关注" : "已取消关注");
    } catch (cause) { onNotice(cause instanceof Error ? cause.message : "关注失败，请重试"); }
    finally { setFollowBusy(false); }
  };

  const copyText = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(success);
    } catch { onNotice("复制失败，请重试"); }
    setMoreOpen(false);
  };

  const shareProfile = async () => {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("profile", id);
    const title = `${profile?.nickname || "探索者"}的黑卡主页`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: "来黑卡看看这位创作者的分享。", url: url.toString() });
        setMoreOpen(false);
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      onNotice("主页链接已复制");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") { setMoreOpen(false); return; }
      try {
        await navigator.clipboard.writeText(url.toString());
        onNotice("主页链接已复制");
      } catch { onNotice("暂时无法分享，请重试"); }
    }
    setMoreOpen(false);
  };

  const shortDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  };
  const capped = (count: number) => count >= 30 ? "30+" : String(count);

  const tabCount = (key: Section) => {
    if (key === "posts") return capped(posts.length);
    if (key === "collections") return collections.length ? String(collections.length) : "";
    if (key === "bookmarks") return canSeeSaved ? capped(bookmarks.length) : "";
    return canSeeSaved ? capped(likes.length) : "";
  };

  const currentList = section === "posts" ? posts : section === "bookmarks" ? bookmarks : section === "likes" ? likes : [];
  const emptyText = section === "posts"
    ? "还没有发布公开作品。"
    : section === "bookmarks" ? "还没有公开收藏。"
    : section === "likes" ? "还没有公开点赞。" : "还没有创建合集。";

  const facts = attributes.filter((item) => item.value).length ? (
    <div className="profile-hero-facts" aria-label="公开资料">
      {attributes.filter((item) => item.value).flatMap((item) => {
        const values = item.attribute === "hobbies" ? displayAttributeValue(item).split("、").filter(Boolean) : [displayAttributeValue(item)];
        return values.map((value, index) => <span key={`${item.attribute}-${index}`}>
          {item.attribute === "birthday" && <small>生日</small>}
          <strong>{value}</strong>
        </span>);
      })}
    </div>
  ) : null;

  const stats = <div className="profile-hero-stats">
    <button type="button" onClick={() => setSection("posts")} aria-label={`作品 ${posts.length}`}><strong>{capped(posts.length)}</strong><small>作品</small></button>
    <span aria-label={`粉丝 ${followerCount}`}><strong>{followerCount.toLocaleString("zh-CN")}</strong><small>粉丝</small></span>
    <button type="button" onClick={() => setSection("collections")} aria-label={`合集 ${collections.length}`}><strong>{collections.length}</strong><small>合集</small></button>
    {canSeeSaved && <button type="button" onClick={() => setSection("likes")} aria-label={`点赞 ${likes.length}`}><strong>{capped(likes.length)}</strong><small>点赞</small></button>}
  </div>;

  const actions = !accountReady
    ? <span className="public-profile-actions-loading" role="status">正在确认账号…</span>
    : isOwnProfile
      ? <button type="button" className="is-primary" onClick={onOpenMine}>进入我的主页</button>
      : <>
        <button type="button" className={following ? "is-following" : "is-primary"} disabled={followBusy} aria-busy={followBusy} onClick={() => void toggleFollow()}>
          {followBusy ? "处理中…" : following ? "已关注" : "关注"}
        </button>
        <button type="button" onClick={() => onMessage(id)}><MessageCircle size={15} /> 私信</button>
      </>;

  return (
    <main className="public-profile" role="dialog" aria-modal="true" aria-label="个人主页">
      <header className="public-profile-header">
        <button type="button" onClick={onClose} aria-label="返回"><ArrowLeft size={20} /></button>
        <strong>个人主页</strong>
        <div className="public-profile-more-actions">
          <button type="button" aria-label="更多操作" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={21} /></button>
          {moreOpen && <div className="public-profile-more-menu" role="menu" aria-label="个人主页更多操作">
            <button type="button" role="menuitem" onClick={() => void shareProfile()}><Share2 size={15} />分享个人主页</button>
            <button type="button" role="menuitem" onClick={() => void copyText(id, "账号标识已复制")}><Check size={15} />复制账号标识</button>
          </div>}
        </div>
      </header>
      <div className="public-profile-scroll">
        {profile ? (
          <div className="public-profile-content">
            <ProfileHeader
              mode="other"
              nickname={profile.nickname || "探索者"}
              avatar={profile.avatar_url}
              coverUrl={profile.cover_url}
              coverMeta={profile.cover_meta}
              badges={<ProfileBadgeList badges={badges} compact />}
              accountLine={`用户编号 ${id.slice(0, 8).toUpperCase()}`}
              bio={profile.bio?.trim() || undefined}
              facts={facts}
              stats={stats}
              actions={actions}
            >
              <div className="public-profile-tabs" role="tablist" aria-label="主页内容分类">
                {(["posts", "collections", "bookmarks", "likes"] as Section[]).map((key) => {
                  const label = key === "posts" ? "作品" : key === "collections" ? "合集" : key === "bookmarks" ? "收藏" : "点赞";
                  const locked = (key === "bookmarks" || key === "likes") && !canSeeSaved;
                  return <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`public-profile-tab-${key}`}
                    aria-selected={section === key}
                    aria-controls="public-profile-panel"
                    tabIndex={section === key ? 0 : -1}
                    onClick={() => setSection(key)}
                  >
                    {label} {locked ? <LockKeyhole size={13} /> : tabCount(key) ? <small>{tabCount(key)}</small> : null}
                  </button>;
                })}
              </div>
              <div className="public-profile-panel" role="tabpanel" id="public-profile-panel" aria-labelledby={`public-profile-tab-${section}`}>
                {error ? <AnimatedNotice message={error} /> : (section === "bookmarks" || section === "likes") && !canSeeSaved ? (
                  <div className="public-profile-private">
                    <LockKeyhole size={19} />
                    <strong>{section === "bookmarks" ? "收藏" : "点赞"}暂未公开</strong>
                    <span>对方选择了仅自己查看这些内容。</span>
                  </div>
                ) : section === "collections" ? (
                  collections.length ? (
                    <div className="public-profile-collection-row">
                      {collections.map((item) => <button type="button" className="public-profile-collection" key={item.id} onClick={() => onOpenCollection?.(item.id)}>
                        <span className={`public-profile-collection-cover${item.coverUrl ? " has-cover" : ""}`} style={item.coverUrl ? { backgroundImage: `url(${item.coverUrl})` } : undefined} aria-hidden="true" />
                        <span className="public-profile-collection-copy">
                          <strong>{item.title}</strong>
                          <small>{item.publishedCount || 0} 章 · {item.kind === "tutorial" ? "教程" : item.kind === "resource" ? "资源" : "连载"}</small>
                        </span>
                      </button>)}
                    </div>
                  ) : <div className="public-profile-empty">{emptyText}</div>
                ) : currentList.length ? (
                  <div className={`public-profile-grid profile-layout-${layout}`}>
                    {currentList.map((post) => <button type="button" className={`public-profile-post${gridMedia(post) || post.video ? " has-image" : " is-text-only"}`} key={`${section}-${post.id}`} onClick={() => onSelectPost(post.id)}>
                      {(gridMedia(post) || post.video) && <ProfileMedia post={post} layout={layout} />}
                      <span className="public-profile-post-copy">
                        <span className="public-profile-post-title">{post.title || "未命名内容"}</span>
                        <small>
                          {section === "bookmarks" ? "收藏于 " : section === "likes" ? "点赞于 " : "发布于 "}
                          {shortDate(section === "likes" ? post.likedAt : post.date)}
                        </small>
                      </span>
                      {section === "likes" && <span className="public-profile-like-mark" aria-hidden="true"><Heart size={12} /></span>}
                    </button>)}
                  </div>
                ) : <div className="public-profile-empty">{emptyText}</div>}
              </div>
            </ProfileHeader>
          </div>
        ) : error ? <AnimatedNotice message={error} /> : <div className="public-profile-loading">
          <span className="public-profile-loading-avatar" aria-hidden="true"><UserRound size={26} /></span>
          正在加载主页…
        </div>}
      </div>
    </main>
  );
}
