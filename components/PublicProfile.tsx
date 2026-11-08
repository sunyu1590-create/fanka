"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, LockKeyhole, MessageCircle, MoreHorizontal, Share2, UserRound } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import AnimatedNotice from "./AnimatedNotice";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { mediaBucketForPath, isVideoMediaPath } from "@/lib/media-path";

type PublicInfo = { nickname: string | null; bio: string | null; avatar_url: string | null; show_bookmarks: boolean };
type PublicAttribute = { attribute: "gender" | "mbti" | "birthday" | "hobbies"; value: string };
type ProfilePost = { client_id: number; title: string; body: string; image_url: string | null; video_url?: string | null; created_at?: string; post_media?: { storage_path: string; sort_order: number }[] };
type ProfileLayout = "masonry" | "list";

async function withSignedPostImages(db: Awaited<ReturnType<typeof browserDb>>, posts: ProfilePost[]) {
  const paths = [...new Set(posts.flatMap((post) => (post.post_media || []).map((media) => media.storage_path)))];
  if (!paths.length) return posts;
  const buckets = new Map<string, string[]>();
  for (const path of paths) {
    const bucket = mediaBucketForPath(path);
    buckets.set(bucket, [...(buckets.get(bucket) || []), path]);
  }
  const results = await Promise.all([...buckets].flatMap(([bucket, bucketPaths]) => {
    const batches = Array.from({ length: Math.ceil(bucketPaths.length / 100) }, (_, index) => bucketPaths.slice(index * 100, (index + 1) * 100));
    return batches.map((batch) => db.storage.from(bucket).createSignedUrls(batch, 3600));
  }));
  const signed = new Map(results.flatMap(({ data }) => (data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  return posts.map((post) => {
    const paths = (post.post_media || []).slice().sort((a, b) => a.sort_order - b.sort_order).map((item) => item.storage_path);
    const image = paths.find((path) => !isVideoMediaPath(path));
    const video = paths.find(isVideoMediaPath);
    return {
      ...post,
      image_url: post.image_url || (image ? signed.get(image) : null) || null,
      video_url: video ? signed.get(video) || null : null,
    };
  });
}

function displayAttributeValue(item: PublicAttribute) {
  if (item.attribute === "gender") return ({ female: "女", male: "男", nonbinary: "非二元", undisclosed: "不愿透露" }[item.value] || item.value);
  if (item.attribute !== "hobbies") return item.value;
  try { return (JSON.parse(item.value) as string[]).join("、"); }
  catch { return item.value; }
}

function ProfileMedia({ post, layout }: { post: ProfilePost; layout: ProfileLayout }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(4 / 5);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setAspectRatio(4 / 5);
  }, [post.image_url, post.video_url]);

  const setNaturalRatio = (width: number, height: number) => {
    if (width > 0 && height > 0) setAspectRatio(width / height);
    setLoaded(true);
  };

  return (
    <span className={`public-profile-cover${loaded ? " is-loaded" : " is-loading"}${failed ? " is-failed" : ""}`} style={layout === "masonry" ? { aspectRatio: String(aspectRatio) } : undefined}>
      {!loaded && !failed && <span className="public-profile-cover-skeleton" aria-hidden="true" />}
      {post.image_url ? <img
        src={post.image_url}
        alt={post.title ? `${post.title}封面` : "作品封面"}
        loading="lazy"
        decoding="async"
        onLoad={(event) => setNaturalRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
        onError={() => setFailed(true)}
      /> : post.video_url ? <video
        src={post.video_url}
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
  onNotice: (message: string) => void;
}) {
  const [profile, setProfile] = useState<PublicInfo>();
  const [attributes, setAttributes] = useState<PublicAttribute[]>([]);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [bookmarks, setBookmarks] = useState<ProfilePost[]>([]);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [section, setSection] = useState<"posts" | "bookmarks">("posts");
  const [error, setError] = useState("");
  const [bioExpanded, setBioExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let alive = true;
    setProfile(undefined);
    setAttributes([]);
    setPosts([]);
    setBookmarks([]);
    setFollowing(false);
    setFollowerCount(0);
    setSection("posts");
    setError("");
    setBioExpanded(false);
    setMoreOpen(false);
    setAvatarFailed(false);
    void browserDb()
      .then(async (db) => {
        const [p, a, c, followResponse] = await Promise.all([
          db.from("profiles").select("nickname,bio,avatar_url,show_bookmarks").eq("id", id).single(),
          db.from("profile_attributes").select("attribute,value").eq("user_id", id).eq("is_public", true),
          db.from("posts").select("client_id,title,body,image_url,created_at,post_media(storage_path,sort_order)").eq("author_id", id).eq("status", "published").order("created_at", { ascending: false }).limit(30),
          cloudFetch(`/api/v1/creator-follows?creator=${encodeURIComponent(id)}`, { cache: "no-store" }),
        ]);
        if (!alive) return;
        if (p.error) { setError(p.error.message); return; }
        const info = p.data as PublicInfo;
        setProfile(info);
        setAttributes((a.data || []) as PublicAttribute[]);
        if (c.error) { setError("暂时无法加载公开内容。"); return; }
        const signedPosts = await withSignedPostImages(db, (c.data || []) as ProfilePost[]);
        if (!alive) return;
        setPosts(signedPosts);
        if (followResponse.ok) {
          const followData = await followResponse.json();
          if (!alive) return;
          setFollowing(Boolean(followData.data?.following));
          setFollowerCount(Number(followData.data?.followerCount) || 0);
        }
        if (info.show_bookmarks) {
          const saved = await db.from("bookmarks").select("created_at,posts(client_id,title,body,image_url,post_media(storage_path,sort_order))").eq("user_id", id).order("created_at", { ascending: false }).limit(30);
          if (!alive) return;
          if (saved.error) { setError("暂时无法加载公开收藏。"); return; }
          const bookmarkPosts = (saved.data || []).flatMap((row) => {
            const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
            return post ? [{ ...post, created_at: row.created_at } as ProfilePost] : [];
          });
          const signedBookmarks = await withSignedPostImages(db, bookmarkPosts);
          if (!alive) return;
          setBookmarks(signedBookmarks);
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
  const displayedPosts = section === "posts" ? posts : bookmarks;
  const bio = profile?.bio?.trim() || "还没有填写简介。";
  const canExpandBio = Boolean(profile?.bio && profile.bio.trim().length > 76);

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

  const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) : "黑卡内容";

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
            <section className="public-profile-identity">
              {profile.avatar_url && !avatarFailed ? <img className="public-profile-avatar" src={profile.avatar_url} alt={`${profile.nickname || "探索者"}的头像`} onError={() => setAvatarFailed(true)} /> : <div className="public-profile-avatar public-profile-avatar-placeholder"><UserRound size={29}/></div>}
              <div className="public-profile-name-block">
                <h1>{profile.nickname || "探索者"}</h1>
                <div className="public-profile-account"><span>HEIKA 创作者</span><span aria-hidden="true">·</span><span>UID {id.slice(0, 8).toUpperCase()}</span></div>
              </div>
            </section>
            <div className="public-profile-bio-block">
              <p className={bioExpanded ? "is-expanded" : ""}>{bio}</p>
              {canExpandBio && <button type="button" aria-expanded={bioExpanded} onClick={() => setBioExpanded((expanded) => !expanded)}>{bioExpanded ? "收起" : "展开"}</button>}
            </div>
            {!!attributes.filter((item) => item.value).length && <div className="public-profile-facts" aria-label="公开资料">
              {attributes.filter((item) => item.value).flatMap((item) => {
                const values = item.attribute === "hobbies" ? displayAttributeValue(item).split("、").filter(Boolean) : [displayAttributeValue(item)];
                return values.map((value, index) => <span key={`${item.attribute}-${index}`}>{item.attribute !== "hobbies" && item.attribute !== "gender" && item.attribute !== "mbti" && <small>{{ birthday: "生日" }[item.attribute]}</small>}<strong>{value}</strong></span>);
              })}
            </div>}
            <section className="public-profile-overview" aria-label="主页数据与操作">
              <div className="public-profile-stats">
                <button type="button" onClick={() => setSection("posts")} aria-label={`笔记 ${posts.length}`}><strong>{posts.length === 30 ? "30+" : posts.length}</strong><small>笔记</small></button>
                <span aria-label={`粉丝 ${followerCount}`}><strong>{followerCount.toLocaleString("zh-CN")}</strong><small>粉丝</small></span>
                {profile.show_bookmarks && <button type="button" onClick={() => setSection("bookmarks")} aria-label={`公开收藏 ${bookmarks.length}`}><strong>{bookmarks.length === 30 ? "30+" : bookmarks.length}</strong><small>收藏</small></button>}
              </div>
              <div className="public-profile-actions">
                {!accountReady ? <span className="public-profile-actions-loading" role="status">正在确认账号…</span> : isOwnProfile ? <button className="public-profile-own" type="button" onClick={onOpenMine}>进入我的主页 <ChevronRight size={15}/></button> : <>
                  <button className={`public-profile-follow${following ? " is-following" : ""}`} type="button" disabled={followBusy} aria-busy={followBusy} onClick={() => void toggleFollow()}>{followBusy ? "处理中…" : following ? "已关注" : "关注"}</button>
                  <button className="public-profile-message" type="button" onClick={() => onMessage(id)}><MessageCircle size={15}/> 私信</button>
                </>}
              </div>
            </section>
            <div className="public-profile-tabs" role="tablist" aria-label="主页内容分类">
              <button type="button" id="public-profile-tab-posts" role="tab" aria-selected={section === "posts"} aria-controls="public-profile-panel" tabIndex={section === "posts" ? 0 : -1} onClick={() => setSection("posts")}>笔记 <small>{posts.length === 30 ? "30+" : posts.length}</small></button>
              <button type="button" id="public-profile-tab-bookmarks" role="tab" aria-selected={section === "bookmarks"} aria-controls="public-profile-panel" tabIndex={section === "bookmarks" ? 0 : -1} onClick={() => setSection("bookmarks")}>收藏 {profile.show_bookmarks ? <small>{bookmarks.length === 30 ? "30+" : bookmarks.length}</small> : <LockKeyhole size={13}/>}</button>
              <i className={section === "bookmarks" ? "is-bookmarks" : ""} aria-hidden="true"/>
            </div>
            <div className="public-profile-panel" role="tabpanel" id="public-profile-panel" aria-labelledby={section === "posts" ? "public-profile-tab-posts" : "public-profile-tab-bookmarks"}>
              {error ? <AnimatedNotice message={error}/> : section === "bookmarks" && !profile.show_bookmarks ? (
                <div className="public-profile-private"><LockKeyhole size={19}/><strong>收藏暂未公开</strong><span>对方选择了仅自己查看收藏内容。</span></div>
              ) : displayedPosts.length ? (
                <div className={`public-profile-grid profile-layout-${layout}`}>
                  {displayedPosts.map((post) => <button type="button" className={`public-profile-post${post.image_url || post.video_url ? " has-image" : " is-text-only"}`} key={`${section}-${post.client_id}`} onClick={() => onSelectPost(post.client_id)}>
                    {(post.image_url || post.video_url) && <ProfileMedia post={post} layout={layout} />}
                    <span className="public-profile-post-copy">
                      <span className="public-profile-post-title">{post.title || "未命名内容"}</span>
                      <small>{section === "bookmarks" ? "收藏于 " : "发布于 "}{formatDate(post.created_at)}</small>
                    </span>
                  </button>)}
                </div>
              ) : <div className="public-profile-empty">{section === "posts" ? "还没有发布公开内容。" : "还没有公开收藏。"}</div>}
            </div>
          </div>
        ) : error ? <AnimatedNotice message={error}/> : <div className="public-profile-loading">正在加载主页…</div>}
      </div>
    </main>
  );
}
