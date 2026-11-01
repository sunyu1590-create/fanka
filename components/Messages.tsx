"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
type AuthView = "login" | "signup" | "forgot" | "confirm" | "reset";
export default function Messages({
  initialPeer,
  onPeerOpened,
}: {
  initialPeer?: string | null;
  onPeerOpened?: () => void;
}) {
  const [db, setDb] = useState<SupabaseClient>(),
    [user, setUser] = useState<User | null>(null),
    [authView, setAuthView] = useState<AuthView>("login"),
    [email, setEmail] = useState(""),
    [nickname, setNickname] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [error, setError] = useState(""),
    [authMessage, setAuthMessage] = useState(""),
    [authPurpose, setAuthPurpose] = useState<"signup" | "recovery">("signup"),
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
        if (new URLSearchParams(window.location.search).get("auth") === "reset" || window.location.hash.includes("type=recovery") || sessionStorage.getItem("heika-auth-action") === "reset") {
          setAuthView("reset");
          sessionStorage.removeItem("heika-auth-action");
        }
        const { data } = await client.auth.getUser();
        setUser(data.user);
        const { data: sub } = client.auth.onAuthStateChange(
          (event, session) => {
            if (event === "PASSWORD_RECOVERY") setAuthView("reset");
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
  const auth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db || busy) return;
    setBusy(true); setError(""); setAuthMessage("");
    try {
      if (authView === "signup") {
        setAuthPurpose("signup");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        if (nickname.trim().length < 2 || nickname.trim().length > 24) throw new Error("昵称请填写 2–24 个字。");
        const { data, error } = await db.auth.signUp({
          email: email.trim(), password,
          options: { data: { nickname: nickname.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) { setAuthView("confirm"); setAuthMessage("确认邮件已发送。请前往邮箱完成验证，再回来登录。"); }
        else { setAuthView("login"); setAuthMessage("账号已创建，欢迎来到黑卡。"); }
      } else if (authView === "forgot") {
        const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setAuthPurpose("recovery");
        setAuthView("confirm"); setAuthMessage("如果这个邮箱已注册，密码重置邮件已经发送，请查收邮箱。");
      } else if (authView === "reset") {
        if (password.length < 8) throw new Error("新密码至少需要 8 位。");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState({}, "", window.location.pathname);
        setAuthView("login"); setPassword(""); setConfirmPassword("");
        setAuthMessage("密码已更新，请使用新密码登录。");
      } else {
        const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "操作失败，请稍后重试。";
      setError(message.includes("Invalid login credentials") ? "邮箱或密码不正确。" : message.includes("User already registered") ? "这个邮箱已注册，请直接登录或找回密码。" : message.includes("Password should be") ? "密码至少需要 8 位。" : message);
    } finally { setBusy(false); }
  };
  const resendConfirmation = async () => {
    if (!db || !email.trim()) return;
    setBusy(true); setError(""); setAuthMessage("");
    try {
      const { error } = authPurpose === "signup"
        ? await db.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: window.location.origin } })
        : await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) throw error;
      setAuthMessage(authPurpose === "signup" ? "确认邮件已重新发送，请查收邮箱。" : "如果该邮箱已注册，重置邮件已重新发送。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "邮件发送失败，请稍后重试。"); }
    finally { setBusy(false); }
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
  if (!user || authView === "reset")
    return (
      <section className="page account-page">
        <div className="eyebrow">HEIKA / ACCOUNT</div>
        <h1>{authView === "signup" ? "加入黑卡。" : authView === "forgot" ? "找回密码。" : authView === "reset" ? "设置新密码。" : authView === "confirm" ? "查看邮箱。" : "让交流发生。"}</h1>
        <p className="lead">{authView === "signup" ? "建立你的账号，保存发现并开启交流。" : authView === "reset" ? "为账号设置一个新的登录密码。" : authView === "confirm" ? "完成邮箱验证后，即可继续使用黑卡。" : "登录后，收藏、消息与个人资料会安全保存在账号中。"}</p>
        <form
          className="account-form"
          onSubmit={(e) => void auth(e)}
        >
          {authView === "signup" && <label>昵称<input autoComplete="nickname" required minLength={2} maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="2–24 个字，之后也可以修改" /></label>}
          {authView !== "reset" && authView !== "confirm" && <label>邮箱<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>}
          {(authView === "login" || authView === "signup" || authView === "reset") && <label>{authView === "reset" ? "新密码" : "密码"}<input type="password" autoComplete={authView === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" /></label>}
          {(authView === "signup" || authView === "reset") && <label>确认密码<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再输入一次密码" /></label>}
          {authView !== "confirm" && <button className="primary-button" disabled={!db || busy}>{busy ? "请稍候…" : authView === "signup" ? "创建账号" : authView === "forgot" ? "发送重置邮件" : authView === "reset" ? "更新密码" : "登录"}</button>}
          {authView === "login" && <><button type="button" className="text-button" onClick={() => { setAuthPurpose("recovery"); setAuthView("forgot"); setError(""); setAuthMessage(""); }}>忘记密码？</button><button type="button" className="soft-button" disabled={!db || busy} onClick={() => { setAuthPurpose("signup"); setAuthView("signup"); setError(""); setAuthMessage(""); }}>创建新账号</button></>}
          {authView === "signup" && <button type="button" className="soft-button" onClick={() => { setAuthView("login"); setError(""); setAuthMessage(""); }}>已有账号，返回登录</button>}
          {authView === "forgot" && <button type="button" className="soft-button" onClick={() => { setAuthView("login"); setError(""); setAuthMessage(""); }}>返回登录</button>}
          {authView === "confirm" && <>{email && <button type="button" className="primary-button" disabled={busy} onClick={() => void resendConfirmation()}>{busy ? "正在发送…" : authPurpose === "signup" ? "重新发送确认邮件" : "重新发送重置邮件"}</button>}<button type="button" className="soft-button" onClick={() => { setAuthView("login"); setError(""); }}>返回登录</button></>}
        </form>
        <AnimatedNotice message={error || authMessage} className={authMessage && !error ? "account-success" : undefined} />
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
