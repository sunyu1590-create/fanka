"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, ChevronRight, Flag, RefreshCw, ShieldCheck, Sparkles, Star, Tag, X } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { MarkdownContent } from "./MarkdownContent";
import ChoiceSelect from "./ChoiceSelect";
import { confirmInApp } from "@/lib/in-app-dialog";

type Area = "review" | "resources" | "feedback" | "categories";
type Entry = { id: string; kind?: "new" | "revision"; title: string; body: string; author?: string; created_at?: string; status?: string; contentType?: string; resourceData?: Record<string, unknown>; images?: string[]; videos?: string[]; originalTitle?: string | null; featuredAt?: string | null; viewCount?: number; tag?: string; date?: string; channel?: "community" | "ai" };
type Category = { id: number; name: string; channel: "community" | "ai"; parent_id: number | null; kind: "category" | "tag"; sort_order: number; description: string; is_featured: boolean; active: boolean; aliases: string[]; moderation_status: "pending" | "approved" | "rejected"; contentCount: number };
type Feedback = { id: string; post_id: string; reporter_id: string; kind: string; details: string; status: string; review_note: string | null; handled_at: string | null; created_at: string; posts?: { title: string } | { title: string }[]; profiles?: { nickname: string } | { nickname: string }[] };
type PageData<T> = { items: T[]; total: number; page: number; limit: number };
const typeFilters = [
  ["", "全部类型"], ["knowledge_article", "AI 知识"], ["agent", "Agent"], ["skill", "Skills"],
  ["prompt", "Prompt"], ["ai_tool", "AI 工具"], ["tutorial", "实战教程"],
] as const;
const areas: { id: Area; label: string; note: string }[] = [
  { id: "review", label: "待审核", note: "新 AI 内容与编辑版本" },
  { id: "resources", label: "资源管理", note: "精选、下架和恢复" },
  { id: "feedback", label: "失效反馈", note: "链接、过时内容与安全风险" },
  { id: "categories", label: "分类与标签", note: "层级、排序、停用和治理" },
];
const first = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;

export default function AdminAIWorkspace({ canManageCategories = true }: { canManageCategories?: boolean }) {
  const [area, setArea] = useState<Area>("review");
  const [status, setStatus] = useState<"published" | "hidden">("published");
  const [feedbackStatus, setFeedbackStatus] = useState("open");
  const [contentType, setContentType] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ name: "", channel: "ai" as "community" | "ai", kind: "category" as "category" | "tag", description: "", sort_order: 100, parent_id: "" });
  const [mergeTarget, setMergeTarget] = useState<Record<number, string>>({});
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryChannel, setCategoryChannel] = useState("all");
  const [categoryKind, setCategoryKind] = useState("all");

  const load = useCallback(async (nextPage = 1, append = false) => {
    setBusy(true); setError("");
    try {
      if (area === "categories") {
        const result = await cloudRequest("/api/v1/admin/categories") as { items: Category[] };
        setCategories(result.items || []);
      } else if (area === "feedback") {
        const result = await cloudRequest(`/api/v1/admin/ai-space?status=feedback&feedbackStatus=${feedbackStatus}&page=${nextPage}&limit=20`) as PageData<Feedback>;
        setFeedback((current) => append ? [...current, ...(result.items || [])] : result.items || []); setTotal(result.total || 0); setPage(nextPage);
      } else {
        const targetStatus = area === "review" ? "queue" : status;
        const params = new URLSearchParams({ status: targetStatus, page: String(nextPage), limit: "20" });
        if (contentType) params.set("type", contentType);
        if (search) params.set("q", search);
        const result = await cloudRequest(`/api/v1/admin/ai-space?${params}`) as PageData<Entry>;
        setItems((current) => append ? [...current, ...(result.items || [])] : result.items || []); setTotal(result.total || 0); setPage(nextPage);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "AI 管理数据加载失败"); }
    finally { setBusy(false); }
  }, [area, status, feedbackStatus, contentType, search]);
  useEffect(() => { void load(1, false); }, [load]);

  const actOnPost = async (item: Entry, action: "approve" | "reject" | "hide" | "restore" | "feature") => {
    if (!item.id) return;
    if (action === "feature") {
      setSaving(item.id);
      try { await cloudRequest(`/api/v1/admin/ai-space/${item.id}`, { action: "feature", featured: !item.featuredAt }, "PATCH"); setNotice(item.featuredAt ? "已取消精选" : "已加入精选推荐"); await load(page); }
      catch (e) { setError(e instanceof Error ? e.message : "精选状态更新失败"); }
      finally { setSaving(null); }
      return;
    }
    const note = notes[item.id]?.trim() || (action === "hide" || action === "restore" ? "管理员调整 AI 内容公开状态" : "");
    if (note.length < 3) { setError("请填写至少 3 个字的审核说明"); return; }
    setSaving(item.id); setError(""); setNotice("");
    try {
      const nextStatus = action === "approve" || action === "restore" ? "published" : "hidden";
      await cloudRequest(`/api/v1/admin/ai-space/${item.id}`, { status: nextStatus, review_note: note }, "PATCH");
      setNotice(action === "reject" ? "内容已驳回，未公开" : action === "hide" ? "内容已下架" : action === "restore" ? "内容已恢复公开" : "内容已审核发布");
      setNotes((current) => ({ ...current, [item.id]: "" })); await load(page);
    } catch (e) { setError(e instanceof Error ? e.message : "AI 内容审核失败"); }
    finally { setSaving(null); }
  };

  const changeFeedback = async (item: Feedback, next: "resolved" | "dismissed") => {
    const note = notes[item.id]?.trim() || "已核实并记录处理结果";
    setSaving(item.id); setError(""); setNotice("");
    try { await cloudRequest(`/api/v1/admin/ai-space/feedback/${item.id}`, { status: next, review_note: note }, "PATCH"); setNotice(next === "resolved" ? "资源反馈已处理" : "反馈已驳回"); await load(page); }
    catch (e) { setError(e instanceof Error ? e.message : "反馈处理失败"); }
    finally { setSaving(null); }
  };

  const createCategory = async (event: FormEvent) => {
    event.preventDefault(); setSaving("create-category"); setError(""); setNotice("");
    try {
      await cloudRequest("/api/v1/admin/categories", { ...draft, parent_id: draft.parent_id || null });
      setDraft((current) => ({ ...current, name: "", description: "", parent_id: "" })); setNotice("分类或标签已创建"); await load(1);
    } catch (e) { setError(e instanceof Error ? e.message : "分类创建失败"); }
    finally { setSaving(null); }
  };
  const updateCategory = async (category: Category, values: Record<string, unknown>) => {
    setSaving(`category-${category.id}`); setError(""); setNotice("");
    try { await cloudRequest(`/api/v1/admin/categories/${category.id}`, values, "PATCH"); setNotice("分类或标签设置已保存"); await load(1); }
    catch (e) { setError(e instanceof Error ? e.message : "分类更新失败"); }
    finally { setSaving(null); }
  };
  const mergeCategory = async (category: Category) => {
    const target = Number(mergeTarget[category.id]);
    if (!Number.isSafeInteger(target) || target < 1) { setError("请选择合并目标"); return; }
    if (!await confirmInApp(`将「${category.name}」及其内容关系合并到所选分类？`, {title:"合并分类",confirmLabel:"确认合并",danger:true})) return;
    setSaving(`category-${category.id}`); setError(""); setNotice("");
    try { await cloudRequest(`/api/v1/admin/categories/${category.id}`, { action: "merge", target_id: target }, "PATCH"); setNotice("分类关联已合并，源分类保留为别名记录"); setMergeTarget((current) => ({ ...current, [category.id]: "" })); await load(1); }
    catch (e) { setError(e instanceof Error ? e.message : "分类合并失败"); }
    finally { setSaving(null); }
  };

  const visibleAreas = areas.filter((item) => canManageCategories || item.id !== "categories");
  return <section className="admin-ai-workspace">
    <div className="admin-ai-workspace-head"><div><small>AI / CONTENT OPERATIONS</small><h2>AI 专区工作台</h2><p>内容审核、资源维护、失效反馈与分类标签统一在此处理。</p></div><button className="soft-button" disabled={busy} onClick={() => void load(1)}><RefreshCw size={14}/>刷新</button></div>
    <div className="admin-ai-area-tabs" role="tablist" aria-label="AI 管理模块">{visibleAreas.map((item) => <button type="button" key={item.id} role="tab" aria-selected={area === item.id} className={area === item.id ? "selected" : ""} onClick={() => { setArea(item.id); setNotice(""); setError(""); }}><strong>{item.label}</strong><small>{item.note}</small><ChevronRight size={16}/></button>)}</div>
    {error && <p className="moderation-feedback error" role="alert">{error}</p>}{notice && <p className="moderation-feedback" role="status">{notice}</p>}

    {(area === "review" || area === "resources") && <>
      {area === "resources" && <div className="moderation-filters" role="group" aria-label="资源状态">{([ ["published", "已发布"], ["hidden", "已下架"] ] as const).map(([value, label]) => <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>)}</div>}
      <form className="admin-ai-content-filters" role="search" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }}><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索标题或正文" aria-label="搜索 AI 内容" maxLength={60}/><button className="soft-button" type="submit">搜索</button>{search && <button type="button" className="soft-button" onClick={() => { setSearch(""); setSearchDraft(""); }}>清除</button>}</form>
      <div className="admin-ai-type-filters" role="group" aria-label="AI 内容类型">{typeFilters.map(([value, label]) => <button type="button" key={value || "all"} className={contentType === value ? "selected" : ""} onClick={() => setContentType(value)}>{label}</button>)}</div>
      {busy && !items.length ? <p className="moderation-empty">正在加载 AI 内容…</p> : items.length ? <div className="moderation-list">{items.map((item) => <article className="moderation-item admin-ai-review-item" key={`${item.id}-${item.kind || item.status}`}>
        <div className="moderation-item-heading"><strong><Sparkles size={15}/> {area === "review" ? item.kind === "revision" ? "AI 内容修改待审核" : "AI 内容待审核" : `${item.status === "hidden" ? "已下架" : "已发布"} · ${item.featuredAt ? "精选" : "普通"}`}</strong><time>{item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : item.date}</time></div>
        <p className="moderation-author">{item.author || "探索者"} · {item.contentType || "knowledge_article"}{item.originalTitle ? ` · 公开版：${item.originalTitle}` : ""}</p>
        <h3 className="moderation-submission-title">{item.title}</h3>
        <details className="moderation-longtext"><summary>展开正文 · {item.body.length} 字</summary><MarkdownContent source={item.body} className="moderation-markdown"/></details>
        {item.resourceData && Object.keys(item.resourceData).length > 0 && <details className="admin-ai-resource-json"><summary>结构化资源字段 · {Object.keys(item.resourceData).length}</summary><dl>{Object.entries(item.resourceData).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join("\n") : String(value)}</dd></div>)}</dl></details>}
        {!!item.images?.length && <details className="moderation-image-details"><summary>查看图片 · {item.images.length}</summary><div className="moderation-images">{item.images.map((src, index) => <img key={`${src}-${index}`} src={src} alt="AI 内容配图" loading="lazy"/>)}</div></details>}
        {!!item.videos?.length && <details className="moderation-image-details"><summary>查看视频 · {item.videos.length}</summary><div className="moderation-images">{item.videos.map((src) => <video key={src} src={src} controls preload="metadata"/>)}</div></details>}
        {area === "review" ? <><label className="moderation-note">审核说明<textarea value={notes[item.id] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="审核通过或驳回时至少填写 3 个字"/></label><div className="moderation-actions"><button disabled={saving === item.id} onClick={() => void actOnPost(item, "approve")}><Check size={15}/>审核通过并发布</button><button disabled={saving === item.id} onClick={() => void actOnPost(item, "reject")}><X size={15}/>驳回</button></div></> : <div className="moderation-actions"><button disabled={saving === item.id} onClick={() => void actOnPost(item, "feature")}><Star size={15}/>{item.featuredAt ? "取消精选" : "设为精选"}</button><button disabled={saving === item.id} onClick={() => void actOnPost(item, item.status === "hidden" ? "restore" : "hide")}><ShieldCheck size={15}/>{item.status === "hidden" ? "恢复公开" : "下架"}</button></div>}
      </article>)}</div> : <p className="moderation-empty">{area === "review" ? "当前没有待审核的 AI 内容。" : "当前状态没有 AI 资源。"}</p>}
      {items.length < total && <button type="button" className="comments-load-more" disabled={busy} onClick={() => void load(page + 1, true)}>{busy ? "加载中…" : `加载更多（${items.length}/${total}）`}</button>}
    </>}

    {area === "feedback" && <><div className="moderation-filters" role="group" aria-label="资源反馈状态">{([["open", "待处理"], ["resolved", "已处理"], ["dismissed", "已驳回"], ["all", "全部"]] as const).map(([value, label]) => <button key={value} className={feedbackStatus === value ? "selected" : ""} onClick={() => setFeedbackStatus(value)}>{label}</button>)}</div>{feedback.length ? <div className="moderation-list">{feedback.map((item) => { const profile = first(item.profiles); const post = first(item.posts); return <article className="moderation-item" key={item.id}><div className="moderation-item-heading"><strong><Flag size={15}/> {item.kind === "broken_link" ? "链接失效" : item.kind === "unsafe" ? "安全风险" : item.kind === "outdated" ? "内容过时" : "其他反馈"} · {item.status === "open" ? "待处理" : item.status === "resolved" ? "已处理" : "已驳回"} · {post?.title || "AI 资源"}</strong><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></div><p className="moderation-author">反馈人：{profile?.nickname || item.reporter_id.slice(0, 8)}</p><p>{item.details}</p>{item.review_note && <p className="moderation-history"><strong>处理记录</strong> {item.review_note}{item.handled_at ? ` · ${new Date(item.handled_at).toLocaleString("zh-CN")}` : ""}</p>}{item.status === "open" && <><label className="moderation-note">处理说明<textarea value={notes[item.id] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="简述核查结果，至少 3 个字"/></label><div className="moderation-actions"><button disabled={saving === item.id} onClick={() => void changeFeedback(item, "resolved")}><Check size={15}/>已核实并处理</button><button disabled={saving === item.id} onClick={() => void changeFeedback(item, "dismissed")}><X size={15}/>驳回反馈</button></div></>}</article>; })}</div> : <p className="moderation-empty">当前筛选没有 AI 资源反馈。</p>}{feedback.length < total && <button className="comments-load-more" disabled={busy} onClick={() => void load(page + 1, true)}>加载更多</button>}</>}

    {area === "categories" && <>
      <form className="admin-ai-category-form" onSubmit={(event) => void createCategory(event)}><div><small>CATALOG / CREATE</small><h3>新增分类或标签</h3></div><label>名称<input required minLength={2} maxLength={32} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}/></label><div className="admin-ai-category-form-row"><label>频道<ChoiceSelect label="频道" value={draft.channel} onChange={(value) => setDraft((current) => ({ ...current, channel: value as "ai" | "community", parent_id: "" }))} options={[{value:"ai",label:"AI 空间"},{value:"community",label:"社区"}]}/></label><label>类型<ChoiceSelect label="类型" value={draft.kind} onChange={(value) => setDraft((current) => ({ ...current, kind: value as "category" | "tag", parent_id: "" }))} options={[{value:"category",label:"内容分类"},{value:"tag",label:"内容标签"}]}/></label>{draft.kind === "category" && <label>上级分类<ChoiceSelect label="上级分类" value={draft.parent_id} onChange={(value) => setDraft((current) => ({ ...current, parent_id: value }))} options={[{value:"",label:"一级分类"},...categories.filter((item) => item.channel === draft.channel && item.kind === "category" && !item.parent_id && item.active).map((item) => ({value:String(item.id),label:item.name}))]}/></label>}</div><label>说明<input maxLength={240} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="简要说明这个分类的内容范围"/></label><label>排序<input type="number" min={0} max={10000} value={draft.sort_order} onChange={(event) => setDraft((current) => ({ ...current, sort_order: Number(event.target.value) }))}/></label><button className="primary-button" disabled={saving === "create-category"}>{saving === "create-category" ? "创建中…" : "新增"}</button></form>
      <div className="admin-ai-category-filters"><input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="搜索分类和标签"/><ChoiceSelect label="频道筛选" value={categoryChannel} onChange={setCategoryChannel} options={[{value:"all",label:"全部频道"},{value:"community",label:"社区"},{value:"ai",label:"AI 空间"}]}/><ChoiceSelect label="类型筛选" value={categoryKind} onChange={setCategoryKind} options={[{value:"all",label:"全部类型"},{value:"category",label:"分类"},{value:"tag",label:"标签"}]}/></div>
      {categories.length ? <div className="admin-ai-category-list">{categories.filter((category) => (categoryChannel === "all" || category.channel === categoryChannel) && (categoryKind === "all" || category.kind === categoryKind) && (!categorySearch.trim() || category.name.toLowerCase().includes(categorySearch.trim().toLowerCase()) || (category.aliases || []).some((alias) => alias.toLowerCase().includes(categorySearch.trim().toLowerCase())))).map((category) => <article className="admin-ai-category-row" key={category.id}><div className="admin-ai-category-main"><span className="admin-ai-category-icon"><Tag size={15}/></span><div><strong>{category.parent_id ? "↳ " : ""}{category.name}</strong><small>{category.channel === "ai" ? "AI 空间" : "社区"} · {category.kind === "category" ? "分类" : "标签"} · {category.contentCount} 篇内容 · {category.moderation_status === "pending" ? "待审核" : category.active ? "启用中" : "已停用"}</small>{category.aliases?.length > 0 && <small>别名：{category.aliases.join("、")}</small>}</div></div><div className="admin-ai-category-actions">{category.kind === "tag" && category.moderation_status === "pending" && <><button className="soft-button" disabled={saving === `category-${category.id}`} onClick={() => void updateCategory(category, { moderation_status: "approved", active: true })}>通过标签</button><button className="soft-button" disabled={saving === `category-${category.id}`} onClick={() => void updateCategory(category, { moderation_status: "rejected" })}>驳回</button></>}{category.kind === "category" && <button className={`soft-button${category.is_featured ? " selected" : ""}`} disabled={saving === `category-${category.id}`} onClick={() => void updateCategory(category, { is_featured: !category.is_featured })}>{category.is_featured ? "取消精选" : "设为精选"}</button>}<button className="soft-button" disabled={saving === `category-${category.id}`} onClick={() => void updateCategory(category, { active: !category.active })}>{category.active ? "停用" : "启用"}</button></div>{category.active && <details className="admin-ai-merge"><summary>编辑 / 合并 <ChevronRight size={14}/></summary><div><label>名称<input defaultValue={category.name} maxLength={32} onBlur={(event) => { if (event.currentTarget.value.trim() !== category.name) void updateCategory(category, { name: event.currentTarget.value.trim() }); }}/></label>{category.kind === "category" && <label>上级分类<ChoiceSelect label="上级分类" value={category.parent_id ? String(category.parent_id) : ""} onChange={(value) => { const parent_id = value ? Number(value) : null; if (parent_id !== category.parent_id) void updateCategory(category, { parent_id }); }} options={[{value:"",label:"一级分类"},...categories.filter((item) => item.id !== category.id && item.channel === category.channel && item.kind === "category" && item.active && !item.parent_id).map((item) => ({value:String(item.id),label:item.name}))]}/></label>}<label>排序<input type="number" min={0} max={10000} defaultValue={category.sort_order} onBlur={(event) => { const value = Number(event.currentTarget.value); if (value !== category.sort_order) void updateCategory(category, { sort_order: value }); }}/></label><label>说明<input defaultValue={category.description} maxLength={240} onBlur={(event) => { if (event.currentTarget.value !== category.description) void updateCategory(category, { description: event.currentTarget.value }); }}/></label><label>别名（逗号分隔）<input defaultValue={(category.aliases || []).join(",")} onBlur={(event) => { const values = event.currentTarget.value.split(",").map((value) => value.trim()).filter(Boolean); if (values.join(",") !== (category.aliases || []).join(",")) void updateCategory(category, { aliases: values }); }}/></label><label>合并至<ChoiceSelect label="合并至" value={mergeTarget[category.id] || ""} onChange={(value) => setMergeTarget((current) => ({ ...current, [category.id]: value }))} placeholder="选择同频道同类型目标" options={[{value:"",label:"选择同频道同类型目标"},...categories.filter((item) => item.id !== category.id && item.channel === category.channel && item.kind === category.kind && item.active).map((item) => ({value:String(item.id),label:item.name}))]}/></label><button className="soft-button" disabled={saving === `category-${category.id}` || !mergeTarget[category.id]} onClick={() => void mergeCategory(category)}>合并并保留历史关联</button></div></details>}</article>)}</div> : <p className="moderation-empty">正在加载动态分类…</p>}
    </>}
  </section>;
}
