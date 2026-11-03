"use client";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, UsersRound } from "lucide-react";
import type { Post } from "@/lib/content";
import { cloudFetch, cloudRequest } from "@/lib/cloud";

type SharedData = { collection: { id: string; name: string; canJoin: boolean; member: boolean }; items: Post[] };
export default function SharedCollection({ code, accountId, onOpenPost, onNotice, onLogin }: { code: string; accountId: string | null; onOpenPost: (post: Post) => void; onNotice: (message: string) => void; onLogin: () => void }) {
  const [data, setData] = useState<SharedData | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setLoading(true); const response = await cloudFetch(`/api/v1/bookmark-collections/shared?code=${encodeURIComponent(code)}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "收藏夹加载失败"); setData(result.data); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "收藏夹加载失败"); } finally { setLoading(false); } }, [code]);
  useEffect(() => { if (code) void load(); }, [code, load]);
  const join = async () => { if (!accountId) { onLogin(); return; } try { await cloudRequest("/api/v1/bookmark-collections", { action: "join", shareCode: code }); await load(); window.dispatchEvent(new Event("heika-collections-updated")); onNotice("已加入协作收藏夹"); } catch (cause) { onNotice(cause instanceof Error ? cause.message : "加入失败"); } };
  return <section className="page shared-collection-page"><div className="eyebrow">SHARED COLLECTION / HEIKA</div>{loading ? <div className="empty">正在打开收藏夹…</div> : error ? <div className="notification-empty"><Bookmark size={23}/><strong>{error}</strong><button type="button" onClick={() => void load()}>重新加载</button></div> : data && <><div className="shared-collection-heading"><div><h1>{data.collection.name}</h1><p>一组值得再次打开的灵感。</p></div><UsersRound size={22}/></div>{data.collection.canJoin && <button className="shared-collection-join" type="button" onClick={() => void join()}>加入协作整理</button>}{data.items.length ? <div className="shared-collection-grid">{data.items.map((item) => <button type="button" key={item.id} onClick={() => onOpenPost(item)}>{item.image && <img src={item.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.src = "/image-not-loaded.svg"; }}/>}<span>{item.tag}</span><strong>{item.title}</strong><small>{item.author}</small></button>)}</div> : <div className="empty">这个收藏夹还没有内容。</div>}</>}</section>;
}
