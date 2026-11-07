"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, LockKeyhole, MessageCircle, UserRound } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import AnimatedNotice from "./AnimatedNotice";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { markdownToText } from "./MarkdownContent";
import { mediaBucketForPath, isVideoMediaPath } from "@/lib/media-path";

type PublicInfo = { nickname: string; bio: string; avatar_url: string | null; show_bookmarks: boolean };
type PublicAttribute = { attribute: "gender" | "mbti" | "birthday" | "hobbies"; value: string };
type ProfilePost = { client_id: number; title: string; body: string; image_url: string | null; video_url?: string | null; created_at?: string; post_media?: { storage_path: string; sort_order: number }[] };

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

export default function PublicProfile({
  id,
  layout,
  onClose,
  onMessage,
  onSelectPost,
}: {
  id: string;
  layout: "masonry" | "list";
  onClose: () => void;
  onMessage: (id: string) => void;
  onSelectPost: (id: number) => void;
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

  useEffect(() => {
    let alive = true;
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
        setPosts(await withSignedPostImages(db, (c.data || []) as ProfilePost[]));
        const followData = await followResponse.json();
        if (followResponse.ok) { setFollowing(Boolean(followData.data?.following)); setFollowerCount(Number(followData.data?.followerCount) || 0); }
        if (info.show_bookmarks) {
          const saved = await db.from("bookmarks").select("created_at,posts(client_id,title,body,image_url,post_media(storage_path,sort_order))").eq("user_id", id).order("created_at", { ascending: false }).limit(30);
          if (!alive) return;
          if (saved.error) { setError("暂时无法加载公开收藏。"); return; }
          const bookmarkPosts = (saved.data || []).flatMap((row) => {
            const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
            return post ? [{ ...post, created_at: row.created_at } as ProfilePost] : [];
          });
          setBookmarks(await withSignedPostImages(db, bookmarkPosts));
        }
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "主页加载失败"); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const displayedPosts = section === "posts" ? posts : bookmarks;
  const toggleFollow = async () => {
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const result = await cloudRequest("/api/v1/creator-follows", { creatorId: id }) as { following: boolean; followerCount: number } | null;
      if (!result) throw new Error("登录后可以关注创作者");
      setFollowing(result.following); setFollowerCount(result.followerCount);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "关注失败，请重试"); }
    finally { setFollowBusy(false); }
  };

  return (
    <main className="public-profile" role="dialog" aria-modal="true" aria-label="个人主页">
      <header className="public-profile-header">
        <button type="button" onClick={onClose} aria-label="返回"><ArrowLeft size={20} /></button>
        <strong>个人主页</strong>
        <span aria-hidden="true" />
      </header>
      <div className="public-profile-scroll">
        {profile ? (
          <div className="public-profile-content">
            <section className="public-profile-identity">
              {profile.avatar_url ? <img className="public-profile-avatar" src={profile.avatar_url} alt={`${profile.nickname}的头像`} /> : <div className="public-profile-avatar public-profile-avatar-placeholder"><UserRound size={31}/></div>}
              <div className="public-profile-name-block"><h1>{profile.nickname || "探索者"}</h1></div>
            </section>
            <p className="public-profile-bio">{profile.bio || "还没有填写简介。"}</p>
            {!!attributes.filter((item) => item.value).length && <div className="public-profile-facts" aria-label="公开资料">
              {attributes.filter((item) => item.value).flatMap((item) => {
                const values = item.attribute === "hobbies" ? displayAttributeValue(item).split("、").filter(Boolean) : [displayAttributeValue(item)];
                return values.map((value, index) => <span key={`${item.attribute}-${index}`}>{item.attribute !== "hobbies" && item.attribute !== "gender" && item.attribute !== "mbti" && <small>{{ birthday: "生日" }[item.attribute]}</small>}<strong>{value}</strong></span>);
              })}
            </div>}
            <section className="public-profile-overview" aria-label="主页数据与操作">
              <div className="public-profile-stats">
                <span><strong>{posts.length === 30 ? "30+" : posts.length}</strong><small>笔记</small></span>
                <span><strong>{followerCount.toLocaleString("zh-CN")}</strong><small>粉丝</small></span>
                {profile.show_bookmarks && <span><strong>{bookmarks.length === 30 ? "30+" : bookmarks.length}</strong><small>公开收藏</small></span>}
              </div>
              <div className="public-profile-actions"><button className={`public-profile-follow${following ? " is-following" : ""}`} type="button" disabled={followBusy} onClick={() => void toggleFollow()}>{following ? "已关注" : "+ 关注"}</button><button className="public-profile-message" type="button" onClick={() => onMessage(id)}><MessageCircle size={16}/> 私聊</button></div>
            </section>
            <div className="public-profile-tabs" role="group" aria-label="主页内容分类">
              <button type="button" aria-pressed={section === "posts"} onClick={() => setSection("posts")}>笔记 <small>{posts.length}</small></button>
              <button type="button" aria-pressed={section === "bookmarks"} onClick={() => setSection("bookmarks")}>收藏 {profile.show_bookmarks ? <small>{bookmarks.length}</small> : <LockKeyhole size={13}/>}</button>
              <i className={section === "bookmarks" ? "is-bookmarks" : ""}/>
            </div>
            {error ? <AnimatedNotice message={error}/> : section === "bookmarks" && !profile.show_bookmarks ? (
              <div className="public-profile-private"><LockKeyhole size={21}/><strong>收藏暂未公开</strong><span>对方选择了仅自己查看收藏内容。</span></div>
            ) : displayedPosts.length ? (
              <div className={`public-profile-grid profile-layout-${layout}`}>
                {displayedPosts.map((post) => <button type="button" className={`public-profile-post${post.image_url || post.video_url ? " has-image" : " is-text-only"}`} key={`${section}-${post.client_id}`} onClick={() => onSelectPost(post.client_id)}>
                  {post.image_url && <img src={post.image_url} alt="" loading="lazy" decoding="async"/>}
                  {!post.image_url && post.video_url && <video src={post.video_url} muted playsInline preload="metadata" aria-label="视频作品封面"/>}
                  <span className="public-profile-post-copy">
                    <span className="public-profile-post-title">{post.title || "未命名内容"}</span>
                    {layout === "masonry" && post.body && <span className="public-profile-post-excerpt">{markdownToText(post.body)}</span>}
                    {section === "posts" && <small>{post.created_at ? new Date(post.created_at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) : "黑卡内容"}</small>}
                  </span>
                  {layout === "list" && <ChevronRight size={15}/>}
                </button>)}
              </div>
            ) : <div className="public-profile-empty">{section === "posts" ? "还没有发布公开内容。" : "还没有公开收藏。"}</div>}
          </div>
        ) : error ? <AnimatedNotice message={error}/> : <div className="public-profile-loading">正在加载主页…</div>}
      </div>
    </main>
  );
}
