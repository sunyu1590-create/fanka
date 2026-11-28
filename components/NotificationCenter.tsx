"use client";
import { useCallback, useEffect, useState } from "react";
import { AtSign, Bell, BookOpenText, CheckCheck, ChevronRight, Hash, MessageCircle, Reply, ShieldCheck, UserRound } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import type { Post } from "@/lib/content";

type Item = { id: string; notification_type: "creator_post" | "topic_post" | "series_post" | "comment" | "reply" | "mention" | "moderation" | "system_announcement"; title: string; body?: string | null; image_url?: string | null; action_label?: string | null; action_url?: string | null; created_at: string; read_at: string | null; post_id: string | null; actor: { nickname: string; avatar_url?: string | null } | null; post: Post | null };
function TypeIcon({ type }: { type: Item["notification_type"] }) {
  if (type === "creator_post") return <UserRound size={17} />;
  if (type === "topic_post") return <Hash size={17} />;
  if (type === "series_post") return <BookOpenText size={17} />;
  if (type === "moderation") return <ShieldCheck size={17} />;
  if (type === "system_announcement") return <Bell size={17} />;
  if (type === "reply") return <Reply size={17} />;
  if (type === "mention") return <AtSign size={17} />;
  return <MessageCircle size={17} />;
}
export default function NotificationCenter({ accountId, onLogin, onOpenPost }: { accountId: string | null; onLogin: () => void; onOpenPost: (item: Item) => void }) {
  const [items, setItems] = useState<Item[]>([]), [unread, setUnread] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(""), [selectedNotice, setSelectedNotice] = useState<Item | null>(null);
  const load = useCallback(async () => {
    if (!accountId) { setItems([]); setUnread(0); setLoading(false); return; }
    setLoading(true); setError("");
    try { const response = await cloudFetch("/api/v1/notifications", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "通知加载失败"); setItems(result.data.items || []); setUnread(result.data.unread || 0); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "通知加载失败"); }
    finally { setLoading(false); }
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);
  const markAll = async () => { try { await cloudRequest("/api/v1/notifications", { action: "read_all" }); setItems((rows) => rows.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))); setUnread(0); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); } };
  const open = async (item: Item) => {
    if (!item.read_at) { try { await cloudRequest("/api/v1/notifications", { action: "read", id: item.id }); setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)); setUnread((count) => Math.max(0, count - 1)); } catch {} }
    if (item.notification_type === "system_announcement") { setSelectedNotice(item); return; }
    onOpenPost(item);
  };
  return <section className="page notification-center-page"><div className="notification-center-heading"><div><h1>通知</h1><p>社区互动、账号提醒与官方公告都在这里。</p></div>{!!unread && <button type="button" onClick={() => void markAll()}><CheckCheck size={15}/>全部已读</button>}</div>
    {!accountId ? <div className="notification-empty"><Bell size={24}/><strong>登录后接收社区通知</strong><button type="button" onClick={onLogin}>前往登录</button></div> : loading ? <div className="empty">正在加载通知…</div> : error ? <div className="notification-empty"><span>{error}</span><button type="button" onClick={() => void load()}>重新加载</button></div> : items.length ? <div className="notification-list">{items.map((item) => <button type="button" className={`notification-row${item.read_at ? "" : " unread"}`} key={item.id} onClick={() => void open(item)}><span className={`notification-avatar type-${item.notification_type}`}>{item.actor?.avatar_url ? <img src={item.actor.avatar_url} alt=""/> : <TypeIcon type={item.notification_type}/>}</span><span className="notification-copy"><strong>{item.notification_type === "system_announcement" ? "黑卡系统通知" : item.notification_type === "moderation" ? "黑卡审核" : item.actor?.nickname || "黑卡社区"}<small>{item.notification_type === "system_announcement" ? "官方公告" : item.notification_type === "creator_post" ? "发布了新内容" : item.notification_type === "topic_post" ? "你关注的话题有了新内容" : item.notification_type === "series_post" ? "你订阅的系列更新了" : item.notification_type === "reply" ? "回复了你" : item.notification_type === "mention" ? "在评论中提到了你" : item.notification_type === "moderation" ? "内容审核结果" : "评论了你的内容"}</small></strong><span>{item.title}{item.post?.title ? ` ·《${item.post.title}》` : ""}</span><time>{new Date(item.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span><ChevronRight size={16}/>{!item.read_at && <i className="notification-unread-dot"/>}</button>)}</div> : <div className="notification-empty"><Bell size={24}/><strong>暂时没有新通知</strong><span>有创作者更新、收到评论或官方公告时，会在这里提醒你。</span></div>}
    {selectedNotice && <div className="notification-notice-backdrop" role="presentation" onClick={() => setSelectedNotice(null)}><article className="notification-notice-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-notice-title" onClick={(event) => event.stopPropagation()}><button type="button" className="notification-notice-close" aria-label="关闭" onClick={() => setSelectedNotice(null)}>×</button><small>黑卡系统通知</small><h2 id="notification-notice-title">{selectedNotice.title}</h2>{selectedNotice.image_url && <img src={selectedNotice.image_url} alt=""/>}<p>{selectedNotice.body || selectedNotice.title}</p>{selectedNotice.action_url && <a href={selectedNotice.action_url} target="_blank" rel="noreferrer">{selectedNotice.action_label || "查看详情"}<ChevronRight size={16}/></a>}</article></div>}
  </section>;
}
