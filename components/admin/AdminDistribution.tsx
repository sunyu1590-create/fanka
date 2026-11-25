"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Flame, RefreshCw, RotateCcw, Save, Search as SearchIcon, SlidersHorizontal, Star, TrendingUp } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, Group, fmtTime } from "../admin/AdminUIKit";

type Weights = { like: number; bookmark: number; share: number; read: number; complete: number; follow: number };
type Config = {
  weights: Weights;
  decayHours: number;
  windows: { recent: number; rising: number; long: number };
  ranking: { size: number; ttlMinutes: number; longTtlMinutes: number };
  recommend: { interest: number; hot: number; fresh: number; collection: number; explore: number; maxPerAuthor: number; maxPerCategory: number; freshHours: number };
  search: { minUsersForHot: number; ttlMinutes: number };
  series: { minChapters: number; featuredLimit: number; trendingLimit: number };
};
type RankingRow = { key: string; label: string; computedAt: string; staleAfterMinutes: number; hasSignal: boolean; count: number; top: { type: string; id: string; title: string; score: number; rank: number }[] };
type SeriesRow = { id: string; title: string; author: string; chapters: number; follows: number; hot: number; featured: boolean; featuredRank: number };
type Data = {
  config: Config;
  configMeta: { version: number; updatedAt: string | null };
  configHistory: { version: number; created_at: string; updated_by: string | null }[];
  rankings: RankingRow[];
  search: {
    terms: { term: string; display_term: string; search_count: number; user_count: number; zero_result_count: number; click_count: number; ctr: number }[];
    totals: { searches: number; clicks: number; ctr: number; zeroResult: number; uniqueTerms: number };
    trend: { day: string; searches: number; clicks: number; zero: number }[];
  };
  recommendation: { surfaces: { surface: string; impressions: number; reads: number; ctr: number }[]; pools: { pool: string; count: number; ratio: number }[]; totalImpressions: number };
  series: SeriesRow[];
  audit: { action: string; target: string | null; created_at: string; detail: Record<string, unknown> }[];
};

const RATIO_LABELS: Record<string, string> = { interest: "兴趣匹配", hot: "近期热门", fresh: "新作品扶持", collection: "优质合集与资源", explore: "兴趣探索" };
const SURFACE_LABELS: Record<string, string> = { web: "网页", android: "Android", ai: "AI 专区", series: "合集频道", discover: "发现页" };

const toPercent = (value: number) => Math.round(Number(value) * 100);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function AdminDistribution() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await cloudRequest("/api/v1/admin/distribution") as Data;
      setData(result);
      setDraft(result.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ratioSum = useMemo(() => {
    if (!draft) return 0;
    return Object.keys(RATIO_LABELS).reduce((sum, key) => sum + Number(draft.recommend[key as keyof Config["recommend"]] || 0), 0);
  }, [draft]);

  const patch = (fn: (current: Config) => Config) => {
    setDraft((current) => current ? fn(structuredClone(current)) : current);
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setNotice("");
    try {
      await cloudRequest("/api/v1/admin/distribution", { action: "save_config", config: draft, note: "后台调整" });
      setNotice("配置已保存并生成新版本");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const refresh = async (key: string) => {
    setRefreshing(key);
    setNotice("");
    try {
      await cloudRequest("/api/v1/admin/distribution", { action: "refresh", key });
      setNotice(`已重新计算：${key === "all" ? "全部榜单" : key}`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setRefreshing("");
    }
  };

  const curate = async (seriesId: string, featured: boolean, rank: number) => {
    try {
      await cloudRequest("/api/v1/admin/distribution", { action: "curate", seriesId, featured, rank });
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "设置失败");
    }
  };

  const rollback = async (version: number) => {
    try {
      await cloudRequest("/api/v1/admin/distribution", { action: "rollback", version });
      setNotice(`已回滚到版本 ${version}`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "回滚失败");
    }
  };

  if (loading && !data) return <div className="ab-empty">正在读取分发配置…</div>;
  if (error && !data) return <div className="ab-empty">{error}<button type="button" className="ab-chip" onClick={() => void load()}>重试</button></div>;
  if (!data || !draft) return null;

  return <div className="ab-dist">
    {notice && <p className="ab-dist-notice">{notice}</p>}

    <div className="ab-dist-kpis">
      <div className="ab-dist-kpi"><span className="ab-label">近 7 日搜索</span><b>{data.search.totals.searches}</b><small>{data.search.totals.uniqueTerms} 个关键词</small></div>
      <div className="ab-dist-kpi"><span className="ab-label">搜索结果点击率</span><b>{(data.search.totals.ctr * 100).toFixed(1)}%</b><small>{data.search.totals.zeroResult} 次无结果</small></div>
      <div className="ab-dist-kpi"><span className="ab-label">推荐曝光</span><b>{data.recommendation.totalImpressions}</b><small>{data.recommendation.surfaces.reduce((sum, item) => sum + item.reads, 0)} 次有效阅读</small></div>
      <div className="ab-dist-kpi"><span className="ab-label">配置版本</span><b>v{data.configMeta.version}</b><small>{data.configMeta.updatedAt ? fmtTime(data.configMeta.updatedAt) : "默认配置"}</small></div>
    </div>

    <Group>
      <div className="ab-dist-group-head"><div><h3><SlidersHorizontal size={15} /> 推荐策略</h3><p>比例会自动归一化；某个池没有候选时由其他池回补。</p></div><button type="button" className="ab-dist-save" disabled={saving} onClick={() => void save()}><Save size={14} />{saving ? "保存中…" : "保存配置"}</button></div>
      <div className="ab-dist-ratios">
        {Object.entries(RATIO_LABELS).map(([key, label]) => {
          const value = toPercent(draft.recommend[key as keyof Config["recommend"]] as number);
          return <label key={key} className="ab-dist-ratio">
            <span>{label}<b>{value}%</b></span>
            <input type="range" min={0} max={100} step={1} value={value} onChange={(event) => patch((current) => {
              const next = Number(event.target.value) / 100;
              (current.recommend as unknown as Record<string, number>)[key] = next;
              return current;
            })} />
          </label>;
        })}
        <p className={`ab-dist-sum${Math.abs(ratioSum - 1) > 0.02 ? " is-warn" : ""}`}>合计 {(ratioSum * 100).toFixed(0)}%{Math.abs(ratioSum - 1) > 0.02 ? " · 保存时按比例归一化" : " · 已平衡"}</p>
      </div>
      <div className="ab-dist-fields">
        <label><span>同作者最多连续</span><input type="number" min={1} max={6} value={draft.recommend.maxPerAuthor} onChange={(event) => patch((current) => { current.recommend.maxPerAuthor = clamp(Number(event.target.value), 1, 6); return current; })} /></label>
        <label><span>同分类最多</span><input type="number" min={1} max={8} value={draft.recommend.maxPerCategory} onChange={(event) => patch((current) => { current.recommend.maxPerCategory = clamp(Number(event.target.value), 1, 8); return current; })} /></label>
        <label><span>新作品窗口（小时）</span><input type="number" min={6} max={336} value={draft.recommend.freshHours} onChange={(event) => patch((current) => { current.recommend.freshHours = clamp(Number(event.target.value), 6, 336); return current; })} /></label>
      </div>
    </Group>

    <Group>
      <div className="ab-dist-group-head"><div><h3><Flame size={15} /> 热度规则</h3><p>事件按发生时间单独衰减，不用发布时间统一衰减历史互动。</p></div></div>
      <div className="ab-dist-fields">
        {(Object.keys(draft.weights) as (keyof Weights)[]).map((key) => <label key={key}><span>{({ like: "点赞", bookmark: "收藏", share: "分享", read: "阅读", complete: "读完", follow: "收藏合集" } as Record<string, string>)[key]}权重</span><input type="number" min={0} max={20} step={0.1} value={draft.weights[key]} onChange={(event) => patch((current) => { current.weights[key] = clamp(Number(event.target.value), 0, 20); return current; })} /></label>)}
        <label><span>时间衰减（小时）</span><input type="number" min={6} max={720} value={draft.decayHours} onChange={(event) => patch((current) => { current.decayHours = clamp(Number(event.target.value), 6, 720); return current; })} /></label>
        <label><span>近期榜窗口</span><input type="number" min={24} max={720} value={draft.windows.recent} onChange={(event) => patch((current) => { current.windows.recent = clamp(Number(event.target.value), 24, 720); return current; })} /></label>
        <label><span>飙升榜窗口</span><input type="number" min={6} max={168} value={draft.windows.rising} onChange={(event) => patch((current) => { current.windows.rising = clamp(Number(event.target.value), 6, 168); return current; })} /></label>
        <label><span>长期榜窗口</span><input type="number" min={168} max={8760} value={draft.windows.long} onChange={(event) => patch((current) => { current.windows.long = clamp(Number(event.target.value), 168, 8760); return current; })} /></label>
        <label><span>榜单条数</span><input type="number" min={5} max={50} value={draft.ranking.size} onChange={(event) => patch((current) => { current.ranking.size = clamp(Number(event.target.value), 5, 50); return current; })} /></label>
        <label><span>榜单缓存（分钟）</span><input type="number" min={1} max={180} value={draft.ranking.ttlMinutes} onChange={(event) => patch((current) => { current.ranking.ttlMinutes = clamp(Number(event.target.value), 1, 180); return current; })} /></label>
        <label><span>长期榜缓存（分钟）</span><input type="number" min={30} max={720} value={draft.ranking.longTtlMinutes} onChange={(event) => patch((current) => { current.ranking.longTtlMinutes = clamp(Number(event.target.value), 30, 720); return current; })} /></label>
        <label><span>热搜最低人数</span><input type="number" min={1} max={50} value={draft.search.minUsersForHot} onChange={(event) => patch((current) => { current.search.minUsersForHot = clamp(Number(event.target.value), 1, 50); return current; })} /></label>
      </div>
    </Group>

    <Group>
      <div className="ab-dist-group-head"><div><h3><TrendingUp size={15} /> 榜单</h3><p>只展示服务端计算结果，人工精选与自然热度分开标注。</p></div><button type="button" className="ab-dist-save" disabled={!!refreshing} onClick={() => void refresh("all")}><RefreshCw size={14} className={refreshing === "all" ? "ab-spin" : ""} />全部刷新</button></div>
      <div className="ab-dist-rankings">
        {data.rankings.map((row) => <article key={row.key} className="ab-dist-ranking">
          <header><div><strong>{row.label}</strong><small>{row.hasSignal ? `${row.count} 条 · 计算于 ${fmtTime(row.computedAt)}` : "暂无互动信号"}</small></div><button type="button" disabled={!!refreshing} onClick={() => void refresh(row.key)}><RefreshCw size={13} className={refreshing === row.key ? "ab-spin" : ""} /></button></header>
          {row.top.length ? <ol>{row.top.slice(0, 5).map((item) => <li key={`${item.type}-${item.id}`}><i>{item.rank}</i><span>{item.title}</span><em>{item.type === "series" ? "合集" : "作品"}</em></li>)}</ol> : <p className="ab-dist-muted">还没有足够互动，榜单保持为空，不用假数据填充。</p>}
        </article>)}
      </div>
    </Group>

    <Group>
      <div className="ab-dist-group-head"><div><h3><Star size={15} /> 合集精选</h3><p>人工精选会标注来源，不与自然热度混在一起。</p></div></div>
      {data.series.length ? <div className="ab-dist-series">
        {data.series.map((item) => <div key={item.id} className={`ab-dist-series-row${item.featured ? " is-featured" : ""}`}>
          <span className="ab-dist-series-copy"><strong>{item.title}</strong><small>{item.author} · {item.chapters} 篇 · {item.follows} 收藏 · 热度 {item.hot.toFixed(1)}</small></span>
          <label className="ab-dist-rank-input"><span>序号</span><input type="number" min={1} max={999} value={item.featuredRank} onChange={(event) => void curate(item.id, item.featured, Number(event.target.value))} /></label>
          <button type="button" className={`ab-chip${item.featured ? " ok" : ""}`} onClick={() => void curate(item.id, !item.featured, item.featuredRank)}>{item.featured ? "取消精选" : "设为精选"}</button>
        </div>)}
      </div> : <Empty title="还没有公开合集" hint="创作者创建合集后会出现在这里。" />}
    </Group>

    <Group>
      <div className="ab-dist-group-head"><div><h3><SearchIcon size={15} /> 搜索分析</h3><p>只展示聚合结果，不暴露任何用户的私人搜索记录。</p></div></div>
      {data.search.terms.length ? <div className="ab-dist-table">
        <div className="ab-dist-table-head"><span>关键词</span><span>搜索</span><span>人数</span><span>点击率</span><span>无结果</span></div>
        {data.search.terms.slice(0, 10).map((row) => <div key={row.term} className="ab-dist-table-row"><span>{row.display_term || row.term}</span><span>{row.search_count}</span><span>{row.user_count}</span><span>{(row.ctr * 100).toFixed(0)}%</span><span>{row.zero_result_count}</span></div>)}
      </div> : <Empty title="还没有搜索数据" hint="用户开始搜索后，这里会显示聚合关键词。" />}
      {!!data.search.trend.length && <div className="ab-dist-trend">{data.search.trend.slice(-10).map((row) => <span key={row.day} title={`${row.day} · ${row.searches} 次搜索 / ${row.clicks} 次点击`}><i style={{ height: `${Math.min(100, row.searches * 8 + 6)}%` }} /><small>{row.day.slice(5)}</small></span>)}</div>}
    </Group>

    <Group>
      <div className="ab-dist-group-head"><div><h3><BarChart3 size={15} /> 推荐分析</h3><p>曝光、有效阅读与内容池比例均来自服务端真实记录。</p></div></div>
      {data.recommendation.surfaces.length ? <div className="ab-dist-table">
        <div className="ab-dist-table-head"><span>入口</span><span>曝光</span><span>阅读</span><span>点击率</span><span /></div>
        {data.recommendation.surfaces.map((row) => <div key={row.surface} className="ab-dist-table-row"><span>{SURFACE_LABELS[row.surface] || row.surface}</span><span>{row.impressions}</span><span>{row.reads}</span><span>{(row.ctr * 100).toFixed(1)}%</span><span /></div>)}
      </div> : <Empty title="还没有曝光数据" hint="客户端上报后自动汇总。" />}
      {!!data.recommendation.pools.length && <div className="ab-dist-pools">
        {data.recommendation.pools.map((pool) => <div key={pool.pool}><span>{RATIO_LABELS[pool.pool] || pool.pool || "未标记"}</span><i><b style={{ width: `${Math.round(pool.ratio * 100)}%` }} /></i><em>{Math.round(pool.ratio * 100)}%</em></div>)}
      </div>}
    </Group>

    <Group>
      <div className="ab-dist-group-head"><div><h3><RotateCcw size={15} /> 配置版本</h3><p>可回滚到任意历史版本，回滚本身也会生成新版本。</p></div></div>
      <div className="ab-dist-history">
        {data.configHistory.map((row) => <div key={row.version}><span>v{row.version}</span><small>{fmtTime(row.created_at)}</small><button type="button" disabled={row.version === data.configMeta.version} onClick={() => void rollback(row.version)}>回滚</button></div>)}
      </div>
      {!!data.audit.length && <details className="ab-dist-audit"><summary>最近操作记录</summary>{data.audit.slice(0, 8).map((row, index) => <p key={index}><span>{row.action}</span><small>{fmtTime(row.created_at)}</small></p>)}</details>}
    </Group>
  </div>;
}
