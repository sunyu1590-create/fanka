"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookmarkPlus, Check, ChevronDown, ChevronRight, CircleHelp, Highlighter, MessageSquareText, Minus, Plus, X } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";

type TopicFollow = { topic_id: number; interest_tags: { name: string } | { name: string }[] | null };
type Highlight = { id: string; post_id: string; excerpt: string; note: string; created_at: string };
type PollOption = { id: string; label: string; position: number; vote_count: number };
type PollData = { id: string; question: string; options: PollOption[]; selectedOptionId: string | null; totalVotes: number };
type Filter = { id: string; filter_type: "author" | "topic"; profiles: { nickname: string } | { nickname: string }[] | null; interest_tags: { name: string } | { name: string }[] | null };
const relation = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;

export function TopicFollowButton({ topicId, accountId, onLogin, onNotice }: { topicId: number; accountId: string | null; onLogin: () => void; onNotice: (message: string) => void }) {
  const [following, setFollowing] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!accountId) { setFollowing(false); setLoaded(true); return; }
    void cloudFetch("/api/v1/topic-follows", { cache: "no-store" }).then((r) => r.json()).then((r) => {
      if (alive && Array.isArray(r.data?.items)) setFollowing(r.data.items.some((item: TopicFollow) => Number(item.topic_id) === topicId));
    }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [accountId, topicId]);
  const toggle = async () => {
    if (!accountId) return onLogin();
    setBusy(true);
    try { await cloudRequest("/api/v1/topic-follows", { topicId, follow: !following }); setFollowing(!following); onNotice(following ? "已取消关注话题" : "已关注话题，新内容会出现在通知中"); }
    catch (error) { onNotice(error instanceof Error ? error.message : "话题关注失败"); }
    finally { setBusy(false); }
  };
  return <button type="button" className={`interactive-follow-button${following ? " is-following" : ""}`} aria-pressed={following} disabled={busy || !loaded} onClick={() => void toggle()}>{following ? <><Check size={15}/>已关注</> : <><Plus size={15}/>关注话题</>}</button>;
}

export function FollowedTopics({ accountId, onOpen }: { accountId: string | null; onOpen: (name: string) => void }) {
  const [items, setItems] = useState<TopicFollow[]>([]);
  useEffect(() => {
    let alive = true;
    if (!accountId) { setItems([]); return; }
    void cloudFetch("/api/v1/topic-follows", { cache: "no-store" }).then((r) => r.json()).then((r) => { if (alive && Array.isArray(r.data?.items)) setItems(r.data.items as TopicFollow[]); }).catch(() => {});
    return () => { alive = false; };
  }, [accountId]);
  if (!accountId || !items.length) return null;
  return <section className="followed-topics-strip" aria-label="关注的话题"><span>关注的话题</span><div>{items.map((item) => { const topic = relation(item.interest_tags); return topic ? <button type="button" key={item.topic_id} onClick={() => onOpen(topic.name)}>#{topic.name}<ChevronRight size={13}/></button> : null; })}</div></section>;
}

export function FollowedTopicsSettings({ accountId, onOpen, onNotice }: { accountId: string | null; onOpen: (name: string) => void; onNotice: (message: string) => void }) {
  const [items, setItems] = useState<TopicFollow[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const onNoticeRef = useRef(onNotice);
  useEffect(() => { onNoticeRef.current = onNotice; }, [onNotice]);
  const load = useCallback(async () => {
    if (!accountId) { setItems([]); return; }
    try { const response = await cloudFetch("/api/v1/topic-follows", { cache: "no-store" }); const result = await response.json(); if (response.ok && Array.isArray(result.data?.items)) setItems(result.data.items); }
    catch { onNoticeRef.current("关注话题暂时无法读取"); }
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);
  const unfollow = async (topicId: number) => {
    setBusy(topicId);
    try { await cloudRequest("/api/v1/topic-follows", { topicId, follow: false }); setItems((current) => current.filter((item) => item.topic_id !== topicId)); onNoticeRef.current("已取消关注话题"); }
    catch (error) { onNoticeRef.current(error instanceof Error ? error.message : "取消关注失败"); }
    finally { setBusy(null); }
  };
  return <section className="followed-topics-settings" aria-labelledby="followed-topics-title"><div><h2 id="followed-topics-title">关注的话题</h2><p>管理你关注的社区话题，新内容仍会出现在通知中。</p></div>{items.length ? <ul>{items.map((item) => { const topic = relation(item.interest_tags); return topic ? <li key={item.topic_id}><button type="button" className="followed-topic-open" onClick={() => onOpen(topic.name)}>#{topic.name}<ChevronRight size={14}/></button><button type="button" className="followed-topic-remove" disabled={busy === item.topic_id} onClick={() => void unfollow(item.topic_id)}>{busy === item.topic_id ? "处理中…" : "取消关注"}</button></li> : null; })}</ul> : <div className="followed-topics-empty">还没有关注的话题。浏览话题页时可随时关注感兴趣的方向。</div>}</section>;
}

export function SeriesSubscription({ seriesId, accountId, onLogin, onNotice }: { seriesId: string; accountId: string | null; onLogin: () => void; onNotice: (message: string) => void }) {
  const [subscribed, setSubscribed] = useState(false), [isOwner, setIsOwner] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!accountId) { setSubscribed(false); setIsOwner(false); return; }
    void cloudFetch(`/api/v1/series/${seriesId}/subscription`, { cache: "no-store" }).then((r) => r.json()).then((r) => { if (alive && r.data) { setSubscribed(Boolean(r.data.subscribed)); setIsOwner(r.data.series?.creator_id === accountId); } }).catch(() => {});
    return () => { alive = false; };
  }, [seriesId, accountId]);
  const toggle = async () => {
    if (!accountId) return onLogin();
    setBusy(true);
    try { const result = await cloudRequest(`/api/v1/series/${seriesId}/subscription`, { subscribe: !subscribed }) as { subscribed: boolean }; setSubscribed(result.subscribed); onNotice(result.subscribed ? "已订阅系列，更新时会收到通知" : "已取消系列订阅"); }
    catch (error) { onNotice(error instanceof Error ? error.message : "订阅操作失败"); }
    finally { setBusy(false); }
  };
  if (isOwner) return null;
  return <button type="button" className={`series-subscribe-button${subscribed ? " is-following" : ""}`} aria-pressed={subscribed} disabled={busy} onClick={() => void toggle()}>{subscribed ? <><Check size={14}/>已订阅</> : <><Plus size={14}/>订阅系列</>}</button>;
}

export function PostPoll({ postId, accountId, onLogin, onNotice }: { postId: string; accountId: string | null; onLogin: () => void; onNotice: (message: string) => void }) {
  const [poll, setPoll] = useState<PollData | null>(null), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setPoll(null); setLoaded(false);
    void cloudFetch(`/api/v1/posts/${postId}/poll`, { cache: "no-store" }).then((r) => r.json()).then((r) => { if (alive) setPoll(r.data?.poll || null); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [postId, accountId]);
  const vote = async (optionId: string) => {
    if (!accountId) return onLogin();
    if (!poll || busy) return;
    const old = poll;
    const selected = old.selectedOptionId;
    setPoll({ ...old, selectedOptionId: optionId, totalVotes: old.totalVotes + (selected ? 0 : 1), options: old.options.map((option) => ({ ...option, vote_count: option.vote_count + (option.id === optionId ? 1 : 0) - (option.id === selected ? 1 : 0) })) });
    setBusy(true);
    try { await cloudRequest(`/api/v1/posts/${postId}/poll`, { optionId }); const response = await cloudFetch(`/api/v1/posts/${postId}/poll`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "投票失败"); setPoll(result.data.poll); }
    catch (error) { setPoll(old); onNotice(error instanceof Error ? error.message : "投票失败，已恢复原状态"); }
    finally { setBusy(false); }
  };
  if (!loaded || !poll) return null;
  return <section className="post-poll" aria-label="帖子投票"><div className="post-poll-heading"><CircleHelp size={17}/><strong>{poll.question}</strong></div><div className="post-poll-options">{poll.options.map((option) => { const percent = poll.totalVotes ? Math.round(option.vote_count / poll.totalVotes * 100) : 0; const selected = poll.selectedOptionId === option.id; return <button type="button" key={option.id} className={`post-poll-option${poll.selectedOptionId ? " has-results" : ""}${selected ? " is-selected" : ""}`} disabled={busy || Boolean(poll.selectedOptionId)} onClick={() => void vote(option.id)} aria-pressed={selected}><i style={{ width: `${percent}%` }}/><span>{option.label}</span>{poll.selectedOptionId && <small>{percent}% · {option.vote_count}</small>}</button>; })}</div><small className="post-poll-total">{poll.totalVotes} 人参与{poll.selectedOptionId ? " · 你已投票" : " · 选择一个选项"}</small></section>;
}

export function PrivateHighlights({ postId, accountId, onLogin, onNotice, children }: { postId: string; accountId: string | null; onLogin: () => void; onNotice: (message: string) => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Highlight[]>([]), [selected, setSelected] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [savedOpen, setSavedOpen] = useState(false);
  const load = useCallback(async () => {
    if (!accountId) { setItems([]); return; }
    const response = await cloudFetch(`/api/v1/highlights?postId=${postId}`, { cache: "no-store" }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || "摘录加载失败"); setItems(result.data.items || []);
  }, [accountId, postId]);
  useEffect(() => { if (!accountId) { setItems([]); return; } void load().catch(() => {}); }, [accountId, load]);
  const capture = () => {
    const selection = window.getSelection(); const text = selection?.toString().trim() || "";
    if (!text || text.length > 1000 || !root.current?.contains(selection?.anchorNode || null) || !root.current?.contains(selection?.focusNode || null)) {
      setSelected(""); setNote("");
      return;
    }
    if (text !== selected) setNote("");
    setSavedOpen(false);
    setSelected(text);
  };
  const clearSelection = () => { setSelected(""); setNote(""); window.getSelection()?.removeAllRanges(); };
  const save = async () => {
    if (!accountId) return onLogin();
    if (!selected) return onNotice("先在正文中选中一段内容");
    setBusy(true);
    try { await cloudRequest("/api/v1/highlights", { postId, excerpt: selected, note }); await load(); clearSelection(); setSavedOpen(false); onNotice("已保存为仅自己可见的摘录"); }
    catch (error) { onNotice(error instanceof Error ? error.message : "摘录保存失败"); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await cloudRequest(`/api/v1/highlights?id=${id}`, undefined, "DELETE"); setItems((current) => current.filter((item) => item.id !== id)); } catch (error) { onNotice(error instanceof Error ? error.message : "删除失败"); } };
  return <div className="private-highlights-area"><div ref={root} className="private-highlight-selectable" onMouseUp={capture} onTouchEnd={capture}>{children}</div>
    {selected && <div className="private-highlight-compose"><div className="private-highlight-heading"><span><Highlighter size={15}/>私人笔记</span><small>仅自己可见</small></div><blockquote>{selected}</blockquote><textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="添加一条私人笔记（可选）"/><div><button type="button" onClick={clearSelection}>取消</button><button type="button" className="interactive-primary" disabled={busy} onClick={() => void save()}><BookmarkPlus size={14}/>{busy ? "保存中…" : "保存摘录"}</button></div></div>}
    {!!items.length && <><button type="button" className="private-highlight-saved-toggle" aria-expanded={savedOpen} onClick={() => setSavedOpen((open) => !open)}><span>已保存的私人摘录</span><small>{items.length}</small><ChevronDown size={14}/></button>{savedOpen && <div className="private-highlight-list">{items.map((item) => <article key={item.id}><blockquote>{item.excerpt}</blockquote>{item.note && <p>{item.note}</p>}<button type="button" aria-label="删除摘录" onClick={() => void remove(item.id)}><X size={14}/></button></article>)}</div>}</>}
  </div>;
}

export function RecommendationControls({ accountId, onLogin, onNotice, onChange }: { accountId: string | null; onLogin: () => void; onNotice: (message: string) => void; onChange?: () => void }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<Filter[]>([]), [busy, setBusy] = useState(false);
  const noticeRef = useRef(onNotice), changeRef = useRef(onChange);
  useEffect(() => { noticeRef.current = onNotice; changeRef.current = onChange; }, [onNotice, onChange]);
  const load = useCallback(async () => { const response = await cloudFetch("/api/v1/recommendation-feedback", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "推荐偏好读取失败"); setItems(result.data.items || []); }, []);
  useEffect(() => { if (open && accountId) void load().catch((error) => noticeRef.current(error instanceof Error ? error.message : "推荐偏好读取失败")); }, [open, accountId, load]);
  const remove = async (id: string) => { setBusy(true); try { await cloudRequest(`/api/v1/recommendation-feedback?id=${id}`, undefined, "DELETE"); setItems((current) => current.filter((item) => item.id !== id)); noticeRef.current("已恢复这类内容的推荐"); changeRef.current?.(); } catch (error) { noticeRef.current(error instanceof Error ? error.message : "设置未保存"); } finally { setBusy(false); } };
  return <section className="recommendation-controls"><button type="button" className="recommendation-controls-toggle" aria-expanded={open} onClick={() => { if (!accountId) return onLogin(); setOpen((value) => !value); }}><span><MessageSquareText size={15}/>推荐偏好</span><small>{open ? "收起" : "管理已减少的内容"}</small><ChevronDown size={15}/></button>{open && <div className="recommendation-controls-body">{items.length ? items.map((item) => { const profile = relation(item.profiles); const topic = relation(item.interest_tags); const label = item.filter_type === "author" ? profile?.nickname || "某位创作者" : `话题：${topic?.name || "已隐藏话题"}`; return <div className="recommendation-filter-row" key={item.id}><span>{item.filter_type === "author" ? "创作者" : "话题"}<strong>{label}</strong></span><button type="button" disabled={busy} onClick={() => void remove(item.id)}><Minus size={13}/>恢复推荐</button></div>; }) : <p>目前没有减少推荐的创作者或话题。</p>}</div>}</section>;
}
