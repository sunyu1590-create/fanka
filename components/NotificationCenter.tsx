"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronRight, MessageCircle, Sparkles } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import type { Post } from "@/lib/content";

type Item = { id: string; notification_type: "creator_post" | "comment" | "reply"; title: string; created_at: string; read_at: string | null; post_id: string | null; actor: { nickname: string; avatar_url?: string | null } | null; post: Post | null };
export default function NotificationCenter({ accountId, onLogin, onOpenPost }: { accountId: string | null; onLogin: () => void; onOpenPost: (item: Item) => void }) {
  const [items, setItems] = useState<Item[]>([]), [unread, setUnread] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!accountId) { setItems([]); setUnread(0); setLoading(false); return; }
    setLoading(true); setError("");
    try { const response = await cloudFetch("/api/v1/notifications", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "通知加载失败"); setItems(result.data.items || []); setUnread(result.data.unread || 0); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "通知加载失败"); }
    finally { setLoading(false); }
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);
  const markAll = async () => { try { await cloudRequest("/api/v1/notifications", { action: "read_all" }); setItems((rows) => rows.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))); setUnread(0); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); } };
  const open = async (item: Item) => { if (!item.read_at) { try { await cloudRequest("/api/v1/notifications", { action: "read", id: item.id }); setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)); setUnread((count) => Math.max(0, count - 1)); } catch {} } onOpenPost(item); };
  return <section className="page notification-center-page"><div className="eyebrow">ACTIVITY / HEIKA</div><div className="notification-center-heading"><div><h1>通知</h1><p>关注动态、评论与回复都在这里。</p></div>{!!unread && <button type="button" onClick={() => void markAll()}><CheckCheck size={15}/>全部已读</button>}</div>
    {!accountId ? <div className="notification-empty"><Bell size={24}/><strong>登录后接收社区通知</strong><button type="button" onClick={onLogin}>前往登录</button></div> : loading ? <div className="empty">正在加载通知…</div> : error ? <div className="notification-empty"><span>{error}</span><button type="button" onClick={() => void load()}>重新加载</button></div> : items.length ? <div className="notification-list">{items.map((item) => <button type="button" className={`notification-row${item.read_at ? "" : " unread"}`} key={item.id} onClick={() => void open(item)}><span className="notification-avatar">{item.actor?.avatar_url ? <img src={item.actor.avatar_url} alt=""/> : item.notification_type === "creator_post" ? <Sparkles size={17}/> : <MessageCircle size={17}/>}</span><span className="notification-copy"><strong>{item.actor?.nickname || "黑卡社区"}<small>{item.notification_type === "creator_post" ? "发布了新内容" : item.notification_type === "reply" ? "回复了你" : "评论了你的内容"}</small></strong><span>{item.title}{item.post?.title ? ` ·《${item.post.title}》` : ""}</span><time>{new Date(item.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span><ChevronRight size={16}/>{!item.read_at && <i className="notification-unread-dot"/>}</button>)}</div> : <div className="notification-empty"><Bell size={24}/><strong>暂时没有新通知</strong><span>有创作者更新或收到评论时，会在这里提醒你。</span></div>}
  </section>;
}
