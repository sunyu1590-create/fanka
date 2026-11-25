"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ChevronRight, Clock3, Flame, Hash, Layers, Loader2, RotateCcw, Search, Sparkles, TrendingUp, UserRound, X } from "lucide-react";
import { cloudFetch, publicRequest } from "@/lib/cloud";
import { trackSearchClick } from "@/lib/track";

type PostHit = {
  type: "post"; id: string; clientId: number; title: string; excerpt: string; cover: string | null;
  channel: string; contentType: string; tag: string | null; author: { name: string; avatar: string | null } | null;
  createdAt: string; likes: number; heat: number; score: number;
};
type SeriesHit = {
  type: "series"; id: string; title: string; excerpt: string; cover: string | null; channel: string; kind: string;
  tag: string | null; author: { id: string; name: string; avatar: string | null } | null;
  updatedAt: string; chapters: number; bookmarks: number; heat: number; score: number;
};
type PersonHit = { type: "people"; id: string; nickname: string; bio: string; avatar: string | null; score: number };
type TopicHit = { type: "topic"; id: number; name: string; count: number; score: number };
type Payload = {
  query: string; tab: string; sort: string;
  items: (PostHit | SeriesHit)[];
  sections: { featured: PostHit[]; ai: PostHit[]; series: SeriesHit[]; people: PersonHit[]; topics: TopicHit[] };
  counts: { featured: number; ai: number; series: number; people: number; topics: number; all: number };
  people: PersonHit[]; topics: TopicHit[];
  hasMore: boolean;
  mode: "results" | "empty";
};
type Trending = { mode: "hot" | "recommended"; items: { term: string; count: number; users: number }[]; reason?: string };
type RankingItem = { type: "post" | "series"; id: string; clientId?: number; title: string; cover: string | null; author?: { name: string } | null; tag?: string | null; meta?: Record<string, number | string | null> };
type Topic = { id: number; name: string; description?: string; postCount?: number };
type SeriesCard = { id: string; title: string; description: string; coverUrl: string | null; kind: string; author: { nickname: string } | null; chapters: number; followCount: number };

type Props = {
  query: string;
  accountId: string | null;
  onBack: () => void;
  onSearch: (term: string) => void;
  onOpenPost: (cloudId: string, source: Element | null) => void;
  onOpenSeries: (id: string) => void;
  onOpenPerson: (id: string) => void;
  onOpenTopic: (name: string) => void;
};

const KIND: Record<string, string> = { serial: "连载", tutorial: "教程", resource: "资源" };
const TABS = [
  ["all", "综合"],
  ["featured", "精选"],
  ["ai", "AI"],
  ["series", "合集"],
  ["people", "用户"],
  ["topics", "话题"],
] as const;
const SORTS = [
  ["relevance", "相关度"],
  ["hot", "热度"],
  ["latest", "最新"],
  ["bookmarks", "最多收藏"],
  ["likes", "最多点赞"],
] as const;

const toneOf = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return `tone-${hash % 5}`;
};

function Cover({ id, title, cover, kind }: { id: string; title: string; cover: string | null; kind?: string }) {
  const [failed, setFailed] = useState(false);
  if (cover && !failed) return <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  return <span className={`series-cover-art ${toneOf(id)}`}>
    <em>{kind ? KIND[kind] || "合集" : "合集"}</em>
    <strong>{title}</strong>
    <i>HEIKA</i>
  </span>;
}

const relative = (iso: string) => {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
};

const HISTORY_KEY = "heika-search-recent";

export default function SearchPage({ query, accountId, onBack, onSearch, onOpenPost, onOpenSeries, onOpenPerson, onOpenTopic }: Props) {
  const [draft, setDraft] = useState(query);
  const [history, setHistory] = useState<string[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("relevance");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [suggestions, setSuggestions] = useState<{ items: { type: string; id: string; label: string; hint: string }[]; correction: string | null }>({ items: [], correction: null });
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [trending, setTrending] = useState<Trending | null>(null);
  const [hotWorks, setHotWorks] = useState<RankingItem[]>([]);
  const [hotSeries, setHotSeries] = useState<SeriesCard[]>([]);
  const [aiPicks, setAiPicks] = useState<RankingItem[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const requestRef = useRef(0);
  const suggestTimer = useRef<number | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);

  useEffect(() => { setDraft(query); }, [query]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) setHistory(saved.filter((item): item is string => typeof item === "string").slice(0, 8));
    } catch { /* 忽略损坏的本地历史 */ }
  }, []);

  const persistHistory = (next: string[]) => {
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* 忽略 */ }
  };
  const remember = (term: string) => {
    const value = term.trim();
    if (!value) return;
    persistHistory([value, ...history.filter((item) => item !== value)].slice(0, 8));
  };
  const removeHistory = (term: string) => persistHistory(history.filter((item) => item !== term));
  const clearHistory = () => persistHistory([]);

  // 搜索首页：热搜 / 热榜 / 合集 / 话题 / AI 资源全部来自真实接口。
  useEffect(() => {
    let alive = true;
    setHomeLoading(true);
    void Promise.allSettled([
      publicRequest<Trending>("/api/v1/search/trending"),
      publicRequest<{ rankings: Record<string, { items?: RankingItem[] } | null> }>("/api/v1/rankings?keys=global,ai,series"),
      publicRequest<{ all?: SeriesCard[]; featured?: SeriesCard[] }>("/api/v1/series/discover?limit=6"),
      publicRequest<{ items?: Topic[] }>("/api/v1/topics?featured=1"),
    ]).then(([trendResult, rankResult, seriesResult, topicResult]) => {
      if (!alive) return;
      if (trendResult.status === "fulfilled") setTrending(trendResult.value);
      if (rankResult.status === "fulfilled") {
        setHotWorks(rankResult.value?.rankings?.global?.items?.slice(0, 5) || []);
        setAiPicks(rankResult.value?.rankings?.ai?.items?.slice(0, 4) || []);
      }
      if (seriesResult.status === "fulfilled") setHotSeries((seriesResult.value?.all || seriesResult.value?.featured || []).slice(0, 4));
      if (topicResult.status === "fulfilled") setTopics((topicResult.value?.items || []).slice(0, 8));
      setHomeLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // 输入联想：防抖 + 取消旧请求，旧结果不得覆盖新结果。
  useEffect(() => {
    const term = draft.trim();
    if (!term || term === query) { setSuggestOpen(false); setSuggestions({ items: [], correction: null }); return; }
    if (suggestTimer.current !== null) window.clearTimeout(suggestTimer.current);
    suggestTimer.current = window.setTimeout(() => {
      suggestAbort.current?.abort();
      const controller = new AbortController();
      suggestAbort.current = controller;
      void cloudFetch(`/api/v1/search/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "联想失败");
          setSuggestions(result.data || { items: [], correction: null });
          setSuggestOpen(true);
        })
        .catch((e) => { if ((e as Error).name !== "AbortError") setSuggestOpen(false); });
    }, 220);
    return () => { if (suggestTimer.current !== null) window.clearTimeout(suggestTimer.current); };
  }, [draft, query]);

  const load = useCallback(async (options: { page: number; append: boolean; tab: string; sort: string; term: string }) => {
    if (!options.term) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!options.append) { setLoading(true); setPayload(null); }
    setError("");
    try {
      const params = new URLSearchParams({ mode: "unified", q: options.term, tab: options.tab, sort: options.sort, page: String(options.page), limit: "12" });
      const response = await cloudFetch(`/api/v1/search?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "搜索失败");
      if (requestRef.current !== requestId) return;
      const next = result.data as Payload;
      setPayload((current) => options.append && current
        ? { ...next, items: [...current.items, ...next.items.filter((item) => !current.items.some((existing) => existing.id === item.id))] }
        : next);
    } catch (e) {
      if (requestRef.current === requestId) setError(e instanceof Error ? e.message : "搜索失败");
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    setTab("all");
    setSort("relevance");
    if (query) void load({ page: 1, append: false, tab: "all", sort: "relevance", term: query });
    else { setPayload(null); setLoading(false); }
  }, [query, load]);

  const rerun = (nextTab: typeof tab, nextSort: typeof sort, nextPage = 1, append = false) => {
    setTab(nextTab);
    setSort(nextSort);
    setPage(nextPage);
    void load({ page: nextPage, append, tab: nextTab, sort: nextSort, term: query });
  };

  const submit = (value = draft) => {
    const term = value.trim().slice(0, 60);
    if (!term) return;
    setSuggestOpen(false);
    remember(term);
    setDraft(term);
    if (term === query) rerun("all", "relevance", 1, false);
    else onSearch(term);
  };

  const openPost = (item: PostHit, source: Element | null) => {
    void trackSearchClick(query, "post", item.id);
    onOpenPost(item.id, source);
  };
  const openSeries = (item: SeriesHit) => {
    void trackSearchClick(query, "series", item.id);
    onOpenSeries(item.id);
  };

  const counts = payload?.counts;
  const resultItems = payload?.items || [];

  return <section className="page search-page search-page-v2" aria-label="搜索">
    <div className="search-topline">
      <button type="button" className="search-back" onClick={onBack} aria-label="返回"><ArrowLeft size={19} /></button>
      <form className="search-page-form" role="search" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label className="search-page-field">
          <Search size={17} aria-hidden="true" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => { if (suggestions.items.length || suggestions.correction) setSuggestOpen(true); }}
            placeholder="搜索作品、合集、用户或话题"
            aria-label="搜索作品、合集、用户或话题"
            maxLength={60}
            autoComplete="off"
          />
          {draft && <button type="button" aria-label="清除搜索词" onClick={() => { setDraft(""); setSuggestOpen(false); }}><X size={15} /></button>}
        </label>
        <button className="search-page-submit" type="submit" disabled={!draft.trim()}>搜索</button>
      </form>
      {suggestOpen && (suggestions.items.length > 0 || suggestions.correction) && <div className="search-suggest-panel">
        {suggestions.correction && <div className="search-suggest-fix"><span>你是不是想找</span><button type="button" onClick={() => { setDraft(suggestions.correction || ""); submit(suggestions.correction || ""); }}>{suggestions.correction}</button></div>}
        {suggestions.items.map((item) => <button key={`${item.type}-${item.id}`} type="button" className="search-suggest-item" onClick={() => {
          setSuggestOpen(false);
          if (item.type === "post") { void trackSearchClick(query || draft, "post", item.id); onOpenPost(item.id, null); }
          else if (item.type === "series") onOpenSeries(item.id);
          else if (item.type === "people") onOpenPerson(item.id);
          else { setDraft(item.label); submit(item.label); }
        }}>
          {item.type === "post" ? <BookOpen size={14} /> : item.type === "series" ? <Layers size={14} /> : item.type === "people" ? <UserRound size={14} /> : <Hash size={14} />}
          <span>{item.label}</span><small>{item.hint}</small>
        </button>)}
      </div>}
    </div>

    {!query ? <div className="search-home">
      {!!history.length && <section className="search-home-section">
        <div className="search-home-head"><strong>最近搜索</strong><button type="button" onClick={clearHistory}>清空</button></div>
        <div className="search-suggestion-chips">{history.map((term) => <span key={term} className="search-history-chip"><button type="button" onClick={() => { setDraft(term); submit(term); }}>{term}</button><button type="button" aria-label={`删除 ${term}`} onClick={() => removeHistory(term)}><X size={11} /></button></span>)}</div>
      </section>}

      <section className="search-home-section">
        <div className="search-home-head"><strong><Flame size={14} /> 黑卡热搜</strong><span>{trending?.mode === "hot" ? "真实搜索" : "推荐搜索"}</span></div>
        {trending?.mode === "hot" ? <div className="search-hot-list">
          {trending.items.slice(0, 6).map((item, index) => <button key={item.term} type="button" className="search-hot-row" onClick={() => { setDraft(item.term); submit(item.term); }}>
            <i>{index + 1}</i><span>{item.term}</span>{item.users > 0 && <em>{item.users} 人搜索</em>}
          </button>)}
        </div> : <div className="search-hot-list">
          {(trending?.items || []).slice(0, 6).map((item, index) => <button key={item.term} type="button" className="search-hot-row" onClick={() => { setDraft(item.term); submit(item.term); }}>
            <i>{index + 1}</i><span>{item.term}</span><b>推荐</b>
          </button>)}
        </div>}
        {trending?.reason && <p className="search-hot-mode">{trending.reason}</p>}
      </section>

      <section className="search-home-section">
        <div className="search-home-head"><strong><TrendingUp size={14} /> 热门作品</strong><span>近 72 小时互动</span></div>
        {hotWorks.length ? <div className="search-hot-list">
          {hotWorks.map((item, index) => <button key={item.id} type="button" className="search-hot-row" onClick={() => { void trackSearchClick("", "post", item.id); onOpenPost(item.id, null); }}>
            <i>{index + 1}</i><span>{item.title}</span><em>{item.author?.name || item.tag || ""}</em>
          </button>)}
        </div> : <p className="search-hot-mode">互动数据还不够形成热榜，先去读几篇。</p>}
      </section>

      {!!hotSeries.length && <section className="search-home-section">
        <div className="search-home-head"><strong><Layers size={14} /> 热门合集</strong><span>{hotSeries.length} 个</span></div>
        <div className="search-quick-grid">
          {hotSeries.map((item) => <button key={item.id} type="button" className="search-quick-card" onClick={() => onOpenSeries(item.id)}>
            <strong>{item.title}</strong><small>{item.chapters} 篇 · {item.author?.nickname || "创作者"}</small>
          </button>)}
        </div>
      </section>}

      {!!topics.length && <section className="search-home-section">
        <div className="search-home-head"><strong><Hash size={14} /> 热门话题</strong><span>精选</span></div>
        <div className="search-suggestion-chips">{topics.map((topic) => <button key={topic.id} type="button" onClick={() => onOpenTopic(topic.name)}>#{topic.name}</button>)}</div>
      </section>}

      {!!aiPicks.length && <section className="search-home-section">
        <div className="search-home-head"><strong><Sparkles size={14} /> AI 资源</strong><span>近期热门</span></div>
        <div className="search-quick-grid">
          {aiPicks.map((item) => <button key={item.id} type="button" className="search-quick-card" onClick={() => onOpenPost(item.id, null)}>
            <strong>{item.title}</strong><small>{item.tag || "AI 资源"}</small>
          </button>)}
        </div>
      </section>}

      {homeLoading && <p className="search-hot-mode"><Loader2 size={13} className="spin" /> 正在准备搜索首页…</p>}
    </div> : <>
      <div className="search-result-toolbar">
        <div className="search-result-tabs" role="tablist" aria-label="搜索范围">
          {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "selected" : ""} onClick={() => rerun(key, sort)}>
            {label}{counts && key !== "all" ? <i>{counts[key as keyof typeof counts] || 0}</i> : null}
          </button>)}
        </div>
        <div className="search-result-sort">
          <select value={sort} aria-label="排序方式" onChange={(event) => rerun(tab, event.target.value as typeof sort)}>
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="search-state search-error"><span>{error}</span><button type="button" onClick={() => void load({ page: 1, append: false, tab, sort, term: query })}><RotateCcw size={13} />重试</button></div>}

      {loading && !payload && <div className="search-skeleton-list"><i /><i /><i /><i /></div>}

      {payload && tab !== "people" && tab !== "topics" && <>
        {resultItems.map((item) => item.type === "series"
          ? <button key={`series-${item.id}`} type="button" className="search-series-row" onClick={() => openSeries(item)}>
            <span className="search-series-cover"><Cover id={item.id} title={item.title} cover={item.cover} kind={item.kind} /></span>
            <span className="search-series-copy">
              <strong>{item.title}</strong>
              <span>{item.excerpt || "持续更新中"}</span>
              <small>{KIND[item.kind] || "合集"} · {item.chapters} 篇 · {item.author?.name || "创作者"} · {relative(item.updatedAt)}</small>
            </span>
            <span className="search-type-badge">合集</span>
          </button>
          : <button key={`post-${item.id}`} type="button" className="search-post-result" onClick={(event) => openPost(item, event.currentTarget)}>
            <span className="search-post-thumbnail">{item.cover ? <img src={item.cover} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <BookOpen size={18} />}<small>{item.tag || (item.channel === "ai" ? "AI" : "作品")}</small></span>
            <span className="search-post-copy"><strong>{item.title}</strong><span>{item.excerpt}</span><small>{item.author?.name || "创作者"} · {item.channel === "ai" ? "AI 资源" : "作品"} · {relative(item.createdAt)}</small></span>
            <span className="search-type-badge">{item.channel === "ai" ? "AI" : "作品"}</span>
          </button>)}
        {!loading && !resultItems.length && <div className="search-state">
          <span>没有找到「{query}」相关内容。</span>
          <small>试试更短的关键词，或切换到合集 / 用户。</small>
        </div>}
        {payload.hasMore && <button type="button" className="search-more-button" disabled={loading} onClick={() => { const next = page + 1; setPage(next); void load({ page: next, append: true, tab, sort, term: query }); }}>{loading ? "正在加载…" : "加载更多结果"}</button>}
      </>}

      {payload && tab === "people" && <div className="search-people-results">
        {payload.people.map((person) => <button type="button" className="search-person-result" key={person.id} onClick={() => { void trackSearchClick(query, "people", person.id); onOpenPerson(person.id); }}>
          <span className="search-person-avatar"><span>{(person.nickname || "探").slice(0, 1)}</span>{person.avatar && <img src={person.avatar} alt="" loading="lazy" />}</span>
          <span className="search-person-copy"><strong>{person.nickname || "探索者"}</strong><small>{person.bio || "还没有填写简介"}</small></span>
          <ChevronRight size={17} />
        </button>)}
        {!payload.people.length && <div className="search-state">没有找到相关用户。</div>}
      </div>}

      {payload && tab === "topics" && <div className="search-topic-results">
        {payload.topics.map((topic) => <button type="button" key={topic.id} className="search-topic-row" onClick={() => onOpenTopic(topic.name)}>
          <Hash size={15} /><span>{topic.name}</span><small>{topic.count ? `${topic.count} 个合集` : ""}</small><ChevronRight size={15} />
        </button>)}
        {!payload.topics.length && <div className="search-state">没有找到相关话题。</div>}
      </div>}

      {payload?.mode === "empty" && <div className="search-empty-hint"><Clock3 size={14} /><span>搜索只覆盖已发布且你有权查看的内容。</span></div>}
    </>}
  </section>;
}
