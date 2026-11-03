"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, LockKeyhole, MessageCircle, UserRound } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import AnimatedNotice from "./AnimatedNotice";

type PublicInfo = { nickname: string; bio: string; avatar_url: string | null; show_bookmarks: boolean };
type PublicAttribute = { attribute: "gender" | "mbti" | "birthday" | "hobbies"; value: string };
type ProfilePost = { client_id: number; title: string; body: string; image_url: string | null; created_at?: string; post_media?: { storage_path: string; sort_order: number }[] };

async function withSignedPostImages(db: Awaited<ReturnType<typeof browserDb>>, posts: ProfilePost[]) {
  const paths = [...new Set(posts.flatMap((post) => (post.post_media || []).map((media) => media.storage_path)))];
  if (!paths.length) return posts;
  const batches = Array.from({ length: Math.ceil(paths.length / 100) }, (_, index) => paths.slice(index * 100, (index + 1) * 100));
  const results = await Promise.all(batches.map((batch) => db.storage.from("post-covers").createSignedUrls(batch, 3600)));
  const signed = new Map(results.flatMap(({ data }) => (data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  return posts.map((post) => ({
    ...post,
    image_url: post.image_url || (post.post_media || []).slice().sort((a, b) => a.sort_order - b.sort_order).map((item) => signed.get(item.storage_path)).find(Boolean) || null,
  }));
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
  const [section, setSection] = useState<"posts" | "bookmarks">("posts");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void browserDb()
      .then(async (db) => {
        const [p, a, c] = await Promise.all([
          db.from("profiles").select("nickname,bio,avatar_url,show_bookmarks").eq("id", id).single(),
          db.from("profile_attributes").select("attribute,value").eq("user_id", id).eq("is_public", true),
          db.from("posts").select("client_id,title,body,image_url,created_at,post_media(storage_path,sort_order)").eq("author_id", id).eq("status", "published").order("created_at", { ascending: false }).limit(30),
        ]);
        if (!alive) return;
        if (p.error) { setError(p.error.message); return; }
        const info = p.data as PublicInfo;
        setProfile(info);
        setAttributes((a.data || []) as PublicAttribute[]);
        setPosts(await withSignedPostImages(db, (c.data || []) as ProfilePost[]));
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
              <div className="public-profile-name-block"><h1>{profile.nickname || "探索者"}</h1><p>{profile.bio || "还没有填写简介。"}</p></div>
              <button className="public-profile-message" type="button" onClick={() => onMessage(id)}><MessageCircle size={16}/> 私聊</button>
            </section>
            {!!attributes.filter((item) => item.value).length && <div className="public-profile-facts" aria-label="公开资料">
              {attributes.filter((item) => item.value).map((item) => <span key={item.attribute}><small>{{ gender: "性别", mbti: "MBTI", birthday: "生日", hobbies: "兴趣" }[item.attribute]}</small><strong>{displayAttributeValue(item)}</strong></span>)}
            </div>}
            <div className="public-profile-tabs" role="group" aria-label="主页内容分类">
              <button type="button" aria-pressed={section === "posts"} onClick={() => setSection("posts")}>笔记 <small>{posts.length}</small></button>
              <button type="button" aria-pressed={section === "bookmarks"} onClick={() => setSection("bookmarks")}>收藏 {profile.show_bookmarks ? <small>{bookmarks.length}</small> : <LockKeyhole size={13}/>}</button>
              <i className={section === "bookmarks" ? "is-bookmarks" : ""}/>
            </div>
            {error ? <AnimatedNotice message={error}/> : section === "bookmarks" && !profile.show_bookmarks ? (
              <div className="public-profile-private"><LockKeyhole size={21}/><strong>收藏暂未公开</strong><span>对方选择了仅自己查看收藏内容。</span></div>
            ) : displayedPosts.length ? (
              <div className={`public-profile-grid profile-layout-${layout}`}>
                {displayedPosts.map((post) => <button type="button" className={`public-profile-post${post.image_url ? " has-image" : " is-text-only"}`} key={`${section}-${post.client_id}`} onClick={() => onSelectPost(post.client_id)}>
                  {post.image_url && <img src={post.image_url} alt="" loading="lazy" decoding="async"/>}
                  <span className="public-profile-post-copy">
                    <span className="public-profile-post-title">{post.title || "未命名内容"}</span>
                    {layout === "masonry" && post.body && <span className="public-profile-post-excerpt">{post.body}</span>}
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
