"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ArrowLeft, ArrowUp, Bell, FileImage, MessageCircle, MoreHorizontal, Pin, Search, Users } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import { cloudRequest } from "@/lib/cloud";
import { authRedirectUrl } from "@/lib/auth-redirect";
import { promptInApp } from "@/lib/in-app-dialog";
import { clearInboxSummary, readInboxSummary } from "@/lib/inbox-summary";
import AnimatedNotice from "./AnimatedNotice";
import RecoveryCodesPage from "./RecoveryCodesPage";
import InvitationWelcomePage, { type InvitationWelcome } from "./InvitationWelcomePage";
import type { NoticeOptions } from "./NoticeBanner";
import { compressUploadImage, MAX_UPLOAD_IMAGE_BYTES } from "@/lib/image-compression";
import ProfileBadgeList, { type ProfileBadge } from "./ProfileBadgeList";
type Profile = { id: string; nickname: string; bio: string; avatar_url?: string | null; badges?: ProfileBadge[] };
type Room = { id: string; user_a: string; user_b: string; created_at?: string };
type OfficialNotice = { id: string; title: string; body: string; image_url: string | null; action_label: string | null; action_url: string | null; published_at: string; delivered_at: string; read_at: string | null };
/** 撤回窗口（秒），与服务端 180 秒保持一致。 */
const RECALL_SECONDS = 180;

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  media_path?: string;
};
type AuthView = "login" | "signup" | "forgot" | "verify-otp" | "recover-code" | "confirm" | "reset" | "codes" | "invite-welcome";
export default function Messages({
  initialPeer,
  onPeerOpened,
  onConversationChange,
  onOpenProfile,
  onOpenNotifications,
  onNotice,
  onOpenConversationPeer,
  messageNotificationsEnabled = false,
  isActive = true,
}: {
  initialPeer?: string | null;
  onPeerOpened?: () => void;
  onConversationChange?: (isOpen: boolean) => void;
  onOpenProfile?: (id: string) => void;
  onOpenNotifications?: () => void;
  onNotice?: (message: string, options?: NoticeOptions) => void;
  onOpenConversationPeer?: (id: string) => void;
  messageNotificationsEnabled?: boolean;
  isActive?: boolean;
}) {
  const [db, setDb] = useState<SupabaseClient>(),
    [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [authView, setAuthView] = useState<AuthView>("login"),
    [email, setEmail] = useState(""),
    [nickname, setNickname] = useState(""),
    [inviteCode, setInviteCode] = useState(""),
    [pendingInvitation, setPendingInvitation] = useState<InvitationWelcome | null>(null),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [recoveryCode, setRecoveryCode] = useState(""),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]),
    [authMessage, setAuthMessage] = useState(""),
    [resendSeconds, setResendSeconds] = useState(0),
    [authPurpose, setAuthPurpose] = useState<"signup" | "recovery">("signup"),
    [busy, setBusy] = useState(false),
    [inboxMode, setInboxMode] = useState<"chats" | "people">("chats"),
    [inboxFilter, setInboxFilter] = useState<"all" | "unread">("all"),
    [query, setQuery] = useState(""),
    [people, setPeople] = useState<Profile[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [officialNotices, setOfficialNotices] = useState<OfficialNotice[]>([]),
    [officialInboxOpen, setOfficialInboxOpen] = useState(false),
    [names, setNames] = useState<Record<string, Profile>>({}),
    [active, setActive] = useState<Room | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [failed, setFailed] = useState<{ id: string; body: string } | null>(null),
    [preview, setPreview] = useState<Record<string, Message>>({}),
    [unread, setUnread] = useState<Record<string, number>>({}),
    [hasMore, setHasMore] = useState(false),
    [newBelow, setNewBelow] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null);
  const [pinnedRooms, setPinnedRooms] = useState<string[]>([]);
  const updateActiveConversation = useCallback((room: Room | null) => {
    setActive(room);
    onConversationChange?.(room !== null);
  }, [onConversationChange]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const mediaRequests = useRef(new Set<string>());
  const refreshing = useRef(false);
  const refreshQueued = useRef(false);
  const [media, setMedia] = useState<Record<string, string>>({});
  // 顶层（社区）接管渲染后会清掉待办标记，这里同步清空内部视图，
  // 避免走完引导页回到消息页时又看到一次恢复码或欢迎信。
  useEffect(() => {
    const sync = () => {
      try {
        if (!window.localStorage.getItem("heika:pending-recovery-codes")) {
          setNewRecoveryCodes([]);
          setAuthView((view) => (view === "codes" ? "login" : view));
        }
        if (!window.localStorage.getItem("heika:pending-invitation")) {
          setPendingInvitation(null);
          setAuthView((view) => (view === "invite-welcome" ? "login" : view));
        }
      } catch {}
    };
    window.addEventListener("heika:recovery-codes", sync);
    window.addEventListener("heika:pending-invitation", sync);
    return () => {
      window.removeEventListener("heika:recovery-codes", sync);
      window.removeEventListener("heika:pending-invitation", sync);
    };
  }, []);
  useEffect(() => {
    if (!selectedMessage) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedMessage]);
  useEffect(() => {
    if (authView !== "forgot" && authView !== "verify-otp") return;
    const updateCooldown = () => {
      if (!email.trim()) { setResendSeconds(0); return; }
      const key = `heika-password-reset:${email.trim().toLowerCase()}`;
      const until = Number(localStorage.getItem(key)) || 0;
      setResendSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    };
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, [email, authView]);
  useEffect(() => {
    if (!db) return;
    const missing = messages.filter((message) => message.media_path && !(message.id in media) && !mediaRequests.current.has(message.id));
    if (!missing.length) return;
    missing.forEach((message) => mediaRequests.current.add(message.id));
    void Promise.all(
      missing.map(async (m) => {
        try {
          const { data } = await db.storage
            .from("heika-chat")
            .createSignedUrl(m.media_path!, 900);
          return [m.id, data?.signedUrl || ""] as const;
        } catch {
          return [m.id, ""] as const;
        } finally { mediaRequests.current.delete(m.id); }
      }),
    ).then((rows) => {
      setMedia((current) => ({ ...current, ...Object.fromEntries(rows) }));
    });
  }, [db, messages, media]);
  const list = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    activeRef = useRef<Room | null>(null),
    roomsRef = useRef<Room[]>([]),
    namesRef = useRef<Record<string, Profile>>({}),
    noticeRef = useRef(onNotice),
    openPeerRef = useRef(onOpenConversationPeer),
    messageNoticesEnabledRef = useRef(messageNotificationsEnabled);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  activeRef.current = active;
  roomsRef.current = rooms;
  namesRef.current = names;
  noticeRef.current = onNotice;
  openPeerRef.current = onOpenConversationPeer;
  messageNoticesEnabledRef.current = messageNotificationsEnabled;
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
        const { data: sub } = client.auth.onAuthStateChange(
          (event, session) => {
            if (event === "PASSWORD_RECOVERY") setAuthView("reset");
            if (event === "SIGNED_OUT" ||
                (userIdRef.current && userIdRef.current !== session?.user?.id)) {
              if (userIdRef.current) clearInboxSummary(userIdRef.current);
              updateActiveConversation(null);
              setMessages([]);
              setRooms([]);
              setOfficialNotices([]);
              setOfficialInboxOpen(false);
              setPeople([]);
            }
            setUser(session?.user ?? null);
            setAuthReady(true);
          },
        );
        cleanup = () => sub.subscription.unsubscribe();
        const { data, error } = await client.auth.getSession();
        if (!alive) return;
        if (error) setError(error.message);
        setUser(data.session?.user ?? null);
        setAuthReady(true);
      })
      .catch((e) => { setError(e.message); setAuthReady(true); });
    return () => {
      alive = false;
      cleanup();
    };
  }, [updateActiveConversation]);
  useEffect(() => {
    if (!user) { setPinnedRooms([]); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(`heika-pinned-chats:${user.id}`) || "[]");
      setPinnedRooms(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
    } catch { setPinnedRooms([]); }
  }, [user?.id]);
  const togglePinnedRoom = (roomId: string) => {
    setPinnedRooms((current) => {
      const next = current.includes(roomId) ? current.filter((id) => id !== roomId) : [roomId, ...current];
      if (user) localStorage.setItem(`heika-pinned-chats:${user.id}`, JSON.stringify(next));
      return next;
    });
  };
  const refresh = async () => {
    if (!db || !user) return;
    if (refreshing.current) { refreshQueued.current = true; return; }
    refreshing.current = true;
    try {
      const [summaryResult, noticesResult] = await Promise.allSettled([
        readInboxSummary(db, user.id),
        cloudRequest("/api/v1/official-notices") as Promise<{ items?: OfficialNotice[] } | null>,
      ]);
      if (summaryResult.status === "rejected") throw summaryResult.reason;
      const summary = summaryResult.value;
      if (noticesResult.status === "fulfilled" && userIdRef.current === user.id) setOfficialNotices(noticesResult.value?.items || []);
      if (userIdRef.current !== user.id) return;
      const rows: Room[] = summary.map((row) => ({ id: row.conversation_id, user_a: row.user_a, user_b: row.user_b, created_at: row.created_at }));
      setRooms(rows);
      const peers = [...new Set(rows.map((room) => room.user_a === user.id ? room.user_b : room.user_a))];
      if (peers.length) {
        const [{ data: profiles, error }, awards] = await Promise.all([
          db.from("profiles").select("id,nickname,bio,avatar_url").in("id", peers),
          db.from("user_badge_awards").select("user_id,profile_badge_types!inner(id,label,description,color,active)").in("user_id", peers).is("revoked_at", null).eq("profile_badge_types.active", true),
        ]);
        if (error) setError(error.message);
        if (awards.error) setError(awards.error.message);
        const badgesByUser = new Map<string, ProfileBadge[]>();
        for (const award of awards.data || []) {
          const badge = Array.isArray(award.profile_badge_types) ? award.profile_badge_types[0] : award.profile_badge_types;
          if (!badge?.active) continue;
          const items = badgesByUser.get(award.user_id) || [];
          items.push({ id: badge.id, label: badge.label, description: badge.description, color: badge.color });
          badgesByUser.set(award.user_id, items);
        }
        if (userIdRef.current === user.id) setNames(Object.fromEntries((profiles || []).map((item) => [item.id, { ...item, badges: badgesByUser.get(item.id) || [] }])));
      } else setNames({});
      setPreview(Object.fromEntries(summary.flatMap((row) => row.latest_message_id && row.latest_created_at
        ? [[row.conversation_id, {
            id: row.latest_message_id,
            conversation_id: row.conversation_id,
            sender_id: row.latest_sender_id || "",
            body: row.latest_body || "",
            created_at: row.latest_created_at,
            media_path: row.latest_media_path || undefined,
          } satisfies Message]]
        : [])));
      setUnread(Object.fromEntries(summary.map((row) => [row.conversation_id, Number(row.unread)])));
    } catch (cause) {
      if (userIdRef.current === user.id) setError(cause instanceof Error ? cause.message : "消息加载失败");
    } finally {
      refreshing.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        window.setTimeout(() => void refresh(), 0);
      }
    }
  };
  const openOfficialInbox = async () => {
    if (!user) return;
    setOfficialInboxOpen(true);
    try {
      await cloudRequest("/api/v1/official-notices", {}, "POST");
      const now = new Date().toISOString();
      setOfficialNotices((items) => items.map((item) => ({ ...item, read_at: item.read_at || now })));
      window.dispatchEvent(new Event("heika-read"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "官方通知读取失败"); }
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
    if (!db || !user || !isActive) return;
    void refresh();
    const channel = db
      .channel(`heika-inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setMessages((old) => old.filter((m) => m.id !== payload.old.id));
            void refresh();
            return;
          }
          const row = payload.new as Message;
          if (activeRef.current?.id === row.conversation_id) {
            setPreview((current) => ({ ...current, [row.conversation_id]: row }));
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
          } else {
            void refresh();
            const room = roomsRef.current.find((item) => item.id === row.conversation_id);
            const peerId = room ? (room.user_a === user.id ? room.user_b : room.user_a) : "";
            const peer = peerId ? namesRef.current[peerId] : null;
            if (row.sender_id !== user.id && messageNoticesEnabledRef.current && document.visibilityState === "visible") {
              noticeRef.current?.(row.media_path ? "向你发送了一张图片" : row.body, {
                title: peer?.nickname || "新消息",
                avatarUrl: peer?.avatar_url,
                kind: "message",
                onActivate: () => { if (peerId) openPeerRef.current?.(peerId); },
              });
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && activeRef.current)
          void load(activeRef.current);
      });
    const recover = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      if (activeRef.current) void load(activeRef.current);
    };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      if (activeRef.current) void load(activeRef.current);
    }, 15000);
    return () => {
      void db.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [db, user?.id, isActive]);
  const auth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db || busy) return;
    setBusy(true); setError(""); setAuthMessage("");
    try {
      if (authView === "signup") {
        setAuthPurpose("signup");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        if (nickname.trim().length < 2 || nickname.trim().length > 24) throw new Error("昵称请填写 2–24 个字。");
        // 统一走服务端注册入口：这里会按 IP 抢占注册名额（每 IP 每小时 2 个），
        // 并直接把邮箱标记为已确认，网页端不再依赖确认邮件。
        const response = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password, nickname: nickname.trim(), ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}) }),
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string; data?: { invitation?: InvitationWelcome | null } };
        if (!response.ok) throw new Error(result.error || "注册失败，请稍后重试");
        setPendingInvitation(result.data?.invitation || null);
        const { error: signInError } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) {
          setAuthView("login");
          setAuthMessage("账号已创建，请使用刚才设置的密码登录。");
          return;
        }
        // 注册成功立刻生成恢复码：找回密码目前只有这一种方式，
        // 让用户"以后去设置里生成"基本等于永远不会生成。
        let codes: string[] = [];
        try {
          const { data: sessionData } = await db.auth.getSession();
          const token = sessionData.session?.access_token;
          if (!token) throw new Error("登录状态未就绪");
          const codeResponse = await fetch("/api/v1/auth/recovery-codes", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await codeResponse.json();
          codes = Array.isArray(payload?.data?.codes) ? payload.data.codes.filter((code: unknown) => typeof code === "string" && code) : [];
        } catch {
          codes = [];
        }
        // 受邀注册的欢迎信必须留到恢复码确认之后再出现，因此先落盘。
        const invitation = result.data?.invitation || null;
        if (invitation) {
          setPendingInvitation(invitation);
          try {
            window.localStorage.setItem("heika:pending-invitation", JSON.stringify(invitation));
            window.dispatchEvent(new Event("heika:pending-invitation"));
          } catch {}
        }
        if (codes.length) {
          setNewRecoveryCodes(codes);
          setAuthView("codes");
          // 新账号会被引导页接管，顶层需要知道"还有恢复码没确认"。
          try {
            window.localStorage.setItem("heika:pending-recovery-codes", JSON.stringify(codes));
            window.dispatchEvent(new Event("heika:recovery-codes"));
          } catch {}
        } else if (invitation) {
          setAuthView("invite-welcome");
        } else {
          setAuthView("login");
          setAuthMessage("账号已创建，欢迎来到黑卡。");
        }
      } else if (authView === "forgot") {
        if (resendSeconds > 0) throw new Error(`请等待 ${resendSeconds} 秒后再发送验证码。`);
        const { error } = await db.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: authRedirectUrl("/?auth=reset") } });
        if (error) throw error;
        localStorage.setItem(`heika-password-reset:${email.trim().toLowerCase()}`, String(Date.now() + 60000));
        setResendSeconds(60);
        setAuthPurpose("recovery");
        setAuthView("verify-otp"); setAuthMessage("邮件可能包含验证码或一次性登录链接。输入验证码，或点开链接返回黑卡设置新密码。");
      } else if (authView === "verify-otp") {
        const { error } = await db.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: "email" });
        if (error) throw error;
        setAuthView("reset"); setAuthMessage("邮箱验证成功，请设置新密码。");
      } else if (authView === "recover-code") {
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        const response = await fetch("/api/v1/auth/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), code: recoveryCode.trim(), password }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "恢复码验证失败");
        setAuthView("login"); setPassword(""); setConfirmPassword(""); setRecoveryCode("");
        setAuthMessage("密码已更新，请使用新密码登录。");
      } else if (authView === "reset") {
        if (password.length < 8) throw new Error("新密码至少需要 8 位。");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致。");
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        await db.auth.signOut();
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
    if (authPurpose === "recovery" && resendSeconds > 0) return;
    setBusy(true); setError(""); setAuthMessage("");
    try {
      const { error } = authPurpose === "signup"
        ? await db.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: authRedirectUrl() } })
        : await db.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: authRedirectUrl("/?auth=reset") } });
      if (error) throw error;
      if (authPurpose === "recovery") {
        localStorage.setItem(`heika-password-reset:${email.trim().toLowerCase()}`, String(Date.now() + 60000));
        setResendSeconds(60);
      }
      setAuthMessage(authPurpose === "signup" ? "确认邮件已重新发送，请查收邮箱。" : "如果该邮箱已注册，验证码已重新发送。");
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
      updateActiveConversation(room);
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
      .select("id,nickname,bio,avatar_url")
      .eq("id", initialPeer)
      .single()
      .then(async ({ data, error }) => {
        if (error) setError(error.message);
        else if (data) {
          const result = await db.from("user_badge_awards").select("user_id,profile_badge_types!inner(id,label,description,color,active)").eq("user_id", data.id).is("revoked_at", null).eq("profile_badge_types.active", true);
          const badges = (result.data || []).flatMap((award) => {
            const badge = Array.isArray(award.profile_badge_types) ? award.profile_badge_types[0] : award.profile_badge_types;
            return badge?.active ? [{ id: badge.id, label: badge.label, description: badge.description, color: badge.color }] : [];
          });
          void open({ ...data, badges });
        }
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
      .select("id,nickname,bio,avatar_url")
      .neq("id", user.id)
      .ilike("nickname", `%${query.replace(/[%_,]/g, "")}%`)
      .limit(20);
    if (error) { setError(error.message); return; }
    const rows = data || [];
    const awards = rows.length ? await db.from("user_badge_awards").select("user_id,profile_badge_types!inner(id,label,description,color,active)").in("user_id", rows.map((row) => row.id)).is("revoked_at", null).eq("profile_badge_types.active", true) : { data: [], error: null };
    if (awards.error) setError(awards.error.message);
    const badgesByUser = new Map<string, ProfileBadge[]>();
    for (const award of awards.data || []) {
      const badge = Array.isArray(award.profile_badge_types) ? award.profile_badge_types[0] : award.profile_badge_types;
      if (!badge?.active) continue;
      const items = badgesByUser.get(award.user_id) || [];
      items.push({ id: badge.id, label: badge.label, description: badge.description, color: badge.color });
      badgesByUser.set(award.user_id, items);
    }
    setPeople(rows.map((item) => ({ ...item, badges: badgesByUser.get(item.id) || [] })));
  };
  const report = async (message?: Message) => {
    if (!db || !user) return;
    const reason = await promptInApp("请输入举报原因（至少 3 个字）", "", {title:"举报私信",confirmLabel:"提交举报"});
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
  const showPublicProfile = (person: Profile) => {
    setProfile(null);
    if (onOpenProfile) onOpenProfile(person.id);
    else setProfile(person);
  };
  if (!authReady)
    return (
      <section className="page messages-loading" aria-busy="true" aria-label="正在恢复消息状态">
        <h1>消息。</h1>
        <div className="message-loading-placeholder"><i /><i /></div>
      </section>
    );
  if (authView === "codes" && newRecoveryCodes.length)
    return <RecoveryCodesPage codes={newRecoveryCodes} onDone={() => {
      setNewRecoveryCodes([]);
      if (pendingInvitation) setAuthView("invite-welcome");
      else { setAuthView("login"); setAuthMessage("账号已创建，欢迎来到黑卡。"); }
      try { window.localStorage.removeItem("heika:pending-recovery-codes"); } catch {}
    }} />;
  if (authView === "invite-welcome" && pendingInvitation)
    return <InvitationWelcomePage invitation={pendingInvitation} onDone={() => {
      setAuthView("login");
      setAuthMessage("");
      try { window.localStorage.removeItem("heika:pending-invitation"); } catch {}
    }} />;
  if (!user || authView === "reset")
  if (!user || authView === "reset")
    return (
      <section className="page account-page">
        <h1>{authView === "signup" ? "加入黑卡。" : authView === "forgot" || authView === "verify-otp" ? "找回密码。" : authView === "reset" ? "设置新密码。" : authView === "confirm" ? "查看邮箱。" : "让交流发生。"}</h1>
        <p className="lead">{authView === "signup" ? "建立你的账号，保存发现并开启交流。" : authView === "reset" ? "为账号设置一个新的登录密码。" : authView === "verify-otp" ? "输入邮件中的验证码，或打开邮件里的登录链接返回此页设置新密码。" : authView === "recover-code" ? "输入邮箱和一枚未使用的账号恢复码。" : authView === "confirm" ? "完成邮箱验证后，即可继续使用黑卡。" : "登录后，收藏、消息与个人资料会安全保存在账号中。"}</p>
        <form
          className="account-form"
          onSubmit={(e) => void auth(e)}
        >
          {authView === "signup" && <label>昵称<input autoComplete="nickname" required minLength={2} maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="2–24 个字，之后也可以修改" /></label>}
          {authView === "signup" && <label>入驻邀请码（选填）<input autoComplete="off" maxLength={400} value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="HEIKA-XXXX-XXXX-XXXX" /></label>}
          {authView !== "reset" && authView !== "confirm" && <label>邮箱<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>}
          {authView === "verify-otp" && <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" required maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="输入邮件中的验证码" /></label>}
          {authView === "recover-code" && <label>账号恢复码<input autoComplete="off" required value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder="AAAAA-BBBBB-CCCCC-DDDDD" /></label>}
          {(authView === "login" || authView === "signup" || authView === "reset" || authView === "recover-code") && <label>{authView === "reset" || authView === "recover-code" ? "新密码" : "密码"}<input type="password" autoComplete={authView === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" /></label>}
          {(authView === "signup" || authView === "reset" || authView === "recover-code") && <label>确认密码<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再输入一次密码" /></label>}
          {authView !== "confirm" && <button className="primary-button" disabled={!db || busy || (authView === "forgot" && resendSeconds > 0)}>{busy ? "请稍候…" : authView === "signup" ? "创建账号" : authView === "forgot" ? resendSeconds > 0 ? `${resendSeconds} 秒后可重发` : "发送验证码" : authView === "verify-otp" ? "验证并继续" : authView === "recover-code" ? "验证恢复码并重置" : authView === "reset" ? "更新密码" : "登录"}</button>}
          {authView === "login" && <><button type="button" className="text-button" onClick={() => { setAuthPurpose("recovery"); setAuthView("forgot"); setError(""); setAuthMessage(""); }}>忘记密码？</button><button type="button" className="soft-button" disabled={!db || busy} onClick={() => { setAuthPurpose("signup"); setAuthView("signup"); setError(""); setAuthMessage(""); }}>创建新账号</button></>}
          {authView === "signup" && <button type="button" className="soft-button" onClick={() => { setAuthView("login"); setError(""); setAuthMessage(""); }}>已有账号，返回登录</button>}
          {authView === "forgot" && <><button type="button" className="text-button" onClick={() => { setAuthView("recover-code"); setError(""); setAuthMessage(""); }}>使用账号恢复码</button><button type="button" className="soft-button" onClick={() => { setAuthView("login"); setError(""); setAuthMessage(""); }}>返回登录</button></>}
          {authView === "verify-otp" && <><button type="button" className="text-button" disabled={busy || resendSeconds > 0} onClick={() => void resendConfirmation()}>{busy ? "正在发送…" : resendSeconds > 0 ? `${resendSeconds} 秒后可重发` : "重新发送验证码"}</button><button type="button" className="soft-button" onClick={() => { setAuthView("forgot"); setError(""); setAuthMessage(""); }}>返回</button></>}
          {authView === "recover-code" && <button type="button" className="soft-button" onClick={() => { setAuthView("forgot"); setError(""); setAuthMessage(""); }}>返回邮箱验证码</button>}
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
    <section className={`page messages-page${active ? " is-chat-open" : ""}`}>
      <div className="messages-inbox-pane">
      <div className="messages-title-row"><div><h1>消息</h1><p>{Object.values(unread).reduce((sum, count) => sum + count, 0) + officialNotices.filter((notice) => !notice.read_at).length} 条未读</p></div>{onOpenNotifications && <button type="button" className="messages-notification-button" onClick={onOpenNotifications} aria-label="打开社区通知"><Bell size={19}/></button>}</div>
      {!active && <AnimatedNotice message={error} className="settings-note" onClick={() => setError("")} />}
      <div className="messages-inbox-switch" role="tablist" aria-label="消息列表类别">
        <button type="button" role="tab" aria-selected={inboxMode === "chats"} className={inboxMode === "chats" ? "selected" : ""} onClick={() => { setInboxMode("chats"); setQuery(""); setPeople([]); }}>会话 <small>{rooms.length}</small></button>
        <button type="button" role="tab" aria-selected={inboxMode === "people"} className={inboxMode === "people" ? "selected" : ""} onClick={() => { setInboxMode("people"); setQuery(""); }}>找人 <Users size={14}/></button>
      </div>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (inboxMode === "people") void search();
        }}
      >
        <Search size={16} aria-hidden="true" />
        <input
          placeholder={inboxMode === "people" ? "搜索昵称，发现新朋友" : "搜索会话昵称或最近消息"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {inboxMode === "people" && <button type="submit" className="text-button">搜索</button>}
      </form>
      {inboxMode === "chats" && <div className="messages-filter-row" role="group" aria-label="筛选会话">
        <button type="button" className={inboxFilter === "all" ? "selected" : ""} aria-pressed={inboxFilter === "all"} onClick={() => setInboxFilter("all")}>全部</button>
        <button type="button" className={inboxFilter === "unread" ? "selected" : ""} aria-pressed={inboxFilter === "unread"} onClick={() => setInboxFilter("unread")}>未读{Object.values(unread).reduce((sum, count) => sum + count, 0) ? ` · ${Object.values(unread).reduce((sum, count) => sum + count, 0)}` : ""}</button>
      </div>}
      {inboxMode === "chats" && (inboxFilter !== "unread" || officialNotices.some((notice) => !notice.read_at)) && <button type="button" className="official-notice-entry" onClick={() => void openOfficialInbox()}>
        <span className="official-notice-avatar"><Bell size={18}/></span><span className="official-notice-entry-copy"><strong>黑卡官方菌</strong><small>{officialNotices[0]?.title || "官方公告和重要提醒会出现在这里"}</small></span><span className="official-notice-entry-meta"><small>通知</small>{officialNotices.filter((notice) => !notice.read_at).length > 0 && <i>{officialNotices.filter((notice) => !notice.read_at).length}</i>}</span>
      </button>}
      {inboxMode === "people" && people.map((p) => (
        <button
          className="conversation-row conversation-person-row"
          key={p.id}
          onClick={() => setProfile(p)}
        >
          <span className="conversation-row-head">
            <span className="conversation-avatar">{(p.nickname || "探").slice(0, 1)}{p.avatar_url && <img src={p.avatar_url} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</span>
            <span className="conversation-row-copy"><strong>{p.nickname || "探索者"}</strong><ProfileBadgeList badges={p.badges || []} compact/><small>{p.bio || "查看主页并开始交流"}</small></span>
            <span className="conversation-row-meta"><small>用户</small></span>
          </span>
        </button>
      ))}
      {inboxMode === "chats" && rooms
        .filter((room) => {
          const peerId = room.user_a === user.id ? room.user_b : room.user_a;
          const term = query.trim().toLocaleLowerCase();
          const content = `${names[peerId]?.nickname || ""} ${preview[room.id]?.body || ""}`.toLocaleLowerCase();
          return (inboxFilter !== "unread" || !!unread[room.id]) && (!term || content.includes(term));
        })
        .sort((a, b) => Number(pinnedRooms.includes(b.id)) - Number(pinnedRooms.includes(a.id)) ||
          (preview[b.id]?.created_at || b.created_at || "").localeCompare(preview[a.id]?.created_at || a.created_at || ""))
        .map((r) => {
          const id = r.user_a === user.id ? r.user_b : r.user_a;
          return (
            <div className="conversation-item" key={r.id}>
              <button className="conversation-row" onClick={() => { updateActiveConversation(r); setMessages([]); void load(r); }}>
                <span className="conversation-row-head">
                  <span className="conversation-avatar">{(names[id]?.nickname || "探").slice(0, 1)}{names[id]?.avatar_url && <img src={names[id].avatar_url} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} />}</span>
                  <span className="conversation-row-copy"><strong>{names[id]?.nickname || "探索者"}{pinnedRooms.includes(r.id) && <Pin size={11} aria-label="已置顶"/>}</strong><ProfileBadgeList badges={names[id]?.badges || []} compact/><small>{preview[r.id]?.body || "开启一段新的交流"}</small></span>
                  <span className="conversation-row-meta"><time>{preview[r.id] ? new Date(preview[r.id].created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : ""}</time>{unread[r.id] ? <i className="conversation-unread">{unread[r.id] > 99 ? "99+" : unread[r.id]}</i> : null}</span>
                </span>
              </button>
              <button type="button" className={`conversation-pin${pinnedRooms.includes(r.id) ? " is-pinned" : ""}`} aria-label={pinnedRooms.includes(r.id) ? "取消置顶会话" : "置顶会话"} aria-pressed={pinnedRooms.includes(r.id)} onClick={() => togglePinnedRoom(r.id)}><Pin size={15}/></button>
            </div>
          );
        })}
      {inboxMode === "chats" && rooms.length === 0 && <div className="messages-empty"><MessageCircle size={24}/><strong>从一段交流开始</strong><span>搜索用户，发现聊得来的新朋友。</span><button type="button" onClick={() => { setInboxMode("people"); setQuery(""); }}>发现用户</button></div>}
      {inboxMode === "people" && query.trim() && !people.length && <div className="messages-empty compact"><strong>没有找到用户</strong><span>换个昵称关键词再试试。</span></div>}
      {inboxMode === "chats" && rooms.length > 0 && !rooms.some((room) => {
        const peerId = room.user_a === user.id ? room.user_b : room.user_a;
        return (inboxFilter !== "unread" || !!unread[room.id]) && (!query.trim() || `${names[peerId]?.nickname || ""} ${preview[room.id]?.body || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
      }) && <div className="messages-empty compact"><strong>{inboxFilter === "unread" ? "没有未读会话" : "没有匹配的会话"}</strong><span>{inboxFilter === "unread" ? "新消息会出现在这里。" : "试试昵称或最近消息中的关键词。"}</span></div>}
      </div>
      {officialInboxOpen && <section className="official-inbox-page" aria-label="黑卡官方菌消息">
          <header><button type="button" aria-label="返回消息列表" onClick={() => setOfficialInboxOpen(false)}><ArrowLeft size={20}/></button><div><h2>黑卡官方菌</h2><p>平台公告与重要提醒</p></div></header>
          <div className="official-inbox-cards">{officialNotices.length ? officialNotices.map((notice) => <article className="official-notice-card" key={notice.id}>
            <small>{new Date(notice.published_at).toLocaleString("zh-CN")}</small><h3>{notice.title}</h3><p>{notice.body}</p>{notice.image_url && <img src={notice.image_url} alt="通知图片" loading="lazy"/>}{notice.action_label && notice.action_url && <a href={notice.action_url} target={notice.action_url.startsWith("/") ? undefined : "_blank"} rel={notice.action_url.startsWith("/") ? undefined : "noopener noreferrer"}>{notice.action_label}</a>}
          </article>) : <div className="messages-empty compact"><strong>暂时没有官方通知</strong><span>后续公告和提醒会出现在这里。</span></div>}</div>
        </section>}
      {profile && (
        <div className="modal-backdrop">
          <div className="modal">
            <button className="close" onClick={() => setProfile(null)}>
              关闭
            </button>
            <h2>{profile.nickname}</h2>
            <ProfileBadgeList badges={profile.badges || []}/>
            <p>{profile.bio || "这个人还没有写下简介。"}</p>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void open(profile)}
            >
              私聊
            </button>
            <button className="soft-button" onClick={() => showPublicProfile(profile)}>
              查看完整主页
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
                  {selectedMessage.sender_id === user.id && (() => {
                    const sentAt = new Date(selectedMessage.created_at).getTime();
                    // 服务端窗口 180 秒，这里留 5 秒余量，避免"显示还剩 1 秒却失败"。
                    const left = Math.max(0, sentAt + (RECALL_SECONDS - 5) * 1000 - now);
                    if (left <= 0) {
                      return <button disabled aria-disabled="true">已超过 3 分钟，无法撤回</button>;
                    }
                    const clock = `${String(Math.floor(left / 1000 / 60)).padStart(2, "0")}:${String(Math.floor((left / 1000) % 60)).padStart(2, "0")}`;
                    return (
                      <button
                        className={confirmDelete ? "danger-button" : undefined}
                        onClick={async () => {
                          if (!confirmDelete) {
                            setConfirmDelete(true);
                            return;
                          }
                          const target = selectedMessage;
                          setConfirmDelete(false);
                          setSelectedMessage(null);
                          // 先乐观移除，失败再整段刷新回滚。
                          setMessages((old) => old.filter((m) => m.id !== target.id));
                          try {
                            const response = await fetch("/api/v1/messages", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "recall",
                                conversation: active.id,
                                message: target.id,
                              }),
                            });
                            if (!response.ok) {
                              const payload = await response.json().catch(() => null);
                              setError(payload?.error || "撤回失败，请稍后重试");
                              void refresh();
                              if (active) void load(active);
                            }
                          } catch {
                            setError("网络异常，消息未撤回");
                            void refresh();
                            if (active) void load(active);
                          }
                        }}
                      >
                        {confirmDelete ? "确认撤回（对话双方都看不到）" : `撤回消息 · ${clock}`}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => {
                      void report(selectedMessage);
                      setSelectedMessage(null);
                    }}
                  >
                    举报
                  </button>
                  <button onClick={() => { setConfirmDelete(false); setSelectedMessage(null); }}>取消</button>
                </div>
              </div>
            </div>
          )}
          <header className="chat-topbar">
            <button
              className="chat-back"
              aria-label="返回消息列表"
              onClick={() => {
                updateActiveConversation(null);
                void refresh();
              }}
            >
              <ArrowLeft size={21} />
            </button>
            <button
              className="chat-peer-profile"
              aria-label={`打开${names[peer]?.nickname || "探索者"}的个人主页`}
              onClick={() => showPublicProfile(names[peer] || { id: peer, nickname: "探索者", bio: "" })}
            >
              <span className="chat-peer-avatar">
                {names[peer]?.avatar_url ? <img src={names[peer].avatar_url!} alt="" /> : (names[peer]?.nickname || "探").slice(0, 1)}
              </span>
              <span className="chat-peer-copy"><strong>{names[peer]?.nickname || "探索者"}</strong><ProfileBadgeList badges={names[peer]?.badges || []} compact/><small>个人主页</small></span>
            </button>
            <button className="chat-more" aria-label="会话选项" onClick={() => setProfile(names[peer] || { id: peer, nickname: "探索者", bio: "" })}>
              <MoreHorizontal size={21} />
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
            {messages.map((m, index) => {
              const previous = messages[index - 1];
              const day = new Date(m.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
              const previousDay = previous ? new Date(previous.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "";
              return <div key={m.id} className="chat-message-group">
              {day !== previousDay && <div className="chat-day-divider"><span>{day}</span></div>}
              <div className={`message-row ${m.sender_id === user.id ? "own" : ""}`}>
                <span className="chat-message-avatar" aria-hidden="true">
                  {(m.sender_id === user.id ? user.user_metadata?.nickname || user.email : names[peer]?.nickname || "探")?.toString().slice(0, 1) || "探"}
                  {m.sender_id === user.id && typeof user.user_metadata?.avatar_url === "string" && <img src={user.user_metadata.avatar_url} alt="" />}
                  {m.sender_id !== user.id && names[peer]?.avatar_url && <img src={names[peer].avatar_url!} alt="" />}
                </span>
                <div className="message-content">
                  <small className="message-time">{new Date(m.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small>
                  <div
                    className="message-bubble"
                    onPointerDown={(event) => {
                      pressOrigin.current = { x: event.clientX, y: event.clientY };
                      if (pressTimer.current) clearTimeout(pressTimer.current);
                      pressTimer.current = setTimeout(() => {
                        pressTimer.current = null;
                        setSelectedMessage(m);
                        setConfirmDelete(false);
                      }, 420);
                    }}
                    onPointerUp={() => {
                      pressOrigin.current = null;
                      if (pressTimer.current) clearTimeout(pressTimer.current);
                      pressTimer.current = null;
                    }}
                    onPointerCancel={() => {
                      pressOrigin.current = null;
                      if (pressTimer.current) clearTimeout(pressTimer.current);
                      pressTimer.current = null;
                    }}
                    onPointerMove={(event) => {
                      // 手指轻抖不该取消长按：只有位移超过 10px 才算在滚动。
                      const origin = pressOrigin.current;
                      if (!origin) return;
                      if (Math.abs(event.clientX - origin.x) > 10 || Math.abs(event.clientY - origin.y) > 10) {
                        pressOrigin.current = null;
                        if (pressTimer.current) clearTimeout(pressTimer.current);
                        pressTimer.current = null;
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelectedMessage(m);
                    }}
                  >
                    {m.body !== "[图片]" && <p>{m.body}</p>}
                    {media[m.id] && (
                      <img
                        src={media[m.id]}
                        alt="聊天图片"
                        loading="lazy"
                        onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "true"; event.currentTarget.src = "/image-not-loaded.svg"; } }}
                        style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain" }}
                      />
                    )}
                  </div>
                </div>
              </div>
              </div>;
            })}
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
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="chat-attach" aria-label="发送图片">
              <FileImage size={20} />
              <input
                aria-label="选择要发送的图片"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (!file || !db || !active) return;
                  setBusy(true);
                  try {
                    const compressedFile = await compressUploadImage(file);
                    if (compressedFile.size > MAX_UPLOAD_IMAGE_BYTES) throw new Error("图片压缩后仍超过 4 MB");
                    const nonce = crypto.randomUUID(),
                      path = `${active.id}/${user.id}/${nonce}`;
                    const { error: uploadError } = await db.storage
                      .from("heika-chat")
                      .upload(path, compressedFile, { contentType: compressedFile.type });
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
                    input.value = "";
                  }
                }}
              />
            </label>
            <textarea
              aria-label="消息内容，按 Enter 发送，Shift 加 Enter 换行"
              className="chat-compose-textarea"
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (draft.trim() && !busy) void send();
                }
              }}
              rows={1}
              placeholder="写下消息…"
            />
            <button className="chat-send" disabled={busy || !draft.trim()} aria-label="发送消息">
              <ArrowUp size={18} strokeWidth={2.4}/>
            </button>
          </form>
          <AnimatedNotice message={error} />
        </div>
      )}
    </section>
  );
}
