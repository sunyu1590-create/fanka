"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, Bookmark, ChevronRight, Code2, Compass, ExternalLink, FileText, Search, Sparkles, Wrench } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import type { Post } from "@/lib/content";

type Category = { id: number; name: string; description: string; sort_order: number; is_featured: boolean; parent_id: number | null };
type FeedResult = { items: Post[]; total: number; page: number; limit: number };
type Props = {
  accountId: string | null;
  onOpen: (post: Post, source: Element | null) => void;
  onLogin: () => void;
  onNotice: (message: string) => void;
  hidden?: boolean;
};

const typeLabels: Record<string, string> = { knowledge_article: "AI 知识", agent: "Agent", skill: "Skills", prompt: "Prompt", ai_tool: "AI 工具", tutorial: "实战教程" };
const typeIcons: Record<string, typeof Sparkles> = { knowledge_article: FileText, agent: Sparkles, skill: Code2, prompt: Code2, ai_tool: Wrench, tutorial: Compass };
type AISpaceView = "home" | "categories" | "feed" | "search";

async function fetchFeed(params: URLSearchParams, signal?: AbortSignal) {
  const response = await cloudFetch(`/api/v1/ai-space?${params}`, { cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "AI 内容加载失败");
  return result.data as FeedResult;
}

function ResultsSection({ heading, eyebrow, total, error, loading, items, card, hasMore, onMore }: {
  heading: string;
  eyebrow: string;
  total: number;
  error: string;
  loading: boolean;
  items: Post[];
  card: (post: Post) => ReactNode;
  hasMore: boolean;
  onMore: () => void;
}) {
  return <section className="ai-space-section ai-space-results">
    <div className="ai-space-section-head"><div><small>{eyebrow}</small><h2>{heading}</h2></div><span>{total} 项</span></div>
    {error ? <div className="ai-space-empty">{error}</div> : items.length ? <div className="ai-resource-grid">{items.map(card)}</div> : loading ? <div className="ai-space-empty">正在加载 AI 内容…</div> : <div className="ai-space-empty">还没有相关内容，欢迎发布第一篇。</div>}
    {hasMore && <button type="button" className="ai-space-more" disabled={loading} onClick={onMore}>{loading ? "正在加载…" : "加载更多"}</button>}
  </section>;
}

export default function AISpace({ accountId, onOpen, onLogin, onNotice, hidden = false }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState<AISpaceView>("home");
  const [feedReturnView, setFeedReturnView] = useState<"home" | "categories">("home");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [contentType, setContentType] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
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
    if (hidden) return;
    let active = true;
    void cloudFetch("/api/v1/categories?channel=ai&kind=category", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (!active || !Array.isArray(result.data?.items)) return;
      setCategories(result.data.items as Category[]);
    }).catch(() => {});
    return () => { active = false; };
  }, [hidden]);

  const categoriesByRoot = useMemo(() => categories.filter((item) => !item.parent_id), [categories]);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const categoryChildren = useMemo(() => selectedCategory ? categories.filter((item) => item.parent_id === selectedCategory.id) : [], [categories, selectedCategory]);
  const searchSuggestions = useMemo(() => {
    const posts = [...popular, ...featured, ...tutorials];
    const terms = [...new Set(posts.flatMap((post) => [...(post.topics || []), post.tag]).map((term) => term.trim()).filter(Boolean))];
    return terms.length ? terms.slice(0, 8) : categoriesByRoot.map((item) => item.name).slice(0, 8);
  }, [categoriesByRoot, featured, popular, tutorials]);

  const fetchSection = useCallback(async (sort: string, type?: string) => {
    const params = new URLSearchParams({ sort, limit: "8" });
    if (type) params.set("type", type);
    return fetchFeed(params).then((result) => result.items || []);
  }, []);

  const refreshSections = useCallback(() => {
    void Promise.all([fetchSection("featured"), fetchSection("popular"), fetchSection("latest", "tutorial")]).then(([featuredItems, popularItems, tutorialItems]) => {
      setFeatured(featuredItems);
      setPopular(popularItems);
      setTutorials(tutorialItems);
    }).catch(() => {});
  }, [fetchSection]);

  useEffect(() => { if (!hidden) refreshSections(); }, [hidden, refreshSections]);

  useEffect(() => {
    if (hidden) return;
    let active = true;
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ sort: "latest", page: "1", limit: "12" });
      if (categoryId) params.set("category", String(categoryId));
      if (contentType) params.set("type", contentType);
      if (searchTerm) params.set("q", searchTerm);
      try {
        const result = await fetchFeed(params, controller.signal);
        if (!active) return;
        setList(result.items || []);
        setTotal(result.total || 0);
        setPage(1);
        setSavedIds(new Set((result.items || []).filter((item) => item.saved).map((item) => item.id)));
      } catch (e) {
        if (active) { setList([]); setTotal(0); setError(e instanceof Error ? e.message : "AI 内容加载失败"); }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => { active = false; controller.abort(); };
  }, [hidden, categoryId, contentType, searchTerm]);

  const loadMore = async () => {
    if (loading || list.length >= total) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: "latest", page: String(page + 1), limit: "12" });
      if (categoryId) params.set("category", String(categoryId));
      if (contentType) params.set("type", contentType);
      if (searchTerm) params.set("q", searchTerm);
      const result = await fetchFeed(params);
      setList((current) => [...current, ...(result.items || [])]);
      setPage((current) => current + 1);
      setSavedIds((current) => new Set([...current, ...(result.items || []).filter((item) => item.saved).map((item) => item.id)]));
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "加载更多失败");
    } finally {
      setLoading(false);
    }
  };

  const changeCategory = (value: number | null, returnView: "home" | "categories" = "categories") => {
    setCategoryId(value);
    setContentType("");
    setSearchTerm("");
    setFeedReturnView(returnView);
    setView("feed");
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setCategoryId(null);
    setContentType("");
    setSearchTerm(searchDraft.trim());
    setView("search");
  };
  const searchFor = (term: string) => {
    setSearchDraft(term);
    setCategoryId(null);
    setContentType("");
    setSearchTerm(term);
    setView("search");
  };
  const openTypeFeed = (type: string) => {
    setCategoryId(null);
    setSearchTerm("");
    setContentType(type);
    setFeedReturnView("home");
    setView("feed");
  };
  const toggleSaved = async (post: Post, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!accountId) { onLogin(); return; }
    const next = !savedIds.has(post.id);
    setSavedIds((current) => { const update = new Set(current); if (next) update.add(post.id); else update.delete(post.id); return update; });
    try {
      await cloudRequest("/api/v1/library-state", { action: "bookmark", id: post.id, value: next });
    } catch (e) {
      setSavedIds((current) => { const update = new Set(current); if (next) update.delete(post.id); else update.add(post.id); return update; });
      onNotice(e instanceof Error ? e.message : "收藏同步失败");
    }
  };

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
    <header className="ai-space-heading"><div><span>HEIKA / AI</span><h1>AI 空间</h1><p>智能体、工具与实战经验，汇集成可复用的知识。</p></div></header>

    {view === "home" && <>
      <div className="ai-space-home-actions"><button type="button" onClick={() => setView("search")}><Search size={15}/>搜索 AI 内容</button><button type="button" onClick={() => setView("categories")}><Compass size={15}/>浏览分类</button></div>
      <div className="ai-space-editorial-home">
        {!!featured.length && <section className="ai-space-section ai-space-featured"><div className="ai-space-section-head"><div><small>CURATED</small><h2>精选推荐</h2></div><button type="button" onClick={() => openTypeFeed("")}>查看全部 <ChevronRight size={15}/></button></div><div className="ai-resource-grid">{featured.slice(0, 3).map(card)}</div></section>}
        {!!popular.length && <section className="ai-space-section"><div className="ai-space-section-head"><div><small>POPULAR</small><h2>热门资源</h2></div></div><div className="ai-resource-grid">{popular.slice(0, 3).map(card)}</div></section>}
        {!!tutorials.length && <section className="ai-space-section"><div className="ai-space-section-head"><div><small>BUILD</small><h2>实用教程</h2></div><button type="button" onClick={() => openTypeFeed("tutorial")}>更多教程 <ChevronRight size={15}/></button></div><div className="ai-resource-grid">{tutorials.slice(0, 3).map(card)}</div></section>}
      </div>
      <ResultsSection heading="最新发布" eyebrow="LATEST" total={total} error={error} loading={loading} items={list} card={card} hasMore={list.length < total} onMore={() => void loadMore()} />
    </>}

    {view === "categories" && <section className="ai-space-secondary" aria-labelledby="ai-space-categories-title">
      <div className="ai-space-secondary-heading"><button type="button" className="ai-space-back" onClick={() => setView("home")}><ArrowLeft size={16}/>返回 AI 空间</button><div><small>AI LIBRARY</small><h2 id="ai-space-categories-title">浏览分类</h2><p>选择一个方向，查看相关知识、工具与资源。</p></div></div>
      <div className="ai-space-category-list">
        <button type="button" className="ai-space-category-row" onClick={() => changeCategory(null)}><span className="ai-space-category-icon"><Sparkles size={17}/></span><span><strong>全部 AI 内容</strong><small>浏览所有分类的最新发布</small></span><ChevronRight size={16}/></button>
        {categoriesByRoot.map((item, index) => {
          const Icon = [Sparkles, Code2, FileText, Compass, Wrench, ExternalLink][index % 6];
          return <button type="button" className="ai-space-category-row" key={item.id} onClick={() => changeCategory(item.id)}><span className="ai-space-category-icon"><Icon size={17}/></span><span><strong>{item.name}</strong><small>{item.description || "知识文章、工具与实用资源"}</small></span><ChevronRight size={16}/></button>;
        })}
      </div>
    </section>}

    {view === "feed" && <section className="ai-space-secondary ai-space-results-view" aria-labelledby="ai-space-feed-title">
      <div className="ai-space-secondary-heading"><button type="button" className="ai-space-back" onClick={() => setView(feedReturnView)}><ArrowLeft size={16}/>{feedReturnView === "categories" ? "返回分类" : "返回 AI 空间"}</button><div><small>{categoryId ? "AI CATEGORY" : "AI CONTENT"}</small><h2 id="ai-space-feed-title">{selectedCategory?.name || typeLabels[contentType] || "全部 AI 内容"}</h2></div></div>
      {categoryChildren.length > 0 && <div className="ai-space-subcategories" role="group" aria-label={`${selectedCategory?.name}子分类`}><button className="selected" onClick={() => changeCategory(selectedCategory?.id || null)}>全部{selectedCategory ? ` ${selectedCategory.name}` : ""}</button>{categoryChildren.map((item) => <button key={item.id} className={categoryId === item.id ? "selected" : ""} onClick={() => changeCategory(item.id)}>{item.name}</button>)}</div>}
      <ResultsSection heading={selectedCategory?.name || typeLabels[contentType] || "最新发布"} eyebrow="LATEST" total={total} error={error} loading={loading} items={list} card={card} hasMore={list.length < total} onMore={() => void loadMore()} />
    </section>}

    {view === "search" && <section className="ai-space-secondary ai-space-search-view" aria-labelledby="ai-space-search-title">
      <div className="ai-space-secondary-heading"><button type="button" className="ai-space-back" onClick={() => setView("home")}><ArrowLeft size={16}/>返回 AI 空间</button><div><small>AI SEARCH</small><h2 id="ai-space-search-title">搜索 AI 内容</h2><p>搜索 Agent、Skills、Prompt、工具和教程。</p></div></div>
      <form className="ai-space-search" role="search" onSubmit={submitSearch}><Search size={17}/><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="输入关键词" maxLength={60}/>{searchDraft && <button type="button" onClick={() => { setSearchDraft(""); setSearchTerm(""); }}>清除</button>}<button type="submit" aria-label="搜索"><Search size={16}/></button></form>
      {searchTerm ? <ResultsSection heading={`“${searchTerm}”的结果`} eyebrow="SEARCH RESULTS" total={total} error={error} loading={loading} items={list} card={card} hasMore={list.length < total} onMore={() => void loadMore()} /> : <>
        <section className="ai-search-suggestions" aria-label="AI 内容搜索推荐">
          <div className="ai-search-suggestions-head"><strong>{popular.length ? "热门搜索" : "分类快捷搜索"}</strong><span>{popular.length ? "来自近期热门内容" : "从 AI 分类开始探索"}</span></div>
          {searchSuggestions.length ? <div className="ai-search-suggestion-list">{searchSuggestions.map((term) => <button type="button" key={term} onClick={() => searchFor(term)}><Search size={13}/>{term}</button>)}</div> : <p className="ai-space-search-hint">输入关键词后可查找知识文章、结构化资源与实战教程。</p>}
        </section>
        {popular.length > 0 && <section className="ai-search-recommended"><div className="ai-space-section-head"><div><small>POPULAR</small><h2>大家正在关注</h2></div></div><div className="ai-resource-grid">{popular.slice(0, 3).map(card)}</div></section>}
      </>}
    </section>}
  </section>;
}
