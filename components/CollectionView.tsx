"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Bookmark, Check, ChevronDown, ChevronUp, Layers, ListOrdered, Loader2, Pencil, Plus, Share2, ShieldCheck, Trash2, X } from "lucide-react";
import { cloudRequest, publicRequest } from "@/lib/cloud";
import { confirmInApp } from "@/lib/in-app-dialog";

type Chapter = { id: string; clientId: number; title: string; excerpt: string; image: string | null; status: string; chapter: number; date: string };
type Series = {
  id: string; creatorId: string; title: string; description: string; coverUrl: string | null;
  kind: "serial" | "tutorial" | "resource"; channel: "community" | "ai"; categoryId: number | null;
  status: "ongoing" | "completed"; reviewStatus: "pending" | "approved" | "rejected"; reviewNote: string | null;
  isPublic: boolean; pendingPublic: Record<string, unknown> | null;
  creator: { id: string; nickname: string; avatarUrl: string | null } | null;
  chapters: Chapter[]; publishedCount: number; followCount: number;
  following: boolean; notify: boolean; progressPostId: string | null; isOwner: boolean;
};
type OwnPost = { id: number; cloudId?: string; title: string; seriesId?: string };
type Props = {
  id: string;
  accountId: string | null;
  ownPosts?: OwnPost[];
  onBack: () => void;
  onOpenChapter: (chapter: Chapter) => void;
  onLogin: () => void;
  onNotice: (message: string) => void;
  onChanged?: () => void;
};

const KIND_LABEL: Record<string, string> = { serial: "连载", tutorial: "教程", resource: "资源" };
const STATUS_LABEL: Record<string, string> = { ongoing: "连载中", completed: "已完结" };

/** 审核状态文案：只按真实状态渲染，不把 null/undefined 变成可见文字。 */
function reviewState(series: Series) {
  if (series.reviewStatus === "rejected") return { tone: "rejected", title: "退回修改", note: (series.reviewNote || "").trim() };
  if (series.reviewStatus === "pending") return { tone: "pending", title: "审核中", note: "" };
  return null;
}

export default function CollectionView({ id, accountId, ownPosts = [], onBack, onOpenChapter, onLogin, onNotice, onChanged }: Props) {
  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"read" | "manage">("read");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", coverUrl: "", kind: "serial", status: "ongoing" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await publicRequest<Series>(`/api/v1/series?id=${encodeURIComponent(id)}`);
      if (!data) throw new Error("合集不存在或暂不可见");
      setSeries(data);
      setForm({ title: data.title, description: data.description, coverUrl: data.coverUrl || "", kind: data.kind, status: data.status });
    } catch (e) {
      setError(e instanceof Error ? e.message : "合集加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const chapters = useMemo(() => series?.chapters || [], [series]);
  const continueChapter = useMemo(() => {
    if (!series) return null;
    const current = chapters.find((chapter) => chapter.id === series.progressPostId);
    if (current && current.status === "published") return current;
    return chapters.find((chapter) => chapter.status === "published") || null;
  }, [chapters, series]);

  const toggleFollow = async () => {
    if (!accountId) { onLogin(); return; }
    if (!series || busy) return;
    setBusy(true);
    try {
      await cloudRequest("/api/v1/series", { action: "follow", id: series.id, value: !series.following });
      setSeries({ ...series, following: !series.following, followCount: series.followCount + (series.following ? -1 : 1) });
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!series) return;
    const url = `${window.location.origin}${window.location.pathname}?series=${series.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: series.title, text: series.description, url }); return; }
      await navigator.clipboard.writeText(url);
      onNotice("合集链接已复制");
    } catch { onNotice("分享未完成"); }
  };

  const save = async () => {
    if (!series || busy) return;
    setBusy(true);
    try {
      const result = await cloudRequest("/api/v1/series", {
        id: series.id,
        title: form.title.trim(),
        description: form.description.trim(),
        coverUrl: form.coverUrl.trim() || undefined,
        kind: form.kind,
        status: form.status,
      }) as { awaitingReview?: boolean };
      await load();
      onChanged?.();
      onNotice(result?.awaitingReview ? "合集信息已提交审核，线上版本继续展示" : "合集信息已保存");
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const addPosts = async (postIds: string[]) => {
    if (!series || !postIds.length) return;
    setBusy(true);
    try {
      await cloudRequest("/api/v1/series", { action: "add_items", id: series.id, postIds });
      setAdding(false);
      await load();
      onChanged?.();
      onNotice(`已加入 ${postIds.length} 篇作品`);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "加入失败");
    } finally {
      setBusy(false);
    }
  };

  const removeChapter = async (chapter: Chapter) => {
    if (!series) return;
    const confirmed = await confirmInApp(`将《${chapter.title}》移出合集？作品本身不会被删除。`, { title: "移出合集", confirmLabel: "移出" });
    if (!confirmed) return;
    setBusy(true);
    try {
      await cloudRequest("/api/v1/series", { action: "remove_item", id: series.id, postId: chapter.id });
      await load();
      onChanged?.();
      onNotice("已移出合集，作品保留");
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "移出失败");
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!series) return;
    const next = [...chapters];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSeries({ ...series, chapters: next.map((chapter, position) => ({ ...chapter, chapter: position + 1 })) });
    try {
      await cloudRequest("/api/v1/series", { action: "reorder", id: series.id, postIds: next.map((chapter) => chapter.id) });
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "排序未保存");
      void load();
    }
  };

  const removeSeries = async () => {
    if (!series) return;
    const confirmed = await confirmInApp("合集会被删除，其中作品会保留为独立作品。", { title: "删除合集", confirmLabel: "删除合集", danger: true });
    if (!confirmed) return;
    setBusy(true);
    try {
      await cloudRequest("/api/v1/series", { action: "delete", id: series.id });
      onChanged?.();
      onBack();
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const candidates = useMemo(() => ownPosts.filter((post) => post.seriesId !== id), [ownPosts, id]);
  const review = series ? reviewState(series) : null;

  if (loading) return <section className="page collection-page"><button className="back settings-back" type="button" onClick={onBack}><span aria-hidden="true">‹</span> 返回</button><div className="collection-empty"><Loader2 size={18} className="spin"/> 正在加载合集…</div></section>;
  if (error || !series) return <section className="page collection-page"><button className="back settings-back" type="button" onClick={onBack}><span aria-hidden="true">‹</span> 返回</button><div className="collection-empty">{error || "合集不存在"}</div></section>;

  /* ---------------- 作者管理：资料 / 章节 / 审核 三个分组，与阅读页分开 ---------------- */
  if (mode === "manage") {
    return <section className="page collection-page collection-manage-page">
      <button className="back settings-back" type="button" onClick={() => setMode("read")}><span aria-hidden="true">‹</span> 返回合集</button>
      <div className="collection-manage-title"><h1>管理合集</h1><p>阅读页只负责阅读，资料、章节与审核集中在这里。</p></div>

      <section className="collection-manage-group" aria-labelledby="manage-profile-title">
        <div className="collection-manage-head"><h2 id="manage-profile-title">合集资料</h2></div>
        <div className="collection-edit-form">
          <label><span>合集名称</span><input value={form.title} maxLength={48} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
          <label><span>简介</span><textarea value={form.description} maxLength={240} rows={3} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
          <label><span>封面地址</span><input value={form.coverUrl} placeholder="https://…（可选）" onChange={(event) => setForm({ ...form, coverUrl: event.target.value })}/></label>
          <div className="collection-edit-row">
            <label><span>类型</span><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="serial">连载</option><option value="tutorial">教程</option><option value="resource">资源</option></select></label>
            <label><span>状态</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ongoing">连载中</option><option value="completed">已完结</option></select></label>
          </div>
          <div className="collection-edit-actions"><button type="button" className="collection-primary" disabled={busy || form.title.trim().length < 2} onClick={() => void save()}><Check size={14}/>{busy ? "保存中…" : "保存资料"}</button></div>
        </div>
      </section>

      <section className="collection-manage-group" aria-labelledby="manage-chapter-title">
        <div className="collection-manage-head"><h2 id="manage-chapter-title">章节管理</h2><span>{chapters.length} 章</span></div>
        {chapters.length ? <ol className="collection-chapter-list collection-chapter-list-manage">
          {chapters.map((chapter, index) => <li key={chapter.id} className={series.progressPostId === chapter.id ? "is-progress" : ""}>
            <button type="button" className="collection-chapter-open" onClick={() => { if (chapter.status === "published") { void cloudRequest("/api/v1/series", { action: "progress", id: series.id, postId: chapter.id }).catch(() => {}); setMode("read"); onOpenChapter(chapter); } }}>
              <span className="collection-chapter-index">{String(chapter.chapter).padStart(2, "0")}</span>
              <span className="collection-chapter-copy"><strong>{chapter.title}</strong>{chapter.excerpt && <small>{chapter.excerpt}</small>}<i>{chapter.date}{chapter.status !== "published" ? ` · ${chapter.status === "draft" ? "草稿" : "审核中"}` : ""}</i></span>
            </button>
            <span className="collection-chapter-tools">
              <button type="button" aria-label="上移" disabled={index === 0} onClick={() => void move(index, -1)}><ChevronUp size={14}/></button>
              <button type="button" aria-label="下移" disabled={index === chapters.length - 1} onClick={() => void move(index, 1)}><ChevronDown size={14}/></button>
              <button type="button" aria-label="移出合集" onClick={() => void removeChapter(chapter)}><X size={14}/></button>
            </span>
          </li>)}
        </ol> : <div className="collection-empty"><Layers size={18}/> 合集还没有章节，先添加一篇已有作品。</div>}
        <button type="button" className="collection-ghost collection-add-first" onClick={() => setAdding(true)}><Plus size={15}/>添加已有作品</button>
      </section>

      <section className="collection-manage-group" aria-labelledby="manage-review-title">
        <div className="collection-manage-head"><h2 id="manage-review-title"><ShieldCheck size={15}/>发布与审核</h2></div>
        <div className={`collection-review-state${review ? ` is-${review.tone}` : " is-approved"}`}>
          <strong>{review ? review.title : "已通过审核"}</strong>
          <small>{review
            ? series.reviewStatus === "pending"
              ? series.isPublic ? "公开信息修改已提交，线上版本继续展示。" : "新合集待审核，仅自己可见。"
              : "按审核意见修改后可以重新提交。"
            : "合集公开可见，新章节发布后自动进入审核。"}</small>
          {review?.note ? <p className="collection-review-note-text">审核意见：{review.note}</p> : null}
        </div>
        <div className="collection-edit-actions">
          <button type="button" className="collection-ghost" disabled={busy} onClick={() => void save()}>{busy ? "提交中…" : "重新提交审核"}</button>
        </div>
      </section>

      <section className="collection-manage-group is-danger" aria-labelledby="manage-danger-title">
        <div className="collection-manage-head"><h2 id="manage-danger-title">删除合集</h2></div>
        <p className="collection-danger-note">删除后合集不可恢复，其中作品会保留为独立作品，不会被删除。</p>
        <button type="button" className="collection-danger-button" disabled={busy} onClick={() => void removeSeries()}><Trash2 size={14}/>删除合集</button>
      </section>

      {adding && <div className="collection-picker" role="dialog" aria-label="选择要加入合集的作品">
        <div className="collection-picker-head"><strong>选择作品</strong><button type="button" aria-label="关闭" onClick={() => setAdding(false)}><X size={16}/></button></div>
        <p>从你已发布或草稿中的作品里挑选，可多选。</p>
        <div className="collection-picker-list">
          {candidates.length ? candidates.map((post) => {
            const key = post.cloudId || String(post.id);
            return <label key={key}><input type="checkbox" value={key}/><span>{post.title}</span></label>;
          }) : <p className="collection-empty">没有可加入的作品，先去发布一篇。</p>}
        </div>
        <div className="collection-picker-actions">
          <button type="button" className="collection-ghost" onClick={() => setAdding(false)}>取消</button>
          <button type="button" className="collection-primary" disabled={busy} onClick={(event) => {
            const inputs = (event.currentTarget.closest(".collection-picker") as HTMLElement)?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
            const ids = inputs ? Array.from(inputs).map((input) => input.value) : [];
            if (!ids.length) { onNotice("请先选择作品"); return; }
            void addPosts(ids);
          }}><Check size={14}/>加入合集</button>
        </div>
      </div>}
    </section>;
  }

  /* ---------------- 阅读页：紧凑封面 + 基础信息 + 主要操作 + 章节目录 ---------------- */
  return <section className="page collection-page">
    <button className="back settings-back" type="button" onClick={onBack}><span aria-hidden="true">‹</span> 返回</button>
    <header className={`collection-hero${series.coverUrl ? " has-cover" : ""}`}>
      <div className="collection-cover" aria-hidden="true">
        {series.coverUrl
          ? <span className="collection-cover-image" style={{ backgroundImage: `url(${series.coverUrl})` }}/>
          : <span className="collection-cover-fallback"><Layers size={20}/><em>{KIND_LABEL[series.kind] || "连载"}</em></span>}
      </div>
      <div className="collection-hero-copy">
        <div className="collection-hero-eyebrow">
          <span>{KIND_LABEL[series.kind] || "连载"}</span>
          <span>{series.status === "completed" ? "已完结" : STATUS_LABEL[series.status]}</span>
          <span>{series.publishedCount} 章</span>
        </div>
        <h1>{series.title}</h1>
        {series.description && <p>{series.description}</p>}
        <div className="collection-hero-meta">
          {series.creator && <span>{series.creator.nickname}</span>}
          <span>{series.followCount} 人收藏</span>
        </div>
      </div>
    </header>

    <div className="collection-actions">
      {continueChapter && <button type="button" className="collection-primary" onClick={() => { if (series.progressPostId) void cloudRequest("/api/v1/series", { action: "progress", id: series.id, postId: continueChapter.id }).catch(() => {}); onOpenChapter(continueChapter); }}><BookOpen size={15}/>{series.progressPostId ? "继续阅读" : "开始阅读"}</button>}
      <button type="button" className={`collection-ghost${series.following ? " active" : ""}`} onClick={() => void toggleFollow()} disabled={busy}><Bookmark size={15} fill={series.following ? "currentColor" : "none"}/>{series.following ? "已收藏" : "收藏"}</button>
      <button type="button" className="collection-ghost" onClick={() => void share()}><Share2 size={15}/>分享</button>
      {series.isOwner && <button type="button" className="collection-ghost collection-manage-entry" onClick={() => setMode("manage")}><Pencil size={15}/>管理</button>}
    </div>

    {review && <p className={`collection-review-note is-${review.tone}`}>{review.tone === "pending" ? (series.isPublic ? "公开信息修改待审核，线上版本继续展示。" : "新合集待审核，仅自己可见。") : `已退回修改${review.note ? `：${review.note}` : ""}`}</p>}

    {series.following && <label className="collection-notify">
      <input type="checkbox" checked={series.notify} disabled={busy} onChange={(event) => {
        const next = event.target.checked;
        setSeries({ ...series, notify: next });
        void cloudRequest("/api/v1/series", { action: "notify", id: series.id, notify: next })
          .then(() => onNotice(next ? "已开启更新提醒" : "已关闭更新提醒"))
          .catch((error) => { setSeries({ ...series, notify: !next }); onNotice(error instanceof Error ? error.message : "设置失败"); });
      }}/>
      <span>新章节通过审核后提醒我</span>
    </label>}

    <section className="collection-toc">
      <div className="collection-toc-head"><h2><ListOrdered size={16}/> 章节目录</h2><span>{series.publishedCount} 章已发布</span></div>
      {chapters.length ? <ol className="collection-chapter-list">
        {chapters.map((chapter) => <li key={chapter.id} className={`${series.progressPostId === chapter.id ? "is-progress" : ""}${chapter.status !== "published" ? " is-unpublished" : ""}`}>
          <button type="button" className="collection-chapter-open" onClick={() => { if (chapter.status === "published") { void cloudRequest("/api/v1/series", { action: "progress", id: series.id, postId: chapter.id }).catch(() => {}); onOpenChapter(chapter); } }}>
            <span className="collection-chapter-index">{String(chapter.chapter).padStart(2, "0")}</span>
            <span className="collection-chapter-copy"><strong>{chapter.title}</strong>{chapter.excerpt && <small>{chapter.excerpt}</small>}<i>{chapter.date}{chapter.status !== "published" ? ` · ${chapter.status === "draft" ? "草稿" : "审核中"}` : ""}</i></span>
            {series.progressPostId === chapter.id && <em className="collection-chapter-current">正在读</em>}
          </button>
        </li>)}
      </ol> : <div className="collection-empty"><Layers size={18}/> 合集还没有章节{series.isOwner ? "，去「管理」里添加一篇已有作品。" : "。"}</div>}
    </section>
  </section>;
}
