"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, Blocks, Bookmark, Bot, BrainCircuit, ChevronRight, Code2, Compass, ExternalLink, FileText, ImageOff, RotateCcw, Search, SlidersHorizontal, Sparkles, Terminal, Wrench } from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import type { Post } from "@/lib/content";
import { ProfileBadgeMarks } from "./ProfileBadgeList";

type Category = { id: number; name: string; description: string; sort_order: number; is_featured: boolean; parent_id: number | null };
type FeedResult = { items: Post[]; total: number; page: number; limit: number };
type ResourceType = { resource_type: string; label: string; description: string; sort_order: number; published_count: number };
type Props = {
  accountId: string | null;
  onOpen: (post: Post, source: Element | null) => void;
  onLogin: () => void;
  onNotice: (message: string) => void;
  hidden?: boolean;
};

/** 与 Android 端 resourceTypePresentation 完全一致：名称、描述、排序以服务端目录为准，图标按类型固定。 */
const RESOURCE_TYPE_PRESENTATION: Record<string, { icon: typeof Sparkles; label: string; description: string }> = {
  agent: { icon: Bot, label: "Agent", description: "智能体与自动化任务。" },
  skill: { icon: Blocks, label: "Skills", description: "技能插件与能力扩展。" },
  prompt: { icon: Terminal, label: "Prompt", description: "提示词与实用模板。" },
  ai_tool: { icon: Wrench, label: "AI 工具", description: "应用与效率工具。" },
  knowledge_article: { icon: BrainCircuit, label: "AI 知识", description: "模型知识与使用技巧。" },
  tutorial: { icon: FileText, label: "案例实践", description: "真实场景与操作教程。" },
};
const typeLabels: Record<string, string> = Object.fromEntries(Object.entries(RESOURCE_TYPE_PRESENTATION).map(([key, value]) => [key, value.label]));
const typeIcons: Record<string, typeof Sparkles> = Object.fromEntries(Object.entries(RESOURCE_TYPE_PRESENTATION).map(([key, value]) => [key, value.icon]));
type AISpaceView = "home" | "categories" | "feed";
type AiHistoryState = { heikaAiView?: AISpaceView; categoryId?: number | null; contentType?: string; searchTerm?: string; returnView?: "home" | "categories" } | null;

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

/** 单张 AI 资源卡：有图走封面布局，无图不渲染图片区，图片加载失败给可重试的错误态。 */
function ResourceCard({ post, saved, onOpen, onToggleSave }: {
  post: Post;
  saved: boolean;
  onOpen: (post: Post, source: Element | null) => void;
  onToggleSave: (post: Post, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverAttempt, setCoverAttempt] = useState(0);
  const rawCover = typeof post.image === "string" ? post.image.trim() : "";
  // null / undefined / 空串 / 纯空白都按无图处理：不渲染图片区、不保留高度、不生成占位。
  const textOnly = !rawCover;
  const Icon = typeIcons[post.contentType || "knowledge_article"] || FileText;
  const typeLabel = typeLabels[post.contentType || "knowledge_article"] || "AI 内容";
  const excerpt = post.body.replace(/[#*`>_\[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return <article className={`ai-resource-card${textOnly ? " is-text-only" : ""}${rawCover && coverFailed ? " is-cover-failed" : ""}`}>
    <button className="ai-resource-open" type="button" data-discover-id={post.id} onClick={(event) => onOpen(post, event.currentTarget)}>
      {rawCover ? <>
        {coverFailed ? <span className="ai-resource-cover-failed"><ImageOff size={15}/><strong>封面加载失败</strong><button type="button" onClick={(event) => { event.stopPropagation(); setCoverAttempt((value) => value + 1); setCoverFailed(false); }}><RotateCcw size={12}/>重试</button></span>
          : <span className="ai-resource-cover"><img key={coverAttempt} src={rawCover} alt="" loading="lazy" onError={() => setCoverFailed(true)} /><span className="ai-resource-cover-labels"><span className="discovery-glass-label"><Icon size={13}/>{typeLabel}</span></span></span>}
        <span className="ai-resource-copy"><small>{post.author}<ProfileBadgeMarks badges={post.authorBadges || []} compact/></small><strong>{post.title}</strong><span>{excerpt}</span><i>{post.date} · {post.viewCount || 0} 阅读</i></span>
      </> : <>
        <span className="ai-resource-text-type"><Icon size={13}/>{typeLabel}</span>
        <span className="ai-resource-copy"><strong>{post.title}</strong><span>{excerpt}</span></span>
        <span className="ai-resource-text-meta">{post.author}<ProfileBadgeMarks badges={post.authorBadges || []} compact/><i>{post.date} · {post.viewCount || 0} 阅读</i></span>
      </>}
    </button>
    <button type="button" className={`ai-resource-save${saved ? " saved" : ""}`} aria-label={saved ? "取消收藏" : "收藏资源"} onClick={(event) => onToggleSave(post, event)}><Bookmark size={16} fill={saved ? "currentColor" : "none"}/></button>
  </article>;
}

export default function AISpace({ accountId, onOpen, onLogin, onNotice, hidden = false }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [view, setView] = useState<AISpaceView>("home");
  const [feedReturnView, setFeedReturnView] = useState<"home" | "categories">("home");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [contentType, setContentType] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"latest" | "popular" | "featured">("latest");
  const [list, setList] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [featured, setFeatured] = useState<Post[]>([]);
  const [popular, setPopular] = useState<Post[]>([]);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const historySeq = useRef(0);

  useEffect(() => {
    let active = true;
    void cloudFetch("/api/v1/categories?channel=ai&kind=category", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (!active || !Array.isArray(result.data?.items)) return;
      setCategories(result.data.items as Category[]);
    }).catch(() => {});
    void cloudFetch("/api/v1/ai-resource-types", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (!active || !Array.isArray(result?.items) && !Array.isArray(result?.data?.items)) return;
      setResourceTypes((result.data?.items || result.items) as ResourceType[]);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // 分类中心是独立二级页面：进入子级时写入历史栈，浏览器前进/后退可回到上一层并保留选择。
  const pushHistory = useCallback((next: AISpaceView, extra: { categoryId?: number | null; contentType?: string; searchTerm?: string; returnView?: "home" | "categories" } = {}) => {
    historySeq.current += 1;
    const state: Exclude<AiHistoryState, null> = { heikaAiView: next, categoryId, contentType, searchTerm, returnView: feedReturnView, ...extra };
    try { history.pushState(state, ""); } catch { /* 历史栈满时忽略 */ }
  }, [categoryId, contentType, searchTerm, feedReturnView]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as Exclude<AiHistoryState, null>;
      const next: AISpaceView = state.heikaAiView === "categories" || state.heikaAiView === "feed" ? state.heikaAiView : "home";
      setView(next);
      setCategoryId(state.categoryId ?? null);
      setContentType(state.contentType ?? "");
      setSearchTerm(state.searchTerm ?? "");
      setSearchDraft(state.searchTerm ?? "");
      setFeedReturnView(state.returnView === "categories" ? "categories" : "home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const categoriesByRoot = useMemo(() => categories.filter((item) => !item.parent_id), [categories]);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const categoryChildren = useMemo(() => selectedCategory ? categories.filter((item) => item.parent_id === selectedCategory.id) : [], [categories, selectedCategory]);
  const searchSuggestions = useMemo(() => {
    const posts = [...popular, ...featured];
    const terms = [...new Set(posts.flatMap((post) => [...(post.topics || []), post.tag]).map((term) => term.trim()).filter(Boolean))];
    return terms.length ? terms.slice(0, 8) : categoriesByRoot.map((item) => item.name).slice(0, 8);
  }, [categoriesByRoot, featured, popular]);

  const fetchSection = useCallback(async (sort: string, type?: string) => {
    const params = new URLSearchParams({ sort, limit: "8" });
    if (type) params.set("type", type);
    return fetchFeed(params).then((result) => result.items || []);
  }, []);

  const refreshSections = useCallback(() => {
    void Promise.all([fetchSection("featured"), fetchSection("popular")]).then(([featuredItems, popularItems]) => {
      setFeatured(featuredItems);
      setPopular(popularItems);
    }).catch(() => {});
  }, [fetchSection]);

  useEffect(() => { refreshSections(); }, [refreshSections]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ sort: sortMode, page: "1", limit: "12" });
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
  }, [categoryId, contentType, searchTerm, sortMode]);

  const loadMore = async () => {
    if (loading || list.length >= total) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: sortMode, page: String(page + 1), limit: "12" });
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
    setSearchDraft("");
    setFeedReturnView(returnView);
    setView("feed");
    pushHistory("feed", { categoryId: value, contentType: "", searchTerm: "", returnView });
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = searchDraft.trim();
    setCategoryId(null);
    setContentType("");
    setSearchTerm(term);
    if (term) pushHistory("home", { categoryId: null, contentType: "", searchTerm: term });
  };
  const searchFor = (term: string) => {
    setSearchDraft(term);
    setCategoryId(null);
    setContentType("");
    setSearchTerm(term);
    pushHistory("home", { categoryId: null, contentType: "", searchTerm: term });
  };
  const openTypeFeed = (type: string, returnView: "home" | "categories" = "home") => {
    setCategoryId(null);
    setSearchTerm("");
    setSearchDraft("");
    setContentType(type);
    setFeedReturnView(returnView);
    setView("feed");
    pushHistory("feed", { categoryId: null, contentType: type, searchTerm: "", returnView });
  };
  const openCategories = () => {
    setView("categories");
    pushHistory("categories");
  };
  const backFromFeed = () => {
    setView(feedReturnView);
    if (feedReturnView === "categories") pushHistory("categories");
  };
  const toggleSaved = async (post: Post, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!accountId) { onLogin(); return; }
    const next = !savedIds.has(post.id);
    setSavedIds((current) => { const update = new Set(current); if (next) update.add(post.id); else update.delete(post.id); return update; });
    try {
      await cloudRequest("/api/v1/library-state", { action: "bookmark", id: post.id, value: next });
    } catch (e) {
      setSavedIds((current) => { const update = new Set(current); if (next) update.add(post.id); else update.delete(post.id); return update; });
      onNotice(e instanceof Error ? e.message : "收藏同步失败");
    }
  };

  const card = (post: Post) => <ResourceCard key={post.id} post={post} saved={savedIds.has(post.id)} onOpen={onOpen} onToggleSave={toggleSaved}/>;

  return <section className="ai-space" hidden={hidden} aria-label="AI 空间">
    {view === "home" && <>
      {/* 紧凑双行导航的第二行：分类横滑 + 独立的搜索/筛选按钮（与 APP 端结构一致） */}
      <div className="ai-space-nav">
        <div className="ai-space-nav-scroll" role="tablist" aria-label="AI 资源分类">
          <button type="button" role="tab" aria-selected={!contentType && !categoryId && !searchTerm} className={`ai-space-chip${!contentType && !categoryId && !searchTerm ? " selected" : ""}`} onClick={() => { setCategoryId(null); setContentType(""); setSearchTerm(""); setSearchDraft(""); }}>推荐</button>
          {resourceTypes.map((item) => <button type="button" role="tab" key={item.resource_type} aria-selected={contentType === item.resource_type} className={`ai-space-chip${contentType === item.resource_type ? " selected" : ""}`} onClick={() => { setContentType(item.resource_type); setCategoryId(null); setSearchTerm(""); setSearchDraft(""); }}>{item.label}</button>)}
          <button type="button" className="ai-space-chip ai-space-chip-more" onClick={openCategories}><Compass size={13}/>全部分类</button>
        </div>
        <button type="button" className={`ai-space-nav-icon${searchOpen ? " active" : ""}`} aria-label="搜索 AI 内容" aria-expanded={searchOpen} onClick={() => { setSearchOpen((value) => !value); setFilterOpen(false); }}><Search size={18}/></button>
        <button type="button" className={`ai-space-nav-icon${filterOpen ? " active" : ""}`} aria-label="筛选 AI 内容" aria-expanded={filterOpen} onClick={() => { setFilterOpen((value) => !value); setSearchOpen(false); }}><SlidersHorizontal size={18}/></button>
      </div>
      {searchOpen && <form className="ai-space-search-panel" role="search" onSubmit={(event) => { submitSearch(event); setSearchOpen(false); }}>
        <div className="ai-space-search-panel-field"><Search size={15}/><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索 AI 内容" maxLength={60} autoFocus/><button type="submit" className="ai-space-search-panel-go" disabled={!searchDraft.trim()}>搜索</button></div>
        {searchSuggestions.length > 0 && <div className="ai-space-suggestion-chips" aria-label="快捷搜索">{searchSuggestions.map((term) => <button type="button" key={term} onClick={() => { searchFor(term); setSearchOpen(false); }}>{term}</button>)}</div>}
      </form>}
      {filterOpen && <div className="ai-space-filter-panel" role="group" aria-label="筛选条件">
        <div className="ai-space-filter-row"><span>排序</span>{([["latest", "最新"], ["popular", "最热"], ["featured", "精选"]] as const).map(([key, label]) => <button type="button" key={key} className={sortMode === key ? "selected" : ""} onClick={() => setSortMode(key)}>{label}</button>)}</div>
        <div className="ai-space-filter-row"><span>类型</span><button type="button" className={!contentType ? "selected" : ""} onClick={() => setContentType("")}>全部</button>{resourceTypes.map((item) => <button type="button" key={item.resource_type} className={contentType === item.resource_type ? "selected" : ""} onClick={() => setContentType(item.resource_type)}>{item.label}</button>)}</div>
      </div>}
      {searchTerm || contentType || categoryId ? <ResultsSection heading={searchTerm ? `“${searchTerm}”的结果` : selectedCategory?.name || typeLabels[contentType] || "全部 AI 内容"} eyebrow={searchTerm ? "搜索结果" : "筛选结果"} total={total} error={error} loading={loading} items={list} card={card} hasMore={list.length < total} onMore={() => void loadMore()} /> : <>
        <div className="ai-space-editorial-home">
          {/* 探索入口：初进可见、随内容自然滚出，不做粘性、不跟随滚动方向重新出现 */}
          <button type="button" className="ai-space-explore-entry" onClick={openCategories}>
            <span className="ai-space-explore-icon" aria-hidden="true"><Compass size={16}/></span>
            <span className="ai-space-explore-copy"><strong>探索 AI 资源</strong><small>按 Agent、Prompt、Skills 与教程分类进入资源中心</small></span>
            <ChevronRight size={16} aria-hidden="true"/>
          </button>
          {!!featured.length && <section className="ai-space-section ai-space-featured"><div className="ai-space-section-head"><div><h2>AI 内容推荐</h2></div><button type="button" onClick={() => openTypeFeed("")}>查看全部 <ChevronRight size={15}/></button></div><div className="ai-resource-grid">{featured.slice(0, 3).map(card)}</div></section>}
          {!!popular.length && <section className="ai-space-section"><div className="ai-space-section-head"><div><h2>热门 AI 资源</h2></div></div><div className="ai-resource-grid">{popular.slice(0, 3).map(card)}</div></section>}
        </div>
        <ResultsSection heading="最新发布" eyebrow="内容列表" total={total} error={error} loading={loading} items={list} card={card} hasMore={list.length < total} onMore={() => void loadMore()} />
      </>}
    </>}

    {view === "categories" && <section className="ai-space-secondary ai-space-categories-view" aria-labelledby="ai-space-categories-title">
      <div className="ai-space-secondary-heading"><button type="button" className="ai-space-back" onClick={() => setView("home")}><ArrowLeft size={16}/>返回 AI 空间</button><div><small>AI 资源中心</small><h2 id="ai-space-categories-title">浏览分类</h2><p>按资源类型探索，找到真正有用的 AI 内容。</p></div></div>
      <div className="ai-resource-type-grid">
        <button type="button" className={`ai-resource-type-tile${!contentType && !categoryId ? " selected" : ""}`} onClick={() => changeCategory(null)}>
          <span className="ai-resource-type-top"><Sparkles size={20}/><ChevronRight size={15}/></span>
          <strong>全部 AI 内容</strong><small>浏览所有分类的最新发布</small>
        </button>
        {resourceTypes.map((item) => {
          const preset = RESOURCE_TYPE_PRESENTATION[item.resource_type] || RESOURCE_TYPE_PRESENTATION.tutorial;
          const Icon = preset.icon;
          return <button type="button" key={item.resource_type} className={`ai-resource-type-tile${contentType === item.resource_type ? " selected" : ""}`} onClick={() => openTypeFeed(item.resource_type, "categories")}>
            <span className="ai-resource-type-top"><Icon size={20}/><ChevronRight size={15}/></span>
            <strong>{item.label || preset.label}</strong>
            <small>{item.description || preset.description}</small>
            <i>{item.published_count} 项资源</i>
          </button>;
        })}
      </div>
      <div className="ai-space-category-list">
        <h3>内容分类</h3>
        <button type="button" className={`ai-space-category-row${!categoryId ? " selected" : ""}`} onClick={() => changeCategory(null)}><span className="ai-space-category-icon"><Sparkles size={17}/></span><span><strong>全部分类</strong><small>浏览所有分类的最新发布</small></span><ChevronRight size={16}/></button>
        {categoriesByRoot.map((item, index) => {
          const Icon = [Sparkles, Code2, FileText, Compass, Wrench, ExternalLink][index % 6];
          return <button type="button" className={`ai-space-category-row${categoryId === item.id ? " selected" : ""}`} key={item.id} onClick={() => changeCategory(item.id)}><span className="ai-space-category-icon"><Icon size={17}/></span><span><strong>{item.name}</strong><small>{item.description || "知识文章、工具与实用资源"}</small></span><ChevronRight size={16}/></button>;
        })}
      </div>
    </section>}

    {view === "feed" && <section className="ai-space-secondary ai-space-results-view" aria-labelledby="ai-space-feed-title">
      <div className="ai-space-secondary-heading"><button type="button" className="ai-space-back" onClick={backFromFeed}><ArrowLeft size={16}/>{feedReturnView === "categories" ? "返回分类" : "返回 AI 空间"}</button><div><small>{categoryId ? "内容分类" : "AI 内容"}</small><h2 id="ai-space-feed-title">{selectedCategory?.name || typeLabels[contentType] || "全部 AI 内容"}</h2></div></div>
      {categoryChildren.length > 0 && <div className="ai-space-subcategories" role="group" aria-label={`${selectedCategory?.name}子分类`}><button className="selected" onClick={() => changeCategory(selectedCategory?.id || null)}>全部{selectedCategory ? ` ${selectedCategory.name}` : ""}</button>{categoryChildren.map((item) => <button key={item.id} className={categoryId === item.id ? "selected" : ""} onClick={() => changeCategory(item.id)}>{item.name}</button>)}</div>}
      <ResultsSection heading={selectedCategory?.name || typeLabels[contentType] || "最新发布"} eyebrow="近期内容" total={total} error={error} loading={loading} items={list} card={card} hasMore={list.length < total} onMore={() => void loadMore()} />
    </section>}
  </section>;
}
