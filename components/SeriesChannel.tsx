"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BookMarked, BookOpen, Bookmark, ChevronRight, Clock3, Layers, Loader2, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import { cloudFetch } from "@/lib/cloud";
import { trackImpression } from "@/lib/track";

type SeriesCard = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  kind: string;
  channel: string;
  categoryId: number | null;
  categoryName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string; avatarUrl: string | null } | null;
  chapters: number;
  followCount: number;
  hot: number;
  source?: string;
  reason?: string;
  progress?: { read: number; total: number; percent: number; lastPostId: string | null; updatedAt: string | null };
};

type DiscoverData = {
  featured: SeriesCard[];
  featuredSource: "editorial" | "auto" | null;
  trending: (SeriesCard & { rank: number })[];
  trendingBasis: "interaction" | "bookmarks";
  continueReading: SeriesCard[];
  updated: SeriesCard[];
  recommended: (SeriesCard & { pool?: string; reason?: string })[];
  recommendedMeta: { coldStart: boolean; profile: { tags: { id: number; weight: number }[]; followedSeries: number } };
  all: SeriesCard[];
  categories: { id: number; name: string; count: number }[];
  counts: { total: number; filtered: number; categories: number };
  page: number;
  limit: number;
  hasMore: boolean;
};

type Props = {
  accountId: string | null;
  onOpenSeries: (id: string) => void;
  onLogin: () => void;
};

const KIND: Record<string, string> = { serial: "连载", tutorial: "教程", resource: "资源" };
const SORTS = [
  ["recommended", "推荐"],
  ["hot", "热门"],
  ["updated", "更新"],
  ["new", "最新"],
  ["follows", "收藏"],
] as const;

const toneOf = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return `tone-${hash % 5}`;
};

function Cover({ card }: { card: SeriesCard }) {
  const [failed, setFailed] = useState(false);
  if (card.coverUrl && !failed) {
    return <img className="series-cover-img" src={card.coverUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return <span className={`series-cover-art ${toneOf(card.id)}`} aria-hidden="true">
    <em>{KIND[card.kind] || "合集"}</em>
    <strong>{card.title}</strong>
    <i>{card.author?.nickname || "HEIKA"}</i>
  </span>;
}

const timeAgo = (iso: string) => {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return "刚刚更新";
  if (hours < 24) return `${hours} 小时前更新`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前更新`;
  return `${Math.floor(days / 30)} 个月前更新`;
};

export default function SeriesChannel({ accountId, onOpenSeries, onLogin }: Props) {
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("recommended");
  const [category, setCategory] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [appending, setAppending] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async (options: { page: number; sort: string; category: number | null; append: boolean }) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (options.append) setAppending(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(options.page), limit: "18", sort: options.sort });
      if (options.category) params.set("category", String(options.category));
      const response = await cloudFetch(`/api/v1/series/discover?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "合集加载失败");
      if (requestRef.current !== requestId) return;
      const next = result.data as DiscoverData;
      setData((current) => options.append && current ? { ...next, all: [...current.all, ...next.all.filter((item) => !current.all.some((existing) => existing.id === item.id))] } : next);
    } catch (e) {
      if (requestRef.current === requestId) setError(e instanceof Error ? e.message : "合集加载失败");
    } finally {
      if (requestRef.current === requestId) { setLoading(false); setAppending(false); }
    }
  }, []);

  useEffect(() => { void load({ page: 1, sort, category, append: false }); }, [load, sort, category]);
  useEffect(() => {
    if (!data) return;
    const map = (items: SeriesCard[]) => items.map((item) => ({ type: "series" as const, id: item.id }));
    void trackImpression([
      ...map(data.featured),
      ...map(data.trending),
      ...map(data.recommended),
      ...map(data.all),
    ].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index), "series");
  }, [data]);

  const loadMore = () => {
    if (!data?.hasMore || appending) return;
    const next = page + 1;
    setPage(next);
    void load({ page: next, sort, category, append: true });
  };

  const changeFilter = (nextSort: typeof sort, nextCategory: number | null) => {
    setPage(1);
    setSort(nextSort);
    setCategory(nextCategory);
  };

  const featuredMain = data?.featured[0];
  const featuredRest = data?.featured.slice(1, 3) || [];
  const dense = (data?.counts.total || 0) >= 6;
  const shelf = useMemo(() => data?.trending.slice(0, 12) || [], [data]);

  if (loading && !data) {
    return <section className="series-channel" aria-label="合集频道">
      <div className="series-skeleton-hero"><span /><span /><span /></div>
      {[0, 1].map((row) => <div className="series-skeleton-row" key={row}><i /><i /><i /><i /></div>)}
    </section>;
  }

  if (error && !data) {
    return <section className="series-channel"><div className="series-state">
      <Layers size={22} />
      <strong>合集暂时没能打开</strong>
      <span>{error}</span>
      <button type="button" onClick={() => void load({ page: 1, sort, category, append: false })}><RotateCcw size={14} />重新加载</button>
    </div></section>;
  }

  if (!data) return null;

  if (!data.counts.total) {
    return <section className="series-channel"><div className="series-state">
      <BookOpen size={24} />
      <strong>还没有公开合集</strong>
      <span>合集由创作者把多篇作品组织在一起，创建即上架，无需审核。</span>
    </div></section>;
  }

  return <section className="series-channel" aria-label="合集频道">
    {/* 分类 */}
    {data.categories.length > 1 && <div className="series-categories" role="tablist" aria-label="合集分类">
      <button type="button" role="tab" aria-selected={category === null} className={category === null ? "selected" : ""} onClick={() => changeFilter(sort, null)}>全部</button>
      {data.categories.map((item) => <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className={category === item.id ? "selected" : ""} onClick={() => changeFilter(sort, item.id)}>{item.name}<i>{item.count}</i></button>)}
    </div>}

    {/* 本周精选 / 编辑推荐 */}
    <section className="series-featured" aria-label={data.featuredSource === "editorial" ? "编辑精选" : "精选合集"}>
      <header className="series-section-head">
        <div><small>{data.featuredSource === "editorial" ? "编辑精选" : "值得从头读"}</small><h2>本周精选</h2></div>
        <span>{data.featured.length} 个合集</span>
      </header>
      <div className={`series-hero${featuredRest.length ? " has-side" : ""}`}>
        {featuredMain && <button type="button" className="series-hero-main" onClick={() => onOpenSeries(featuredMain.id)}>
          <span className="series-hero-cover"><Cover card={featuredMain}  /></span>
          <span className="series-hero-copy">
            <span className="series-overline"><Sparkles size={12} />{KIND[featuredMain.kind] || "合集"} · {featuredMain.chapters} 篇</span>
            <strong>{featuredMain.title}</strong>
            <span className="series-hero-desc">{featuredMain.description || "把相关作品收在一起，按顺序读下去。"}</span>
            <span className="series-hero-meta">{featuredMain.author?.nickname || "创作者"} · {featuredMain.followCount} 人收藏 · {timeAgo(featuredMain.updatedAt)}</span>
            <span className="series-hero-cta">查看合集<ArrowUpRight size={14} /></span>
          </span>
        </button>}
        {!!featuredRest.length && <div className="series-hero-side">
          {featuredRest.map((card) => <button key={card.id} type="button" className="series-hero-mini" onClick={() => onOpenSeries(card.id)}>
            <span className="series-hero-mini-cover"><Cover card={card}  /></span>
            <span className="series-hero-mini-copy">
              <strong>{card.title}</strong>
              <small>{card.chapters} 篇 · {card.followCount} 收藏</small>
              <em>{card.description || "持续更新中"}</em>
            </span>
          </button>)}
        </div>}
      </div>
    </section>

    {/* 继续阅读 */}
    {!!data.continueReading.length && <section className="series-block" aria-label="继续阅读">
      <header className="series-section-head"><div><h2>继续阅读</h2></div><span>上次读到的位置</span></header>
      <div className="series-continue-list">
        {data.continueReading.map((card) => <button key={card.id} type="button" className="series-continue" onClick={() => onOpenSeries(card.id)}>
          <span className="series-continue-cover"><Cover card={card}  /></span>
          <span className="series-continue-copy">
            <strong>{card.title}</strong>
            <small>已读 {card.progress?.read || 0} / {card.progress?.total || card.chapters} 篇</small>
            <span className="series-progress"><i style={{ width: `${card.progress?.percent || 0}%` }} /></span>
          </span>
          <span className="series-continue-action">{card.progress?.percent ? "继续" : "开始"}<ChevronRight size={15} /></span>
        </button>)}
      </div>
    </section>}

    {dense && <>
      {/* 近期热门：横向书架 */}
      <section className="series-block" aria-label="近期热门">
        <header className="series-section-head">
          <div><small>{data.trendingBasis === "interaction" ? "近 72 小时互动" : "按收藏排序"}</small><h2>近期热门</h2></div>
          <span><TrendingUp size={13} />{data.trendingBasis === "interaction" ? "真实热度" : "互动样本较少"}</span>
        </header>
        <div className="series-shelf">
          {shelf.map((card) => <button key={card.id} type="button" className="series-shelf-card" onClick={() => onOpenSeries(card.id)}>
            <span className="series-shelf-cover"><Cover card={card}  /><i className="series-rank">{card.rank}</i></span>
            <strong>{card.title}</strong>
            <small>{card.chapters} 篇 · {card.followCount} 收藏</small>
          </button>)}
        </div>
      </section>

      {/* 最近更新：紧凑列表 */}
      <section className="series-block" aria-label="最近更新">
        <header className="series-section-head"><div><small>只看真实内容变化</small><h2>最近更新</h2></div><span><Clock3 size={13} />{timeAgo(data.updated[0]?.updatedAt || new Date().toISOString())}</span></header>
        <div className="series-update-list">
          {data.updated.slice(0, 6).map((card) => <button key={card.id} type="button" className="series-update-row" onClick={() => onOpenSeries(card.id)}>
            <span className="series-update-cover"><Cover card={card}  /></span>
            <span className="series-update-copy"><strong>{card.title}</strong><small>{card.author?.nickname || "创作者"} · {card.chapters} 篇</small></span>
            <span className="series-update-time">{timeAgo(card.updatedAt)}</span>
          </button>)}
        </div>
      </section>

      {/* 为你推荐 */}
      {!!data.recommended.length && <section className="series-block" aria-label="为你推荐">
        <header className="series-section-head"><div><small>{data.recommendedMeta.coldStart ? "先看看大家在读什么" : "按你的收藏与阅读"}</small><h2>为你推荐</h2></div><span>{data.recommendedMeta.coldStart ? "新读者" : `兴趣 ${data.recommendedMeta.profile.tags.length} 项`}</span></header>
        <div className="series-shelf">
          {data.recommended.slice(0, 8).map((card) => <button key={card.id} type="button" className="series-shelf-card" onClick={() => onOpenSeries(card.id)}>
            <span className="series-shelf-cover"><Cover card={card}  /></span>
            <strong>{card.title}</strong>
            <small>{card.reason || `${card.chapters} 篇`}</small>
          </button>)}
        </div>
      </section>}
    </>}

    {/* 全部合集 */}
    <section className="series-block series-all" aria-label="全部合集">
      <header className="series-section-head"><div><h2>全部合集</h2></div><span>{data.counts.filtered} 个</span></header>
      <div className="series-sortbar" role="tablist" aria-label="合集排序">
        {SORTS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={sort === key} className={sort === key ? "selected" : ""} onClick={() => changeFilter(key, category)}>{label}</button>)}
      </div>
      <div className="series-all-layout">
        <div className="series-all-main">
          {data.all.length ? <div className="series-grid">
            {data.all.map((card) => <button key={card.id} type="button" className="series-grid-card" onClick={() => onOpenSeries(card.id)}>
              <span className="series-grid-cover"><Cover card={card}  /></span>
              <span className="series-grid-copy">
                <strong>{card.title}</strong>
                <small>{card.author?.nickname || "创作者"} · {card.chapters} 篇</small>
                <span className="series-grid-meta"><i>{KIND[card.kind] || "合集"}</i>{card.followCount > 0 && <em><Bookmark size={11} />{card.followCount}</em>}<em>{timeAgo(card.updatedAt)}</em></span>
              </span>
            </button>)}
          </div> : <div className="series-state compact"><BookMarked size={18} /><strong>这个分类还没有合集</strong><span>换个分类看看。</span></div>}
          {data.hasMore && <button type="button" className="series-more" disabled={appending} onClick={loadMore}>{appending ? <><Loader2 size={14} className="spin" />加载中…</> : "加载更多合集"}</button>}
        </div>
        {!!data.trending.length && <aside className="series-side-rank" aria-label="合集热榜">
          <header><strong>合集热榜</strong><small>近 72 小时互动</small></header>
          {data.trending.slice(0, 6).map((card) => <button key={card.id} type="button" className="series-side-rank-row" onClick={() => onOpenSeries(card.id)}>
            <i>{card.rank}</i>
            <span><strong>{card.title}</strong><small>{card.chapters} 篇 · {card.followCount} 收藏</small></span>
          </button>)}
          <p>按点赞、收藏、分享与有效阅读加权，合集热度取内部作品平均，不与篇数挂钩。</p>
        </aside>}
      </div>
    </section>

    {!accountId && <div className="series-login-hint"><span>登录后可以收藏合集，并跨端同步阅读进度。</span><button type="button" onClick={onLogin}>去登录</button></div>}
  </section>;
}
