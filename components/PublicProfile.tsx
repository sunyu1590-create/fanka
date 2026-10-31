"use client";
import { useEffect, useState } from "react";
import { browserDb } from "@/lib/browser-db";
import AnimatedNotice from "./AnimatedNotice";
type PublicInfo = { nickname: string; bio: string; avatar_url: string | null };
export default function PublicProfile({
  id,
  onClose,
  onMessage,
}: {
  id: string;
  onClose: () => void;
  onMessage: (id: string) => void;
}) {
  const [profile, setProfile] = useState<PublicInfo>(),
    [posts, setPosts] = useState<
      { client_id: number; title: string; body: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void browserDb()
      .then(async (db) => {
        const [p, c] = await Promise.all([
          db
            .from("profiles")
            .select("nickname,bio,avatar_url")
            .eq("id", id)
            .single(),
          db
            .from("posts")
            .select("client_id,title,body")
            .eq("author_id", id)
            .eq("status", "published")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        if (!alive) return;
        if (p.error) setError(p.error.message);
        else {
          setProfile(p.data);
          setPosts(c.data || []);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <div className="modal-backdrop public-profile">
      <div className="modal">
        <button className="close" onClick={onClose}>
          关闭
        </button>
        {profile ? (
          <>
            <div className="eyebrow">PUBLIC / PROFILE</div>
            {profile.avatar_url && (
              <img
                className="profile-photo"
                src={profile.avatar_url}
                alt="用户头像"
              />
            )}
            <h2>{profile.nickname}</h2>
            <p>{profile.bio || "还没有填写简介。"}</p>
            <button className="primary-button" onClick={() => onMessage(id)}>
              发起私聊
            </button>
            <div className="section-head">
              <h2>公开内容</h2>
            </div>
            {posts.map((post) => (
              <details key={post.client_id}>
                <summary>{post.title}</summary>
                <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
                  {post.body}
                </p>
              </details>
            ))}
            {!posts.length && <p>还没有公开内容。</p>}
          </>
        ) : error ? (
          <AnimatedNotice message={error} />
        ) : (
          <p>正在加载主页…</p>
        )}
      </div>
    </div>
  );
}
