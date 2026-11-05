"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { Bookmark, ChevronRight, Code2, Compass, ExternalLink, FileText, Search, Sparkles, Wrench } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import type { Post } from "@/lib/content";

type Category = { id: number; name: string; description: string; sort_order: number; is_featured: boolean; parent_id: number | null };
type FeedResult = { items: Post[]; total: number; page: number; limit: number };
type Props = {
  accountId: string | null;
  onOpen: (post: Post, source: Element | null) => void;
  onCreate: () => void;
  onLogin: () => void;
  onNotice: (message: string) => void;
  hidden?: boolean;
};

const typeLabels: Record<string, string> = { knowledge_article: "AI 知识", agent: "Agent", skill: "Skills", prompt: "Prompt", ai_tool: "AI 工具", tutorial: "实战教程" };
const typeIcons: Record<string, typeof Sparkles> = { knowledge_article: FileText, agent: Sparkles, skill: Code2, prompt: Code2, ai_tool: Wrench, tutorial: Compass };

async function fetchFeed(params: URLSearchParams, signal?: AbortSignal) {
  const response = await cloudFetch(`/api/v1/ai-space?${params}`, { cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "AI 内容加载失败");
  return result.data as FeedResult;
}

export default function AISpace({ accountId, onOpen, onCreate, onLogin, onNotice, hidden = false }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [contentType, setContentType] = useState<string>("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [list, setList] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [featured, setFeatured] = useState<Post[]>([]);
  const [popular, setPopular] = useState<Post[]>([]);
  const [tutorials, setTutorials] = useState<Post[]>([]);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let active = true;
    void cloudFetch("/api/v1/categories?channel=ai&kind=category", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (!active || !Array.isArray(result.data?.items)) return;
      const items = result.data.items as Category[];
      setCategories(items);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const fetchSection = useCallback(async (sort: string, type?: string) => {
    const params = new URLSearchParams({ sort, limit: "8" });
    if (type) params.set("type", type);
    if (categoryId) params.set("category", String(categoryId));
    return fetchFeed(params).then((result) => result.items || []);
  }, [categoryId]);

  const refreshSections = useCallback(() => {
    if (searchTerm || categoryId || contentType || savedOnly) return;
    void Promise.all([fetchSection("featured"), fetchSection("popular"), fetchSection("latest", "tutorial")]).then(([featuredItems, popularItems, tutorialItems]) => {
      setFeatured(featuredItems); setPopular(popularItems); setTutorials(tutorialItems);
    }).catch(() => {});
  }, [fetchSection, searchTerm, categoryId, contentType, savedOnly]);

  useEffect(() => { refreshSections(); }, [refreshSections]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const run = async () => {
      setLoading(true); setError("");
      const params = new URLSearchParams({ sort: "latest", page: "1", limit: "12" });
      if (categoryId) params.set("category", String(categoryId));
      if (contentType) params.set("type", contentType);
      if (searchTerm) params.set("q", searchTerm);
      if (savedOnly) params.set("saved", "1");
      try {
        const result = await fetchFeed(params, controller.signal);
        if (!active) return;
        setList(result.items || []); setTotal(result.total || 0); setPage(1);
        setSavedIds(new Set((result.items || []).filter((item) => item.saved).map((item) => item.id)));
      } catch (e) { if (active) { setList([]); setTotal(0); setError(e instanceof Error ? e.message : "AI 内容加载失败"); } }
      finally { if (active) setLoading(false); }
    };
    void run();
    return () => { active = false; controller.abort(); };
  }, [categoryId, contentType, searchTerm, savedOnly]);

  const loadMore = async () => {
    if (loading || list.length >= total) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: "latest", page: String(page + 1), limit: "12" });
      if (categoryId) params.set("category", String(categoryId));
      if (contentType) params.set("type", contentType);
      if (searchTerm) params.set("q", searchTerm);
      if (savedOnly) params.set("saved", "1");
      const result = await fetchFeed(params);
      setList((current) => [...current, ...(result.items || [])]); setPage(page + 1);
      setSavedIds((current) => new Set([...current, ...(result.items || []).filter((item) => item.saved).map((item) => item.id)]));
    } catch (e) { onNotice(e instanceof Error ? e.message : "加载更多失败"); }
    finally { setLoading(false); }
  };

  const submitSearch = (event: FormEvent) => { event.preventDefault(); setSearchTerm(searchDraft.trim()); };
  const changeCategory = (value: number | null) => { setCategoryId(value); setSavedOnly(false); };
  const toggleSaved = async (post: Post, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!accountId) { onLogin(); return; }
    const next = !savedIds.has(post.id);
    setSavedIds((current) => { const update = new Set(current); if (next) update.add(post.id); else update.delete(post.id); return update; });
    try { await cloudRequest("/api/v1/library-state", { action: "bookmark", id: post.id, value: next }); }
    catch (e) { setSavedIds((current) => { const update = new Set(current); if (next) update.delete(post.id); else update.add(post.id); return update; }); onNotice(e instanceof Error ? e.message : "收藏同步失败"); }
  };
  const categoriesByRoot = useMemo(() => categories.filter((item) => !item.parent_id), [categories]);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const categoryChildren = useMemo(() => selectedCategory ? categories.filter((item) => item.parent_id === selectedCategory.id) : [], [categories, selectedCategory]);
  const card = (post: Post) => {
    const Icon = typeIcons[post.contentType || "knowledge_article"] || FileText;
    return <article className="ai-resource-card" key={post.id}>
      <button className="ai-resource-open" type="button" data-discover-id={post.id} onClick={(event) => onOpen(post, event.currentTarget)}>
        <span className="ai-resource-cover">{post.image ? <img src={post.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.dataset.failed = "true"; }} /> : <span className="ai-resource-cover-mark"><Icon size={22}/></span>}<span className="ai-resource-kind"><Icon size={13}/>{typeLabels[post.contentType || "knowledge_article"] || "AI 内容"}</span></span>
        <span className="ai-resource-copy"><small>{post.tag} · {post.author}</small><strong>{post.title}</strong><span>{post.body.replace(/[#*`>_\[\]()]/g, " ").replace(/\s+/g, " ").slice(0, 100)}</span><i>{post.date} · {post.viewCount || 0} 阅读</i></span>
      </button>
      <button type="button" className={`ai-resource-save${savedIds.has(post.id) ? " saved" : ""}`} aria-label={savedIds.has(post.id) ? "取消收藏" : "收藏资源"} onClick={(event) => void toggleSaved(post, event)}><Bookmark size={16} fill={savedIds.has(post.id) ? "currentColor" : "none"}/></button>
    </article>;
  };

  return <section className="ai-space" hidden={hidden} aria-label="AI 空间">
    <header className="ai-space-heading"><div><span>HEIKA / AI</span><h1>AI 空间</h1><p>智能体、工具与实战经验，汇集成可复用的知识。</p></div><button type="button" className="ai-space-create" onClick={accountId ? onCreate : onLogin}>发布 AI 内容</button></header>
    <form className="ai-space-search" role="search" onSubmit={submitSearch}><Search size={17}/><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索 Agent、Skills、Prompt 与教程" maxLength={60}/>{searchDraft && <button type="button" onClick={() => { setSearchDraft(""); setSearchTerm(""); }}>清除</button>}<button type="submit" aria-label="搜索"><Search size={16}/></button></form>
    <div className="ai-space-toolbar"><div className="ai-space-category-nav"><div className="ai-space-categories" role="group" aria-label="AI 内容分类"><button className={!categoryId ? "selected" : ""} onClick={() => changeCategory(null)}>全部</button>{categoriesByRoot.map((item) => <button key={item.id} className={categoryId === item.id ? "selected" : ""} title={item.description} onClick={() => changeCategory(item.id)}>{item.name}</button>)}</div>{categoryChildren.length > 0 && <div className="ai-space-subcategories" role="group" aria-label={`${selectedCategory?.name}子分类`}><button className={categoryId === selectedCategory?.id ? "selected" : ""} onClick={() => changeCategory(selectedCategory?.id || null)}>全部{selectedCategory ? ` ${selectedCategory.name}` : ""}</button>{categoryChildren.map((item) => <button key={item.id} className={categoryId === item.id ? "selected" : ""} onClick={() => changeCategory(item.id)}>{item.name}</button>)}</div>}</div><button type="button" className={`ai-space-saved${savedOnly ? " selected" : ""}`} onClick={() => { if (!accountId) { onLogin(); return; } setSavedOnly((value) => !value); }}><Bookmark size={14}/>我的收藏</button></div>
    {!!contentType && <button type="button" className="ai-space-clear-filter" onClick={() => setContentType("")}>清除类型筛选 ×</button>}
    {!searchTerm && !savedOnly && !categoryId && !contentType && <div className="ai-space-editorial-home">
      {!!featured.length && <section className="ai-space-section ai-space-featured"><div className="ai-space-section-head"><div><small>CURATED</small><h2>精选推荐</h2></div><button onClick={() => setContentType("")}>查看全部 <ChevronRight size={15}/></button></div><div className="ai-resource-grid">{featured.slice(0, 3).map(card)}</div></section>}
      <section className="ai-space-section"><div className="ai-space-section-head"><div><small>LIBRARY</small><h2>分类入口</h2></div></div><div className="ai-category-grid">{categoriesByRoot.map((item, index) => { const Icon = [Sparkles, Code2, FileText, Compass, Wrench, ExternalLink][index % 6]; return <button type="button" key={item.id} onClick={() => changeCategory(item.id)}><span><Icon size={17}/></span><strong>{item.name}</strong><small>{item.description || "精选内容与实用资源"}</small><ChevronRight size={15}/></button>; })}</div></section>
      {!!popular.length && <section className="ai-space-section"><div className="ai-space-section-head"><div><small>POPULAR</small><h2>热门资源</h2></div></div><div className="ai-resource-grid">{popular.slice(0, 3).map(card)}</div></section>}
      {!!tutorials.length && <section className="ai-space-section"><div className="ai-space-section-head"><div><small>BUILD</small><h2>实用教程</h2></div><button onClick={() => setContentType("tutorial")}>更多教程 <ChevronRight size={15}/></button></div><div className="ai-resource-grid">{tutorials.slice(0, 3).map(card)}</div></section>}
    </div>}
    <section className="ai-space-section ai-space-results"><div className="ai-space-section-head"><div><small>{searchTerm ? "SEARCH RESULTS" : savedOnly ? "SAVED RESOURCES" : "LATEST"}</small><h2>{searchTerm ? `“${searchTerm}”的结果` : savedOnly ? "我的收藏" : contentType ? typeLabels[contentType] || "AI 内容" : "最新发布"}</h2></div><span>{total} 项</span></div>
      {!searchTerm && !savedOnly && <div className="ai-type-filters" role="group" aria-label="AI 内容类型"><button className={!contentType ? "selected" : ""} onClick={() => setContentType("")}>全部</button>{Object.entries(typeLabels).map(([value, label]) => <button key={value} className={contentType === value ? "selected" : ""} onClick={() => setContentType(value)}>{label}</button>)}</div>}
      {error ? <div className="ai-space-empty">{error}</div> : list.length ? <div className="ai-resource-grid">{list.map(card)}</div> : loading ? <div className="ai-space-empty">正在加载 AI 内容…</div> : <div className="ai-space-empty">{savedOnly ? "收藏的 AI 资源会显示在这里。" : "这个分类还没有内容，欢迎发布第一篇。"}</div>}
      {list.length < total && <button type="button" className="ai-space-more" disabled={loading} onClick={() => void loadMore()}>{loading ? "正在加载…" : "加载更多"}</button>}
    </section>
  </section>;
}
