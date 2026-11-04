"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Share2, Sparkles, UsersRound } from "lucide-react";
import type { Post } from "@/lib/content";
import type { CardRarityTier } from "@/lib/progression";
import { cloudRequest } from "@/lib/cloud";
import { dayKey } from "@/lib/content";

type ChainEntry = { id: string; user_id: string; content: string; created_at: string; author: { nickname: string; avatar_url: string | null } | null };
type ChainItem = { id: string; owner_id: string; seed_post_id: string; title: string; prompt: string; status: "active" | "closed"; created_at: string; seed: { title: string; images: string[] | null; cover_url: string | null; tag: string } | null; owner: { nickname: string; avatar_url: string | null } | null; entries: ChainEntry[] };

export function ExplorationRecap({ opened, rarityTiers, posts, onBack, onNotice, backLabel = "‹　我的" }: { opened: Record<string, number[]>; rarityTiers: Record<number, CardRarityTier>; posts: Post[]; onBack: () => void; onNotice: (message: string) => void; backLabel?: string }) {
  const month = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
  const monthKey = dayKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).slice(0, 7);
  const days = Object.entries(opened).filter(([date, ids]) => date.startsWith(monthKey) && ids.length);
  const ids = days.flatMap(([, values]) => values);
  const unique = new Set(ids);
  const activeDays = days.length;
  const rare = ids.reduce((counts, id) => { const tier = rarityTiers[id]; if (tier === "S" || tier === "SS" || tier === "SSS") counts[tier]++; return counts; }, { S: 0, SS: 0, SSS: 0 });
  const tags = new Map<string, number>();
  for (const id of unique) { const tag = posts.find((post) => post.id === id)?.tag; if (tag) tags.set(tag, (tags.get(tag) || 0) + 1); }
  const favoriteTag = [...tags].sort((a, b) => b[1] - a[1])[0]?.[0];
  const share = async () => {
    const message = `${month}，我在黑卡探索了 ${unique.size} 张内容，点亮 ${activeDays} 天，遇见 S/SS/SSS 稀有卡 ${rare.S + rare.SS + rare.SSS} 张${favoriteTag ? `，最常探索「${favoriteTag}」` : ""}。`;
    try { if (navigator.share) await navigator.share({ title: "我的黑卡月度探索", text: message }); else { await navigator.clipboard.writeText(message); onNotice("月度回顾文字已复制"); } } catch { /* 用户取消分享 */ }
  };
  return <section className="page exploration-feature-page monthly-recap-page"><button type="button" className="back settings-back" onClick={onBack}>{backLabel}</button><div className="eyebrow">EXPLORATION / MONTHLY</div><h1>探索月报<span className="red-dot">.</span></h1><p className="lead">{month}的灵感轨迹，由你的探索记录整理而成。</p>
    <div className="monthly-recap-card"><div className="monthly-recap-top"><span><Sparkles size={16}/> HEIKA · MONTHLY</span><small>{month}</small></div><div className="monthly-recap-primary"><strong>{unique.size}</strong><span>张卡片进入了你的这个月</span></div><div className="monthly-recap-metrics"><div><strong>{activeDays}</strong><span>探索日</span></div><div><strong>{rare.S + rare.SS + rare.SSS}</strong><span>稀有卡</span></div><div><strong>{days.reduce((sum, [, values]) => sum + values.length, 0)}</strong><span>次发现</span></div></div><div className="monthly-recap-tags"><span>本月最常探索</span><strong>{favoriteTag ? `#${favoriteTag}` : "等待第一份灵感"}</strong></div><div className="monthly-recap-rares">{(["S", "SS", "SSS"] as const).map((tier) => <span key={tier} className={`rarity-tier-${tier}`}>{tier}<b>{rare[tier]}</b></span>)}</div><div className="monthly-recap-calendar">{Array.from({ length: new Date().getDate() }, (_, index) => { const date = `${monthKey}-${String(index + 1).padStart(2, "0")}`; return <i key={date} className={(opened[date]?.length || 0) ? "active" : ""} title={`${date} · ${opened[date]?.length || 0} 张`} />; })}</div></div>
    <button type="button" className="primary-button full monthly-recap-share" onClick={() => void share()}><Share2 size={16}/> 分享本月回顾</button>
    {!unique.size && <p className="fineprint">这个月还没有翻卡记录，开始探索后，月报会自动整理天数、发现和稀有卡。</p>}
  </section>;
}

export function CardChainPanel({ accountId, posts, onLogin, onBack, onNotice, backLabel = "‹　我的" }: { accountId: string | null; posts: Post[]; onLogin: () => void; onBack: () => void; onNotice: (message: string) => void; backLabel?: string }) {
  const [items, setItems] = useState<ChainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [firstEntry, setFirstEntry] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState("");
  const onNoticeRef = useRef(onNotice);
  useEffect(() => { onNoticeRef.current = onNotice; }, [onNotice]);
  const cloudPosts = posts.filter((post) => post.cloudId && post.status !== "draft" && post.status !== "hidden");
  const load = useCallback(async () => { setLoading(true); try { const result = await cloudRequest("/api/v1/exploration-chains") as { items: ChainItem[] }; setItems(result.items || []); } catch (error) { onNoticeRef.current(error instanceof Error ? error.message : "接龙加载失败"); } finally { setLoading(false); } }, []);
  useEffect(() => { if (accountId) void load(); else setLoading(false); }, [accountId, load]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("chain"); if (id) setFocusId(id); }, []);
  useEffect(() => { if (focusId && items.length) document.getElementById(`chain-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focusId, items]);
  const create = async () => {
    if (!selected || title.trim().length < 4 || prompt.trim().length < 8 || firstEntry.trim().length < 8) return onNotice("请填写标题、接龙引子和第一段内容");
    const post = cloudPosts.find((item) => item.cloudId === selected); if (!post?.cloudId) return;
    setBusy(true); try { const created = await cloudRequest("/api/v1/exploration-chains", { action: "create", postId: post.cloudId, title, prompt, content: firstEntry }) as { id: string }; setTitle(""); setPrompt(""); setFirstEntry(""); setSelected(""); await load(); setFocusId(created.id); onNotice("接龙已发起，等其他探索者来续写"); }
    catch (error) { onNotice(error instanceof Error ? error.message : "接龙创建失败"); } finally { setBusy(false); }
  };
  const contribute = async (item: ChainItem) => { const content = drafts[item.id]?.trim(); if (!content || content.length < 8) return onNotice("续写至少需要 8 个字"); setBusy(true); try { await cloudRequest("/api/v1/exploration-chains", { action: "contribute", chainId: item.id, content }); setDrafts((state) => ({ ...state, [item.id]: "" })); await load(); onNotice("续写已加入接龙"); } catch (error) { onNotice(error instanceof Error ? error.message : "续写失败"); } finally { setBusy(false); } };
  const closeChain = async (item: ChainItem) => { setBusy(true); try { await cloudRequest("/api/v1/exploration-chains", { action: "close", chainId: item.id }); await load(); onNotice("接龙已结束，故事记录仍会保留"); } catch (error) { onNotice(error instanceof Error ? error.message : "结束接龙失败"); } finally { setBusy(false); } };
  const share = async (item: ChainItem) => { const url = `${location.origin}${location.pathname}?chain=${item.id}`; try { if (navigator.share) await navigator.share({ title: item.title, text: item.prompt, url }); else { await navigator.clipboard.writeText(url); onNotice("接龙邀请链接已复制"); } } catch { /* 用户取消分享 */ } };
  return <section className="page exploration-feature-page card-chain-page"><button type="button" className="back settings-back" onClick={onBack}>{backLabel}</button><div className="eyebrow">COMMUNITY / CARD CHAIN</div><h1>卡片接龙<span className="red-dot">.</span></h1><p className="lead">从一张卡片开始，邀请探索者写下各自的下一段。</p>
    {!accountId ? <div className="empty"><button className="primary-button" onClick={onLogin}>登录后参与接龙</button></div> : <form className="card-chain-create" onSubmit={(event) => { event.preventDefault(); void create(); }}><div className="card-chain-heading"><UsersRound size={18}/><strong>发起一个新故事</strong></div><label>选择起始卡片<select value={selected} onChange={(event) => { setSelected(event.target.value); const post = cloudPosts.find((item) => item.cloudId === event.target.value); if (post && !title) setTitle(post.title); }}><option value="">选择已发布的内容</option>{cloudPosts.map((post) => <option key={post.cloudId} value={post.cloudId}>{post.title}</option>)}</select></label><label>接龙标题<input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给这个故事一个名字"/></label><label>故事引子<input maxLength={220} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：如果这张卡片里的瞬间继续下去……"/></label><label>第一段<textarea maxLength={600} value={firstEntry} onChange={(event) => setFirstEntry(event.target.value)} placeholder="从起始卡片往下写，留一个空间给下一位探索者"/></label><button className="primary-button full" disabled={busy || !selected}><ArrowRight size={16}/> {busy ? "正在发布…" : "发布并邀请续写"}</button><small>每位探索者可为同一接龙续写一次，避免内容重复。</small></form>}
    <div className="card-chain-list-heading"><h2>正在接续的故事</h2><button type="button" onClick={() => void load()} disabled={loading}><Check size={14}/> 刷新</button></div>
    {loading ? <div className="empty">正在加载接龙…</div> : items.length ? <div className="card-chain-list">{items.map((item) => { const ownEntry = item.entries.some((entry) => entry.user_id === accountId); const isOwner = item.owner_id === accountId; const seedImage = item.seed?.cover_url || item.seed?.images?.[0]; return <article className={`card-chain-card${focusId === item.id ? " is-focused" : ""}`} id={`chain-${item.id}`} key={item.id}><header><span>#{item.seed?.tag || "探索"} · {item.owner?.nickname || "探索者"} 发起 · {item.status === "closed" ? "已结束" : "进行中"}</span><span className="card-chain-header-actions"><button type="button" aria-label="分享接龙" onClick={() => void share(item)}><Share2 size={16}/></button>{isOwner && item.status === "active" && <button type="button" disabled={busy} onClick={() => void closeChain(item)}>结束</button>}</span></header>{seedImage && <img className="card-chain-cover" src={seedImage} alt="" onError={(event) => { event.currentTarget.src = "/image-not-loaded.svg"; }}/>}<h3>{item.title}</h3><p className="card-chain-prompt">{item.prompt}</p><div className="card-chain-entries">{item.entries.map((entry, index) => <div key={entry.id}><span>{String(index + 1).padStart(2, "0")}</span><p>{entry.content}</p><small>{entry.author?.nickname || "探索者"} · {new Date(entry.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></div>)}</div>{item.status === "active" && accountId && !ownEntry && <div className="card-chain-compose"><textarea maxLength={600} value={drafts[item.id] || ""} onChange={(event) => setDrafts((state) => ({ ...state, [item.id]: event.target.value }))} placeholder="写下下一段，让故事继续…"/><button type="button" className="primary-button" disabled={busy || (drafts[item.id] || "").trim().length < 8} onClick={() => void contribute(item)}>接着写</button></div>}{ownEntry && <small className="card-chain-own-note">你已为这个故事续写</small>}</article>; })}</div> : <div className="empty">还没有正在接续的故事，从一张喜欢的卡片开始吧。</div>}
  </section>;
}
