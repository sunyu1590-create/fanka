"use client";

/**
 * 资源管理：真实对象存储容量、分类、明细、健康检查与热门资源。
 * 所有容量来自 storage.objects 的物理对象；同一个文件被多篇作品引用只计一次。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, Copy, FileText, Film, HardDrive, Image as ImageIcon, Package, RefreshCw, Search, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { confirmInApp } from "@/lib/in-app-dialog";
import { useRealtime } from "@/lib/admin-live";
import { Bars, Collapse, Empty, fmtBytes, fmtNum, fmtTime, Group, Segmented } from "./admin/AdminUIKit";

type Kind = "image" | "document" | "ai" | "archive" | "app" | "media" | "other";
type Summary = {
  bytes: number; objects: number;
  by_kind: Array<{ kind: Kind; objects: number; bytes: number }>;
  by_bucket: Array<{ bucket: string; objects: number; bytes: number }>;
  captured_at: string;
  latest_scan: ScanRow | null;
  scans: ScanRow[];
};
type ScanRow = { id: string; status: string; scanned_count: number; orphan_count: number; duplicate_count: number; missing_count: number; reclaimable_bytes: number; created_at: string; finished_at: string | null; detail?: { temporary?: number; temporary_bytes?: number } | null };
type Item = { bucket: string; name: string; bytes: number; mime: string; created_at: string; updated_at: string; kind: Kind; ref_count: number; state: string; post_id: string | null };
type PageData = { total: number; objects: number; bytes: number; items: Item[] };
type Health = {
  orphans: Array<{ bucket: string; name: string; bytes: number; kind: Kind; created_at: string }>;
  orphan_bytes: number;
  temporary: number; temporary_bytes: number;
  duplicates: Array<{ bytes: number; etag: string; count: number; items: Array<{ bucket: string; name: string; created_at: string }> }>;
  duplicate_bytes: number;
  missing: Array<{ path: string; post_id: string | null }>;
  objects: number; bytes: number; scanned_at: string;
};
type RankItem = { path: string; kind: Kind; requests: number; bytes: number; downloads: number; bucket: string | null; size: number; post_id: string | null; title: string | null };

const KIND_LABEL: Record<Kind, string> = { image: "图片", document: "文档", ai: "AI 资源", archive: "压缩包", app: "应用安装包", media: "视频音频", other: "其他" };
const KIND_COLOR: Record<Kind, string> = { image: "var(--ab-blue)", document: "var(--ab-violet)", ai: "var(--ab-indigo)", archive: "var(--ab-amber)", app: "var(--ab-emerald)", media: "var(--ab-cyan)", other: "var(--ab-ink-3)" };
const STATE_LABEL: Record<string, { text: string; tone: string }> = {
  referenced: { text: "使用中", tone: "ok" },
  pending: { text: "任务引用", tone: "warn" },
  temporary: { text: "保留期内", tone: "info" },
  orphan: { text: "孤立", tone: "bad" },
};
const BUCKET_LABEL: Record<string, string> = {
  "post-covers": "作品图片", "post-attachments": "作品附件", "post-videos": "视频", "heika-avatars": "头像", "heika-decor": "装扮资源", "heika-chat": "私信图片",
};
const iconOf = (kind: Kind) => kind === "image" ? ImageIcon : kind === "media" ? Film : kind === "archive" ? Archive : kind === "app" ? Package : kind === "ai" ? Sparkles : FileText;

function dayOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function AdminResources({ refreshKey = 0, initialTab = "overview" }: { refreshKey?: number; initialTab?: "overview" | "list" | "health" | "rankings" }) {
  const live = useRealtime();
  const [tab, setTab] = useState<"overview" | "list" | "health" | "rankings">(initialTab);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [state, setState] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [sort, setSort] = useState<"created" | "size" | "name">("created");
  const [desc, setDesc] = useState(true);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<PageData | null>(null);
  const [detail, setDetail] = useState<{ item: Item; refs: Array<{ kind: string; post_id: string | null; post_title: string | null; post_status: string | null }>; etag: string; upload_tasks: Array<{ task_key: string; status: string; client_type: string | null; created_at: string }> } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rankMetric, setRankMetric] = useState<"bytes" | "requests" | "downloads">("bytes");
  const [rankRange, setRankRange] = useState<"today" | "7d" | "30d">("7d");
  const [ranks, setRanks] = useState<RankItem[] | null>(null);
  const lastLoad = useRef(0);
  const loaded = useRef(false);

  const loadSummary = useCallback(async (force = false) => {
    if (!force && Date.now() - lastLoad.current < 20_000) return;
    try {
      const result = await cloudRequest("/api/v1/admin/resources?view=summary") as Summary;
      setSummary(result);
      lastLoad.current = Date.now();
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "资源统计读取失败"); }
  }, []);

  const loadPage = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: "page", sort, limit: "24", offset: String(offset) });
      if (kind !== "all") params.set("kind", kind);
      if (state !== "all") params.set("state", state);
      if (applied) params.set("q", applied);
      if (!desc) params.set("desc", "0");
      const result = await cloudRequest(`/api/v1/admin/resources?${params.toString()}`) as PageData;
      setPage(result);
    } catch (e) { setError(e instanceof Error ? e.message : "资源列表读取失败"); }
  }, [kind, state, applied, sort, desc, offset]);

  useEffect(() => { void loadSummary(); }, [loadSummary, refreshKey]);
  useEffect(() => {
    if (tab === "list" || detail) void loadPage();
  }, [tab, loadPage, detail]);
  useEffect(() => {
    if (tab !== "rankings") return;
    const from = rankRange === "today" ? dayOffset(0) : rankRange === "7d" ? dayOffset(6) : dayOffset(29);
    void (async () => {
      try {
        const result = await cloudRequest(`/api/v1/admin/resources?view=rankings&from=${from}&to=${dayOffset(0)}&metric=${rankMetric}&limit=12`) as { items: RankItem[] };
        setRanks(result.items || []);
      } catch (e) { setError(e instanceof Error ? e.message : "热门资源读取失败"); }
    })();
  }, [tab, rankMetric, rankRange]);

  // 容量变化不频繁：只在实时快照版本变化且距上次读取超过 20 秒时刷新，避免每秒全量统计。
  useEffect(() => {
    if (!loaded.current) { loaded.current = true; return; }
    if (tab === "overview") void loadSummary();
  }, [live.snapshot?.revision, tab, loadSummary]);

  const total = summary?.bytes || 0;
  const sortedKinds = useMemo(() => (summary?.by_kind || []).filter((row) => row.bytes > 0).sort((a, b) => b.bytes - a.bytes), [summary]);

  const openDetail = async (item: Item) => {
    setError("");
    try {
      const result = await cloudRequest(`/api/v1/admin/resources?view=detail&bucket=${encodeURIComponent(item.bucket)}&name=${encodeURIComponent(item.name)}`) as { bytes: number; refs: Array<{ kind: string; post_id: string | null; post_title: string | null; post_status: string | null }>; etag: string; created_at: string; upload_tasks: Array<{ task_key: string; status: string; client_type: string | null; created_at: string }> };
      setDetail({ item: { ...item, bytes: result.bytes, created_at: result.created_at }, refs: result.refs || [], etag: result.etag, upload_tasks: result.upload_tasks || [] });
    } catch (e) { setError(e instanceof Error ? e.message : "资源详情读取失败"); }
  };

  const runScan = async () => {
    setBusy("scan"); setError(""); setNotice("");
    try {
      const result = await cloudRequest("/api/v1/admin/resources", { action: "scan" }) as Health;
      setHealth(result);
      setNotice(`扫描完成：${fmtNum(result.objects)} 个对象，发现 ${result.orphans.length} 个孤立、${result.duplicates.length} 组重复。`);
      await loadSummary(true);
    } catch (e) { setError(e instanceof Error ? e.message : "扫描失败"); }
    finally { setBusy(""); }
  };

  const loadHealth = async () => {
    setBusy("health");
    try {
      const result = await cloudRequest("/api/v1/admin/resources?view=health") as Health;
      setHealth(result);
    } catch (e) { setError(e instanceof Error ? e.message : "健康检查读取失败"); }
    finally { setBusy(""); }
  };

  const cleanup = async () => {
    const targets = (health?.orphans || []).filter((row) => selected.includes(`${row.bucket}/${row.name}`));
    if (!targets.length) { setError("请先选择要清理的孤立资源"); return; }
    setBusy("cleanup"); setError(""); setNotice("");
    try {
      const preview = await cloudRequest("/api/v1/admin/resources", { action: "cleanup-preview", paths: targets.map((row) => ({ bucket: row.bucket, name: row.name })) }) as { items: Array<{ bucket: string; deletable: boolean; reason: string; bytes: number; name: string }>; deletable_bytes: number };
      const deletable = preview.items.filter((item) => item.deletable);
      if (!deletable.length) { setError(`没有可清理的对象：${preview.items[0]?.reason || "未通过二次校验"}`); return; }
      const ok = await confirmInApp(`将删除 ${deletable.length} 个孤立对象，预计释放 ${fmtBytes(preview.deletable_bytes)}。此操作不可撤销，但不会影响任何已发布作品。`, { title: "清理孤立资源", confirmLabel: "确认清理", danger: true });
      if (!ok) return;
      const result = await cloudRequest("/api/v1/admin/resources", { action: "cleanup", confirm: true, paths: deletable.map((item) => ({ bucket: item.bucket, name: item.name })) }, "POST") as { removed: string[]; skipped: Array<{ path: string; reason: string }> };
      setNotice(`已清理 ${result.removed.length} 个对象${result.skipped.length ? `，${result.skipped.length} 个被跳过` : ""}。`);
      setSelected([]);
      await runScan();
    } catch (e) { setError(e instanceof Error ? e.message : "清理失败"); }
    finally { setBusy(""); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {detail ? (
        <DetailView
          detail={detail}
          onBack={() => setDetail(null)}
          onChanged={() => { setDetail(null); void loadPage(); void loadSummary(true); }}
        />
      ) : (
        <>
          <Segmented
            value={tab}
            ariaLabel="资源管理视图"
            onChange={setTab}
            options={[
              { value: "overview", label: "概览" },
              { value: "list", label: "资源列表" },
              { value: "health", label: "健康检查" },
              { value: "rankings", label: "热门资源" },
            ]}
          />
          {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
          {notice ? <p className="ab-sub" style={{ color: "var(--ab-emerald)" }}>{notice}</p> : null}

          {tab === "overview" ? (
            <>
              <div className="ab-card">
                <div className="ab-card__head"><span className="ab-card__title">实际占用</span><span className="ab-card__badge">对象存储</span></div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
                  <div><b style={{ fontSize: 34, fontWeight: 720, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{summary ? fmtBytes(total) : "—"}</b><div className="ab-label">物理对象总容量</div></div>
                  <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtNum(summary?.objects)}</b><div className="ab-label">物理文件数</div></div>
                  <div><b style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtNum(sortedKinds.length)}</b><div className="ab-label">资源分类</div></div>
                </div>
                <div className="ab-stack" style={{ marginTop: 4 }}>
                  {sortedKinds.map((row) => <i key={row.kind} style={{ width: `${Math.max(1, (row.bytes / Math.max(1, total)) * 100)}%`, background: KIND_COLOR[row.kind] }} title={`${KIND_LABEL[row.kind]} ${fmtBytes(row.bytes)}`} />)}
                </div>
                <div className="ab-legend">
                  {sortedKinds.map((row) => <span key={row.kind}><i style={{ background: KIND_COLOR[row.kind] }} />{KIND_LABEL[row.kind]} {fmtBytes(row.bytes)} · {fmtNum(row.objects)} 个</span>)}
                </div>
                <p className="ab-label" style={{ margin: 0 }}>按物理对象统计，同一文件被多篇作品引用只计一次；对象存储没有固定容量上限，不显示虚构的容量百分比。</p>
              </div>

              <Group>
                {sortedKinds.map((row) => {
                  const Icon = iconOf(row.kind);
                  const ratio = total ? row.bytes / total : 0;
                  return (
                    <button key={row.kind} type="button" className="ab-row" onClick={() => { setKind(row.kind); setState("all"); setOffset(0); setTab("list"); }}>
                      <span className="ab-row__icon tone-blue"><Icon size={14} /></span>
                      <span className="ab-row__body">
                        <span className="ab-row__title">{KIND_LABEL[row.kind]}</span>
                        <span className="ab-row__meta">{fmtNum(row.objects)} 个 · 占总量 {(ratio * 100).toFixed(1)}%</span>
                        <span className="ab-bar" style={{ marginTop: 5 }}><i style={{ width: `${Math.max(2, Math.round(ratio * 100))}%`, background: KIND_COLOR[row.kind] }} /></span>
                      </span>
                      <span className="ab-row__value"><b>{fmtBytes(row.bytes)}</b></span>
                      <ChevronRight size={15} className="ab-row__chev" />
                    </button>
                  );
                })}
              </Group>

              <div>
                <div className="ab-section__head"><h2 className="ab-section__title">存储位置</h2><span className="ab-section__meta">{summary?.captured_at ? `读取于 ${fmtTime(summary.captured_at)}` : ""}</span></div>
                <Group>
                  {(summary?.by_bucket || []).map((row) => (
                    <div key={row.bucket} className="ab-row">
                      <span className="ab-row__icon tone-blue"><HardDrive size={14} /></span>
                      <span className="ab-row__body">
                        <span className="ab-row__title">{BUCKET_LABEL[row.bucket] || row.bucket}</span>
                        <span className="ab-row__meta">{fmtNum(row.objects)} 个对象</span>
                      </span>
                      <span className="ab-row__value"><b>{fmtBytes(row.bytes)}</b></span>
                    </div>
                  ))}
                </Group>
              </div>

              <Collapse title="历史扫描" count={summary?.scans?.length || 0} hint={summary?.latest_scan ? `最近 ${fmtTime(summary.latest_scan.finished_at || summary.latest_scan.created_at)}` : "尚未扫描"}>
                <Group plain>
                  {(summary?.scans || []).map((scan) => (
                    <div key={scan.id} className="ab-row">
                      <span className="ab-row__body">
                        <span className="ab-row__title">{scan.status === "completed" ? "扫描完成" : scan.status === "running" ? "扫描中" : "扫描失败"}</span>
                        <span className="ab-row__meta">{fmtTime(scan.created_at)} · {fmtNum(scan.scanned_count)} 个对象 · 孤立 {scan.orphan_count} · 重复 {scan.duplicate_count}</span>
                      </span>
                      <span className="ab-row__value">{fmtBytes(scan.reclaimable_bytes)}</span>
                    </div>
                  ))}
                  {!summary?.scans?.length ? <Empty title="还没有扫描记录" hint="在健康检查里发起一次扫描。" /> : null}
                </Group>
              </Collapse>
            </>
          ) : null}

          {tab === "list" ? (
            <>
              <div className="ab-toolbar">
                <Segmented value={kind} ariaLabel="资源类型" onChange={(next: Kind | "all") => { setKind(next); setOffset(0); }} options={[{ value: "all" as const, label: "全部" }, ...(["image", "document", "ai", "archive", "app"] as Kind[]).map((value) => ({ value, label: KIND_LABEL[value] }))]} />
              </div>
              <div className="ab-toolbar">
                <Segmented value={state} ariaLabel="引用状态" onChange={(next: string | "all") => { setState(next); setOffset(0); }} options={[{ value: "all", label: "全部状态" }, { value: "referenced", label: "使用中" }, { value: "orphan", label: "孤立" }, { value: "temporary", label: "保留期内" }]} />
                <select className="ab-select" value={`${sort}-${desc ? "desc" : "asc"}`} onChange={(event) => { const [nextSort, dir] = event.target.value.split("-"); setSort(nextSort as "created" | "size" | "name"); setDesc(dir === "desc"); setOffset(0); }} aria-label="排序方式">
                  <option value="created-desc">按上传时间</option>
                  <option value="size-desc">按容量从大到小</option>
                  <option value="size-asc">按容量从小到大</option>
                  <option value="name-asc">按文件名</option>
                </select>
              </div>
              <form className="ab-search" onSubmit={(event) => { event.preventDefault(); setApplied(query.trim()); setOffset(0); }}>
                <Search size={15} aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件名" aria-label="搜索资源" />
              </form>
              <Group>
                {page?.items?.map((item) => {
                  const Icon = iconOf(item.kind);
                  const stateMeta = STATE_LABEL[item.state] || { text: item.state, tone: "info" };
                  return (
                    <button key={`${item.bucket}/${item.name}`} type="button" className="ab-item" style={{ border: 0, borderRadius: 0, background: "transparent" }} onClick={() => void openDetail(item)}>
                      <span className="ab-item__thumb"><Icon size={17} /></span>
                      <span className="ab-item__body">
                        <span className="ab-item__title">{item.name.split("/").pop()}</span>
                        <span className="ab-item__meta">
                          <span>{fmtBytes(item.bytes)}</span><span>·</span><span>{item.mime || "未知类型"}</span><span>·</span>
                          <span>{fmtTime(item.created_at)}</span>
                          {item.ref_count ? <><span>·</span><span>被引用 {item.ref_count} 次</span></> : null}
                        </span>
                      </span>
                      <span className="ab-item__right"><span className={`ab-chip ${stateMeta.tone}`}>{stateMeta.text}</span></span>
                    </button>
                  );
                })}
                {page && !page.items.length ? <Empty title="没有匹配的资源" hint="换一个类型或关键词试试。" /> : null}
                {!page ? <div className="ab-skel" style={{ height: 140, margin: 12 }} /> : null}
              </Group>
              {page ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                  <span className="ab-label">共 {fmtNum(page.total)} 个 · 当前 {page.items.length} 个 · {fmtBytes(page.bytes)}</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="ab-iconbtn" aria-label="上一页" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}><ChevronLeft size={16} /></button>
                    <button type="button" className="ab-iconbtn" aria-label="下一页" disabled={offset + 24 >= page.total} onClick={() => setOffset(offset + 24)}><ChevronRight size={16} /></button>
                  </span>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "health" ? (
            <>
              <div className="ab-card">
                <div className="ab-card__head"><span className="ab-card__title">资源健康</span><span className={`ab-chip ${health ? "ok" : "warn"}`}>{health ? `扫描于 ${fmtTime(health.scanned_at)}` : "未扫描"}</span></div>
                <div className="ab-kv-grid">
                  <div><b style={{ color: (health?.orphans.length || 0) > 0 ? "var(--ab-coral)" : undefined }}>{health ? fmtNum(health.orphans.length) : "—"}</b><span>孤立资源 {health ? `· ${fmtBytes(health.orphan_bytes)}` : ""}</span></div>
                  <div><b>{health ? fmtNum(health.duplicates.length) : "—"}</b><span>重复文件组 {health ? `· 可省 ${fmtBytes(health.duplicate_bytes)}` : ""}</span></div>
                  <div><b style={{ color: (health?.missing.length || 0) > 0 ? "var(--ab-amber)" : undefined }}>{health ? fmtNum(health.missing.length) : "—"}</b><span>登记但对象缺失</span></div>
                  <div><b>{health ? fmtNum(health.temporary) : "—"}</b><span>保留期内未引用 {health ? `· ${fmtBytes(health.temporary_bytes)}` : ""}</span></div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="ab-chip info" style={{ border: 0, padding: "8px 12px" }} disabled={busy === "scan"} onClick={() => void runScan()}>{busy === "scan" ? "扫描中…" : "开始扫描"}</button>
                  {health ? <button type="button" className="ab-chip" style={{ border: 0, padding: "8px 12px" }} onClick={() => void loadHealth()}>读取最近结果</button> : null}
                </div>
                <p className="ab-label" style={{ margin: 0 }}>扫描只生成报告，不删除任何对象；重复判定使用文件大小 + 存储内容指纹（ETag），分片上传的 ETag 不参与判定。</p>
              </div>

              {health ? (
                <>
                  {health.orphans.length ? (
                    <div>
                      <div className="ab-section__head"><h2 className="ab-section__title">孤立资源</h2><span className="ab-section__meta">未被任何业务引用且超过 7 天保留期</span></div>
                      <Group>
                        {health.orphans.slice(0, 12).map((row) => {
                          const key = `${row.bucket}/${row.name}`;
                          return (
                            <label key={key} className="ab-row" style={{ cursor: "pointer" }}>
                              <input type="checkbox" checked={selected.includes(key)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} aria-label={`选择 ${row.name}`} />
                              <span className="ab-row__body">
                                <span className="ab-row__title" style={{ fontSize: 12 }}>{row.name.split("/").pop()}</span>
                                <span className="ab-row__meta">{BUCKET_LABEL[row.bucket] || row.bucket} · {fmtBytes(row.bytes)} · {fmtTime(row.created_at)}</span>
                              </span>
                            </label>
                          );
                        })}
                      </Group>
                      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button type="button" className="ab-chip bad" style={{ border: 0, padding: "8px 12px" }} disabled={!selected.length || busy === "cleanup"} onClick={() => void cleanup()}><Trash2 size={12} /> 清理所选（{selected.length}）</button>
                        <span className="ab-label">清理前会再次检查引用与保留期；仍被引用或未满 7 天的对象会被跳过。</span>
                      </div>
                    </div>
                  ) : null}

                  <Collapse title="重复文件" count={health.duplicates.length} hint={health.duplicates.length ? `可释放约 ${fmtBytes(health.duplicate_bytes)}` : "未发现完全重复"}>
                    <Group plain>
                      {health.duplicates.map((group) => (
                        <div key={group.etag} className="ab-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span className="ab-row__icon tone-amber"><Copy size={14} /></span>
                            <span className="ab-row__body"><span className="ab-row__title">{group.count} 个相同文件 · {fmtBytes(group.bytes)}</span><span className="ab-row__meta" style={{ fontSize: 10 }}>指纹 {group.etag.slice(0, 16)}…</span></span>
                          </div>
                          <span className="ab-label" style={{ paddingLeft: 34 }}>{group.items.map((item) => item.name.split("/").pop()).join("、")}</span>
                        </div>
                      ))}
                      {!health.duplicates.length ? <Empty title="没有完全重复的文件" /> : null}
                    </Group>
                  </Collapse>

                  <Collapse title="登记但对象缺失" count={health.missing.length} hint="数据库有引用，存储里找不到文件">
                    <Group plain>
                      {health.missing.slice(0, 20).map((row) => (
                        <div key={row.path} className="ab-row">
                          <span className="ab-row__icon tone-amber"><ShieldAlert size={14} /></span>
                          <span className="ab-row__body"><span className="ab-row__title" style={{ fontSize: 11.5 }}>{row.path}</span><span className="ab-row__meta">{row.post_id ? `作品 ${row.post_id.slice(0, 8)}` : "无作品关联"}</span></span>
                        </div>
                      ))}
                    </Group>
                  </Collapse>
                </>
              ) : (
                <Empty icon={<ShieldAlert size={20} />} title="还没有扫描结果" hint="点击「开始扫描」生成真实报告。" />
              )}
            </>
          ) : null}

          {tab === "rankings" ? (
            <>
              <div className="ab-toolbar">
                <Segmented value={rankMetric} ariaLabel="排行指标" onChange={setRankMetric} options={[{ value: "bytes", label: "流量" }, { value: "requests", label: "访问" }, { value: "downloads", label: "下载" }]} />
                <Segmented value={rankRange} ariaLabel="时间范围" onChange={setRankRange} options={[{ value: "today", label: "今日" }, { value: "7d", label: "7 天" }, { value: "30d", label: "30 天" }]} />
              </div>
              <Group>
                {(ranks || []).map((row, index) => {
                  const Icon = iconOf(row.kind);
                  const max = Math.max(1, ...(ranks || []).map((item) => rankMetric === "bytes" ? item.bytes : rankMetric === "requests" ? item.requests : item.downloads));
                  const value = rankMetric === "bytes" ? row.bytes : rankMetric === "requests" ? row.requests : row.downloads;
                  return (
                    <div key={row.path} className="ab-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 18, color: index < 3 ? "var(--ab-gold)" : "var(--ab-ink-3)", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{index + 1}</span>
                        <span className="ab-row__icon tone-blue"><Icon size={13} /></span>
                        <span className="ab-row__body">
                          <span className="ab-row__title" style={{ fontSize: 12 }}>{row.path.split("/").pop()}</span>
                          <span className="ab-row__meta">{row.title || (row.post_id ? `作品 ${row.post_id.slice(0, 8)}` : "未关联作品")} · {KIND_LABEL[row.kind] || row.kind}</span>
                        </span>
                        <span className="ab-row__value"><b>{rankMetric === "bytes" ? fmtBytes(row.bytes) : fmtNum(value)}</b></span>
                      </div>
                      <span className="ab-bar tone-blue"><i style={{ width: `${Math.max(2, Math.round((value / max) * 100))}%` }} /></span>
                    </div>
                  );
                })}
                {ranks && !ranks.length ? <Empty title="该时间范围内没有访问记录" hint="访问数据从本次部署开始采集，不回溯伪造历史流量。" /> : null}
              </Group>
              <p className="ab-label" style={{ padding: "0 4px" }}>「下载」只统计安装包与附件的下载请求；图片、视频按访问请求计。Range 分段请求不重复计为完整下载。</p>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function DetailView({
  detail,
  onBack,
  onChanged,
}: {
  detail: { item: Item; refs: Array<{ kind: string; post_id: string | null; post_title: string | null; post_status: string | null }>; etag: string; upload_tasks: Array<{ task_key: string; status: string; client_type: string | null; created_at: string }> };
  onBack: () => void;
  onChanged: () => void;
}) {
  const { item, refs, etag, upload_tasks } = detail;
  const [preview, setPreview] = useState(false);
  const url = `/api/v1/media?path=${encodeURIComponent(item.name)}&redirect=1`;
  const stateMeta = STATE_LABEL[item.state] || { text: item.state, tone: "info" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="ab-iconbtn" aria-label="返回资源列表" onClick={onBack}><ArrowLeft size={18} /></button>
        <span style={{ fontSize: 13, color: "var(--ab-ink-3)" }}>{KIND_LABEL[item.kind]}详情</span>
      </div>
      <div className="ab-panel">
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {item.kind === "image" ? (
            <button type="button" onClick={() => setPreview(true)} style={{ border: 0, padding: 0, background: "none", width: 112, height: 84, borderRadius: 12, overflow: "hidden", flex: "none" }} aria-label="查看大图">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={item.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ) : <span className="ab-item__thumb" style={{ width: 56, height: 56 }}>{(() => { const Icon = iconOf(item.kind); return <Icon size={20} />; })()}</span>}
          <div style={{ minWidth: 0 }}>
            <h3 className="ab-panel__title" style={{ marginBottom: 4, wordBreak: "break-all" }}>{item.name.split("/").pop()}</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={`ab-chip ${stateMeta.tone}`}>{stateMeta.text}</span>
              <span className="ab-chip info">{fmtBytes(item.bytes)}</span>
              <span className="ab-chip">{item.mime || "未知类型"}</span>
            </div>
          </div>
        </div>
        <div className="ab-kv" style={{ marginTop: 12 }}>
          <dt>所属位置</dt><dd>{BUCKET_LABEL[item.bucket] || item.bucket}</dd>
          <dt>上传时间</dt><dd>{fmtTime(item.created_at)}</dd>
          <dt>引用数量</dt><dd>{refs.length} 处</dd>
          <dt>内容指纹</dt><dd style={{ fontSize: 10.5, wordBreak: "break-all" }}>{etag || "未采集"}</dd>
        </div>
      </div>

      <div className="ab-panel">
        <h3 className="ab-panel__title">业务引用</h3>
        {refs.length ? (
          <Group plain>
            {refs.map((ref, index) => (
              <div key={`${ref.kind}-${ref.post_id}-${index}`} className="ab-row">
                <span className="ab-row__body">
                  <span className="ab-row__title" style={{ fontSize: 12 }}>{ref.post_title || (ref.post_id ? `作品 ${ref.post_id.slice(0, 8)}` : "账号/配置引用")}</span>
                  <span className="ab-row__meta">{ref.kind === "post" ? "作品正文或封面" : ref.kind === "asset" ? "媒体资产记录" : ref.kind === "publish" ? "发布任务" : ref.kind === "profile" ? "头像或背景" : ref.kind === "config" ? "运营配置" : ref.kind === "dm" ? "私信图片" : ref.kind === "feedback" ? "用户反馈附件" : "上传任务"}{ref.post_status ? ` · ${ref.post_status}` : ""}</span>
                </span>
              </div>
            ))}
          </Group>
        ) : <Empty title="没有任何业务引用" hint="超过 7 天后会被标记为孤立资源。" />}
      </div>

      {upload_tasks.length ? (
        <Collapse title="上传任务" count={upload_tasks.length}>
          <Group plain>
            {upload_tasks.map((task) => (
              <div key={task.task_key} className="ab-row">
                <span className="ab-row__body"><span className="ab-row__title" style={{ fontSize: 11.5 }}>{task.task_key.slice(0, 16)}</span><span className="ab-row__meta">{task.status} · {task.client_type || "未知客户端"} · {fmtTime(task.created_at)}</span></span>
              </div>
            ))}
          </Group>
        </Collapse>
      ) : null}

      <Collapse title="技术信息" hint="默认收起，避免暴露内部路径">
        <div className="ab-kv">
          <dt>对象路径</dt><dd style={{ fontSize: 10.5, wordBreak: "break-all" }}>{item.name}</dd>
          <dt>存储桶</dt><dd>{item.bucket}</dd>
        </div>
      </Collapse>

      {item.ref_count === 0 ? <p className="ab-label" style={{ margin: 0 }}>该对象当前没有业务引用；清理请回到健康检查，二次校验通过后才会真正删除。</p> : null}

      {preview ? (
        <div role="dialog" aria-label="资源预览" onClick={() => setPreview(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.72)", display: "grid", placeItems: "center", padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={item.name} style={{ maxWidth: "100%", maxHeight: "86vh", borderRadius: 14 }} />
        </div>
      ) : null}
    </div>
  );
}
