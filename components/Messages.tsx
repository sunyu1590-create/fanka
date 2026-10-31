"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { browserDb } from "@/lib/browser-db";
import AnimatedNotice from "./AnimatedNotice";
type Profile = { id: string; nickname: string; bio: string };
type Room = { id: string; user_a: string; user_b: string; created_at?: string };
type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  media_path?: string;
};
export default function Messages({
  initialPeer,
  onPeerOpened,
}: {
  initialPeer?: string | null;
  onPeerOpened?: () => void;
}) {
  const [db, setDb] = useState<SupabaseClient>(),
    [user, setUser] = useState<User | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [people, setPeople] = useState<Profile[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [names, setNames] = useState<Record<string, Profile>>({}),
    [active, setActive] = useState<Room | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [failed, setFailed] = useState<{ id: string; body: string } | null>(null),
    [preview, setPreview] = useState<Record<string, Message>>({}),
    [unread, setUnread] = useState<Record<string, number>>({}),
    [hasMore, setHasMore] = useState(false),
    [newBelow, setNewBelow] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null),
    [blocks, setBlocks] = useState<string[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!db) return;
    let alive = true;
    void Promise.all(
      messages
        .filter((m) => m.media_path)
        .map(async (m) => {
          const { data } = await db.storage
            .from("heika-chat")
            .createSignedUrl(m.media_path!, 900);
          return [m.id, data?.signedUrl || ""] as const;
        }),
    ).then((rows) => {
      if (alive) setMedia(Object.fromEntries(rows));
    });
    return () => {
      alive = false;
    };
  }, [db, messages]);
  const list = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    activeRef = useRef<Room | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  activeRef.current = active;
  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    browserDb()
      .then(async (client) => {
        if (!alive) return;
        setDb(client);
        const { data } = await client.auth.getUser();
        setUser(data.user);
        const { data: sub } = client.auth.onAuthStateChange(
          (event, session) => {
            if (event === "SIGNED_OUT" ||
                (userIdRef.current && userIdRef.current !== session?.user?.id)) {
              setActive(null);
              setMessages([]);
              setRooms([]);
              setPeople([]);
            }
            setUser(session?.user ?? null);
          },
        );
        cleanup = () => sub.subscription.unsubscribe();
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
      cleanup();
    };
  }, []);
  const refresh = async () => {
    if (!db || !user) return;
    const { data, error } = await db
      .from("dm_conversations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      return;
    }
    const rows = (data || []) as Room[];
    setRooms(rows);
    const peers = rows.map((r) => (r.user_a === user.id ? r.user_b : r.user_a));
    if (peers.length) {
      const { data: profiles } = await db
        .from("profiles")
        .select("id,nickname,bio")
        .in("id", peers);
      setNames(Object.fromEntries((profiles || []).map((p) => [p.id, p])));
    }
    const [{ data: reads }, { data: blocked }] = await Promise.all([
      db.from("dm_reads").select("*").eq("user_id", user.id),
      db.from("user_blocks").select("blocked_id").eq("owner_id", user.id),
    ]);
    setBlocks((blocked || []).map((b) => b.blocked_id));
    const latest = await Promise.all(
      rows.map(async (r) => {
        const { data } = await db
          .from("dm_messages")
          .select("*")
          .eq("conversation_id", r.id)
          .order("created_at", { ascending: false })
          .limit(1);
        return [r.id, data?.[0]] as const;
      }),
    );
    setPreview(Object.fromEntries(latest.filter(([, m]) => m)));
    const { data: counts } = await db.rpc("dm_unread_counts");
    setUnread(
      Object.fromEntries(
        (counts || []).map(
          (row: { conversation_id: string; unread: number }) => [
            row.conversation_id,
            Number(row.unread),
          ],
        ),
      ),
    );
  };
  const read = async (room: string) => {
    if (db && user)
      await db
        .from("dm_reads")
        .upsert({
          conversation_id: room,
          user_id: user.id,
          read_at: new Date().toISOString(),
        });
    window.dispatchEvent(new Event("heika-read"));
  };
  const load = async (room: Room, older = false) => {
    if (!db) return;
    let request = db
      .from("dm_messages")
      .select("*")
      .eq("conversation_id", room.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(40);
    if (older && messages[0])
      request = request.or(
        `created_at.lt.${messages[0].created_at},and(created_at.eq.${messages[0].created_at},id.lt.${messages[0].id})`,
      );
    const scrollHeight = list.current?.scrollHeight || 0,
      scrollTop = list.current?.scrollTop || 0;
    const { data, error } = await request;
    if (error) {
      setError(error.message);
      return;
    }
    const rows = ((data || []) as Message[]).reverse();
    setHasMore(rows.length === 40);
    setMessages((old) => (older ? [...rows, ...old] : rows));
    if (older)
      requestAnimationFrame(() => {
        if (list.current)
          list.current.scrollTop =
            scrollTop + list.current.scrollHeight - scrollHeight;
      });
    if (!older) {
      await read(room.id);
      requestAnimationFrame(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight });
        nearBottom.current = true;
      });
    }
  };
  useEffect(() => {
    if (!db || !user) return;
    void refresh();
    const channel = db
      .channel(`heika-inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages" },
        (payload) => {
          void refresh();
          if (payload.eventType === "DELETE") {
            setMessages((old) => old.filter((m) => m.id !== payload.old.id));
            return;
          }
          const row = payload.new as Message;
          if (activeRef.current?.id === row.conversation_id) {
            setMessages((old) =>
              old.some((m) => m.id === row.id) ? old : [...old, row],
            );
            if (nearBottom.current && document.visibilityState === "visible")
              void read(row.conversation_id);
            if (nearBottom.current)
              requestAnimationFrame(() =>
                list.current?.scrollTo({
                  top: list.current.scrollHeight,
                  behavior: "smooth",
                }),
              );
            else setNewBelow(true);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && activeRef.current)
          void load(activeRef.current);
      });
    const recover = () => {
      void refresh();
      if (activeRef.current) void load(activeRef.current);
    };
    window.addEventListener("online", recover);
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => {
      void db.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener("online", recover);
    };
  }, [db, user?.id]);
  const auth = async (signup = false) => {
    if (!db) return;
    setBusy(true);
    setError("");
    const result = signup
      ? await db.auth.signUp({ email, password })
      : await db.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
    else if (signup && !result.data.session)
      setError("请查收邮箱确认邮件后登录。");
    setBusy(false);
  };
  const open = async (peer: Profile) => {
    if (!db) return;
    setBusy(true);
    const { data, error } = await db.rpc("open_dm", { peer: peer.id });
    if (error) setError(error.message);
    else {
      const room = { id: data, user_a: user!.id, user_b: peer.id };
      setNames((old) => ({ ...old, [peer.id]: peer }));
      setActive(room);
      setProfile(null);
      setMessages([]);
      void load(room);
    }
    setBusy(false);
  };
  useEffect(() => {
    if (!initialPeer || !db || !user) return;
    void db
      .from("profiles")
      .select("id,nickname,bio")
      .eq("id", initialPeer)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else if (data) void open(data);
        onPeerOpened?.();
      });
  }, [db, user?.id, initialPeer]);
  const send = async (retry?: { id: string; body: string }) => {
    if (!db || !active || busy) return;
    const pending = retry || { id: crypto.randomUUID(), body: draft.trim() };
    if (!pending.body) return;
    setBusy(true);
    setFailed(null);
    const { data, error } = await db.rpc("send_dm", {
      room: active.id,
      content: pending.body,
      nonce: pending.id,
    });
    if (error) {
      setFailed(pending);
      setError(error.message);
    } else {
      setDraft("");
      setMessages((old) =>
        old.some((m) => m.id === data.id) ? old : [...old, data],
      );
      requestAnimationFrame(() =>
        list.current?.scrollTo({
          top: list.current.scrollHeight,
          behavior: "smooth",
        }),
      );
      void refresh();
    }
    setBusy(false);
  };
  const search = async () => {
    if (!db || !user) return;
    const { data, error } = await db
      .from("profiles")
      .select("id,nickname,bio")
      .neq("id", user.id)
      .ilike("nickname", `%${query.replace(/[%_,]/g, "")}%`)
      .limit(20);
    if (error) setError(error.message);
    setPeople(data || []);
  };
  const report = async (message?: Message) => {
    if (!db || !user) return;
    const reason = prompt("请输入举报原因（至少 3 个字）");
    if (!reason || reason.trim().length < 3) return;
    const { error } = await db
      .from("dm_reports")
      .insert({
        reporter_id: user.id,
        user_id: profile?.id || message?.sender_id || null,
        message_id: message?.id || null,
        reason,
      });
    setError(error?.message || "举报已提交，等待管理员处理。");
  };
  if (!user)
    return (
      <section className="page">
        <div className="eyebrow">MESSAGES / ACCOUNT</div>
        <h1>让交流发生。</h1>
        <p className="lead">使用真实账号登录，消息将安全保存在云端。</p>
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void auth();
          }}
        >
          <label>
            邮箱
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            密码
            <input
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary-button" disabled={!db || busy}>
            登录
          </button>
          <button
            type="button"
            className="soft-button"
            disabled={!db || busy || password.length < 8 || !email}
            onClick={() => void auth(true)}
          >
            注册账号
          </button>
        </form>
        <AnimatedNotice message={error} />
      </section>
    );
  const peer = active
    ? active.user_a === user.id
      ? active.user_b
      : active.user_a
    : "";
  return (
    <section className="page">
      <div className="eyebrow">MESSAGES / PRIVATE</div>
      <h1>消息。</h1>
      <AnimatedNotice message={error} className="settings-note" onClick={() => setError("")} />
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          placeholder="搜索用户昵称，开始交流"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="text-button">
          搜索
        </button>
      </form>
      {people.map((p) => (
        <button
          className="conversation-row"
          key={p.id}
          onClick={() => setProfile(p)}
        >
          <strong>{p.nickname}</strong>
          <small>{p.bio}</small>
        </button>
      ))}
      {rooms
        .sort((a, b) =>
          (preview[b.id]?.created_at || b.created_at || "").localeCompare(
            preview[a.id]?.created_at || a.created_at || "",
          ),
        )
        .map((r) => {
          const id = r.user_a === user.id ? r.user_b : r.user_a;
          return (
            <button
              className="conversation-row"
              key={r.id}
              onClick={() => {
                setActive(r);
                setMessages([]);
                void load(r);
              }}
            >
              <strong>
                {names[id]?.nickname || "探索者"}{" "}
                {unread[r.id] ? `· ${unread[r.id]} 条未读` : ""}
              </strong>
              <small>{preview[r.id]?.body || "尚无消息"}</small>
              <time>
                {preview[r.id]
                  ? new Date(preview[r.id].created_at).toLocaleString("zh-CN")
                  : ""}
              </time>
            </button>
          );
        })}
      {!rooms.length && (
        <div className="empty">还没有会话。搜索其他用户，开始第一段交流。</div>
      )}
      <div className="settings-list">
        <button
          onClick={async () => {
            const { error } = await db!
              .from("browsing_preferences")
              .upsert({ user_id: user.id, dm_permission: "nobody" });
            setError(error?.message || "已关闭陌生人私聊");
          }}
        >
          关闭接收私聊
        </button>
        <button
          onClick={async () => {
            const { error } = await db!
              .from("browsing_preferences")
              .upsert({ user_id: user.id, dm_permission: "everyone" });
            setError(error?.message || "已允许接收私聊");
          }}
        >
          允许接收私聊
        </button>
        {blocks.map((id) => (
          <button
            key={id}
            onClick={async () => {
              await db!
                .from("user_blocks")
                .delete()
                .eq("owner_id", user.id)
                .eq("blocked_id", id);
              void refresh();
            }}
          >
            解除拉黑 · {names[id]?.nickname || id.slice(0, 8)}
          </button>
        ))}
        <button onClick={() => void db?.auth.signOut()}>退出账号</button>
      </div>
      {profile && (
        <div className="modal-backdrop">
          <div className="modal">
            <button className="close" onClick={() => setProfile(null)}>
              关闭
            </button>
            <h2>{profile.nickname}</h2>
            <p>{profile.bio || "这个人还没有写下简介。"}</p>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void open(profile)}
            >
              私聊
            </button>
            <button
              className="soft-button"
              onClick={async () => {
                await db!
                  .from("user_blocks")
                  .upsert({ owner_id: user.id, blocked_id: profile.id });
                setProfile(null);
                void refresh();
              }}
            >
              拉黑
            </button>
            <button className="text-button" onClick={() => void report()}>
              举报用户
            </button>
          </div>
        </div>
      )}
      {active && (
        <div className="chat-screen">
          {selectedMessage && (
            <div className="modal-backdrop">
              <div className="modal">
                <h2>消息操作</h2>
                <div className="settings-list">
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(selectedMessage.body);
                      setSelectedMessage(null);
                    }}
                  >
                    复制文字
                  </button>
                  {selectedMessage.sender_id === user.id && (
                    <button
                      onClick={async () => {
                        const { error } = await db!
                          .from("dm_messages")
                          .delete()
                          .eq("id", selectedMessage.id);
                        if (error) setError(error.message);
                        else
                          setMessages((old) =>
                            old.filter((m) => m.id !== selectedMessage.id),
                          );
                        setSelectedMessage(null);
                      }}
                    >
                      删除自己的消息
                    </button>
                  )}
                  <button
                    onClick={() => {
                      void report(selectedMessage);
                      setSelectedMessage(null);
                    }}
                  >
                    举报
                  </button>
                  <button onClick={() => setSelectedMessage(null)}>取消</button>
                </div>
              </div>
            </div>
          )}
          <header>
            <button
              className="text-button"
              onClick={() => {
                setActive(null);
                void refresh();
              }}
            >
              ← 返回
            </button>
            <button
              className="text-button"
              onClick={() =>
                setProfile(
                  names[peer] || { id: peer, nickname: "探索者", bio: "" },
                )
              }
            >
              {names[peer]?.nickname || "探索者"}
            </button>
          </header>
          <div
            ref={list}
            className="chat-log"
            onScroll={() => {
              const el = list.current!;
              nearBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {hasMore && (
              <button
                className="text-button"
                onClick={() => void load(active, true)}
              >
                加载更早消息
              </button>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`message-bubble ${m.sender_id === user.id ? "own" : ""}`}
                onPointerDown={() => {
                  pressTimer.current = setTimeout(
                    () => setSelectedMessage(m),
                    550,
                  );
                }}
                onPointerUp={() => {
                  if (pressTimer.current) clearTimeout(pressTimer.current);
                }}
                onPointerCancel={() => {
                  if (pressTimer.current) clearTimeout(pressTimer.current);
                }}
                onPointerMove={() => {
                  if (pressTimer.current) clearTimeout(pressTimer.current);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedMessage(m);
                }}
              >
                <p>{m.body}</p>
                {media[m.id] && (
                  <img
                    src={media[m.id]}
                    alt="聊天图片"
                    loading="lazy"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 300,
                      objectFit: "contain",
                    }}
                  />
                )}
                <small>
                  {new Date(m.created_at).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · 已发送
                </small>
                <button
                  className="text-button"
                  onClick={() => navigator.clipboard.writeText(m.body)}
                >
                  复制
                </button>
              </div>
            ))}
          </div>
          {newBelow && (
            <button
              className="soft-button"
              onClick={() => {
                list.current?.scrollTo({
                  top: list.current.scrollHeight,
                  behavior: "smooth",
                });
                setNewBelow(false);
              }}
            >
              有新消息 ↓
            </button>
          )}
          {failed && (
            <button className="soft-button" onClick={() => void send(failed)}>
              发送失败 · 点击重试
            </button>
          )}
          <label className="chat-upload">
            发送图片（JPEG / PNG / WebP，最大 5MB）
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !db || !active) return;
                if (
                  file.size > 5 * 1024 * 1024 ||
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                ) {
                  setError("图片须为 JPEG、PNG、WebP，且不超过 5MB");
                  return;
                }
                setBusy(true);
                try {
                  const nonce = crypto.randomUUID(),
                    path = `${active.id}/${user.id}/${nonce}`;
                  const { error: uploadError } = await db.storage
                    .from("heika-chat")
                    .upload(path, file, { contentType: file.type });
                  if (uploadError) throw uploadError;
                  const { data, error } = await db.rpc("send_dm", {
                    room: active.id,
                    content: "[图片]",
                    nonce,
                    image_path: path,
                  });
                  if (error) throw error;
                  setMessages((old) =>
                    old.some((m) => m.id === data.id) ? old : [...old, data],
                  );
                  void refresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "图片发送失败，请重新选择",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              aria-label="消息内容"
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="写下消息…"
            />
            <button className="primary-button" disabled={busy || !draft.trim()}>
              {busy ? "发送中…" : "发送"}
            </button>
          </form>
          <AnimatedNotice message={error} />
        </div>
      )}
    </section>
  );
}
