"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Image as ImageIcon, LayoutTemplate, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { browserDb } from "@/lib/browser-db";
import { cloudFetch } from "@/lib/cloud";
import { cropRect } from "@/lib/cover-crop";
import AppLoginGate from "./AppLoginGate";

/**
 * 合集封面编辑器（网页端唯一入口，APP 只负责跳进来）。
 *
 * 四个来源：
 *  - auto     ：按合集真实信息推荐模板后程序化生成
 *  - template ：官方预设模板 + 可编辑标题/副标题/配色
 *  - upload   ：用户上传，取景可调
 *  - post     ：复用合集内作品图片，可与杂志模板组合
 * 纯图来源在浏览器里用 canvas 按同一套取景几何渲染预览，
 * 模板排版来源走服务端渲染，两者都与最终保存结果一致。
 */

type Template = { id: string; name: string; category: string; categoryLabel?: string; renderType: string; enabled: boolean };
type Palette = { key: string; label: string; palette: Record<string, string> };
type CoverInfo = {
  series: { id: string; title: string; subtitle: string; kind: string; chapters: number };
  cover: { source: string; version: number; templateId: string | null; title: string | null; subtitle: string | null; palette: string | null; pattern: string | null; crop: { focusX?: number; focusY?: number; zoom?: number } | null; storagePath: string | null; sourcePostId: string | null; url: string | null } | null;
  templates: Template[];
  palettes: Palette[];
  recommendedTemplateId: string | null;
  canEdit: boolean;
};

type PostImage = { id: string; title: string; image: string; count: number };
type Source = "auto" | "template" | "upload" | "post";

const SOURCE_LABEL: Record<Source, string> = { auto: "自动生成", template: "官方预设", upload: "上传图片", post: "作品图片" };
const CATEGORY_ORDER = ["swiss", "glass", "magazine", "minimal", "literary", "creative"];

export default function SeriesCoverEditor({ seriesId }: { seriesId: string }) {
  const [info, setInfo] = useState<CoverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const [source, setSource] = useState<Source>("auto");
  const [templateId, setTemplateId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [palette, setPalette] = useState("default");
  const [variant, setVariant] = useState(0);
  const [crop, setCrop] = useState({ focusX: 50, focusY: 50, zoom: 1 });
  const [uploadPath, setUploadPath] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [posts, setPosts] = useState<PostImage[]>([]);
  const [postId, setPostId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewToken = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  const template = useMemo(() => info?.templates.find((item) => item.id === templateId) || null, [info, templateId]);
  const isMagazine = template?.renderType === "magazine" || template?.category === "magazine";
  const pureImage = source === "upload" || (source === "post" && !isMagazine);

  // ---- 首屏 ----
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const db = await browserDb();
        const { data } = await db.auth.getSession();
        if (!alive) return;
        setSignedIn(Boolean(data.session));
        if (!data.session) { setLoading(false); return; }
        const response = await cloudFetch(`/api/v1/series/${seriesId}/cover`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "读取封面配置失败");
        const payload = result.data as CoverInfo;
        if (!alive) return;
        setInfo(payload);
        const current = payload.cover;
        setSource((current?.source as Source) || (current ? "template" : "auto"));
        setTemplateId(current?.templateId || payload.recommendedTemplateId || payload.templates[0]?.id || "");
        setTitle(current?.title || payload.series.title);
        setSubtitle(current?.subtitle || payload.series.subtitle);
        setPalette(current?.palette || "default");
        setCrop({
          focusX: Number(current?.crop?.focusX ?? 50),
          focusY: Number(current?.crop?.focusY ?? 50),
          zoom: Number(current?.crop?.zoom ?? 1),
        });
        setPostId(current?.sourcePostId || null);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "读取失败");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [seriesId]);

  // ---- 合集内作品图片 ----
  useEffect(() => {
    if (!info || source !== "post" || posts.length) return;
    void (async () => {
      try {
        const response = await cloudFetch(`/api/v1/series/${seriesId}/cover/posts`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "作品图片读取失败");
        const items = (result.data?.items || []) as PostImage[];
        setPosts(items);
        if (items.length && !postId) setPostId(items[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "作品图片读取失败");
      }
    })();
  }, [info, source, posts.length, postId, seriesId]);

  const selectedPost = useMemo(() => posts.find((item) => item.id === postId) || null, [posts, postId]);

  // ---- 预览：纯图走 canvas，模板走服务端 ----
  const refreshPreview = useCallback(async () => {
    const token = ++previewToken.current;
    setPreviewBusy(true);
    try {
      if (pureImage) {
        const candidate: Blob | string | null = uploadFile || (source === "post" ? selectedPost?.image || null : info?.cover?.source === "upload" ? info.cover.url || null : null);
        if (!candidate) { if (token === previewToken.current) setPreviewUrl(""); return; }
        const url = await renderPureImage(candidate, crop);
        if (token !== previewToken.current) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        setPreviewUrl(url);
        return;
      }
      const params = new URLSearchParams({
        template: templateId,
        title,
        subtitle,
        palette,
        variant: String(variant),
        use_image: isMagazine ? "1" : "0",
      });
      if (source === "post" && postId) params.set("post", postId);
      const response = await cloudFetch(`/api/v1/series/${seriesId}/cover/preview?${params.toString()}`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error((result as { error?: string }).error || "预览生成失败");
      }
      const blob = await response.blob();
      if (token !== previewToken.current) return;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(blob);
      setPreviewUrl(objectUrlRef.current);
    } catch (err) {
      if (token === previewToken.current) setError(err instanceof Error ? err.message : "预览生成失败");
    } finally {
      if (token === previewToken.current) setPreviewBusy(false);
    }
  }, [pureImage, uploadFile, selectedPost, crop, templateId, title, subtitle, palette, variant, isMagazine, source, postId, seriesId]);

  useEffect(() => {
    if (!info) return;
    const timer = window.setTimeout(() => void refreshPreview(), 320);
    return () => window.clearTimeout(timer);
  }, [info, refreshPreview]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const mark = () => setDirty(true);

  // ---- 上传 ----
  const pickFile = async (file: File | null) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("请选择 JPG、PNG 或 WebP 图片"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("图片不能超过 10 MB"); return; }
    setError("");
    setPreviewBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await cloudFetch(`/api/v1/series/${seriesId}/cover/upload`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "上传失败");
      if (uploadPath) void cloudFetch(`/api/v1/series/${seriesId}/cover/upload?path=${encodeURIComponent(uploadPath)}`, { method: "DELETE" }).catch(() => null);
      setUploadPath(result.data.path as string);
      setUploadFile(file);
      setSource("upload");
      setCrop({ focusX: 50, focusY: 50, zoom: 1 });
      mark();
      setNotice("图片已上传，调整取景后点保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setPreviewBusy(false);
    }
  };

  // ---- 保存 ----
  const save = async () => {
    if (!info) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (source === "auto") {
        const response = await cloudFetch(`/api/v1/series/${seriesId}/cover`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "生成失败");
      } else {
        if (source === "upload" && !uploadPath) throw new Error("请先选择一张图片");
        if (source === "post" && !postId) throw new Error("请先选择一篇有图作品");
        const body: Record<string, unknown> = {
          source,
          template_id: templateId || null,
          title: pureImage ? undefined : title,
          subtitle: pureImage ? undefined : subtitle,
          palette: palette === "default" ? null : palette,
          variant,
          crop,
        };
        if (source === "upload") body.upload_path = uploadPath;
        if (source === "post") body.source_post_id = postId;
        const response = await cloudFetch(`/api/v1/series/${seriesId}/cover`, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "保存失败");
      }
      setDirty(false);
      setNotice("封面已更新");
      // 通知原生容器刷新封面缓存（存在则调用，不存在也不报错）。
      const bridge = (window as unknown as { HeikaNative?: { coverUpdated?: (id: string) => void; close?: () => void } }).HeikaNative;
      try { bridge?.coverUpdated?.(seriesId); } catch { /* 桥接失败不影响保存结果 */ }
      window.dispatchEvent(new CustomEvent("heika-series-cover-updated", { detail: seriesId }));
      window.setTimeout(() => { window.history.back(); }, 420);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="sce-page"><div className="sce-loading"><Loader2 size={18} className="sce-spin" /> 正在读取封面配置…</div></div>;
  }
  if (signedIn === false) {
    // APP 内嵌打开时直接给登录门：登录成功原地 reload，URL 与合集 ID 都不变，
    // 不需要用户先退回网页首页再重新找一遍入口。
    const embedded = typeof window !== "undefined" && "HeikaNative" in window;
    if (embedded) {
      return <AppLoginGate title="登录后设置封面" hint={`登录后即可为「${info?.series.title || "该合集"}」使用官方模板、上传图片或提取作品图`} />;
    }
    return (
      <div className="sce-page">
        <div className="sce-loading">请先登录后再编辑合集封面。<Link className="sce-link" href="/">返回黑卡</Link></div>
      </div>
    );
  }
  if (error && !info) {
    return <div className="sce-page"><div className="sce-loading sce-error">{error}</div></div>;
  }
  if (!info) return null;
  if (!info.canEdit) {
    return <div className="sce-page"><div className="sce-loading">只有合集创建者可以修改封面。<Link className="sce-link" href="/">返回黑卡</Link></div></div>;
  }

  const grouped = CATEGORY_ORDER
    .map((category) => ({ category, items: info.templates.filter((item) => item.category === category && item.enabled) }))
    .filter((group) => group.items.length);

  return (
    <div className="sce-page">
      <header className="sce-head">
        <button type="button" className="sce-back" onClick={() => window.history.back()} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <div className="sce-title">
          <strong>封面设置</strong>
          <span>{info.series.title}</span>
        </div>
        <button type="button" className="sce-save" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 size={15} className="sce-spin" /> : <Check size={15} />}
          {saving ? "保存中" : "保存"}
        </button>
      </header>

      {error ? <p className="sce-banner is-error" role="alert">{error}</p> : null}
      {notice ? <p className="sce-banner" role="status">{notice}</p> : null}
      {dirty && !notice ? <p className="sce-banner is-muted" role="status">有未保存的修改</p> : null}

      <div className="sce-body">
        <div className="sce-preview">
          <div className="sce-canvas">
            {previewUrl ? <img src={previewUrl} alt="封面预览" width={600} height={800} /> : <div className="sce-canvas-empty">{previewBusy ? "正在生成预览…" : "暂无预览"}</div>}
            {previewBusy && previewUrl ? <span className="sce-canvas-busy" aria-hidden="true"><Loader2 size={14} className="sce-spin" /></span> : null}
          </div>
          <p className="sce-preview-meta">
            3:4 · 600×800 · {SOURCE_LABEL[source]}
            {info.cover ? ` · 已保存版本 v${info.cover.version}` : " · 尚未设置"}
          </p>
        </div>

        <div className="sce-config">
          <div className="sce-tabs" role="tablist" aria-label="封面来源">
            {(["auto", "template", "upload", "post"] as Source[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={source === key}
                className={source === key ? "is-active" : ""}
                onClick={() => { setSource(key); mark(); }}
              >
                {key === "auto" ? <Wand2 size={14} /> : key === "template" ? <LayoutTemplate size={14} /> : key === "upload" ? <Upload size={14} /> : <ImageIcon size={14} />}
                {SOURCE_LABEL[key]}
              </button>
            ))}
          </div>

          {source === "auto" ? (
            <section className="sce-panel">
              <p className="sce-hint">根据合集名称、简介与分类自动选择模板与配色，不消耗任何 AI 额度。</p>
              <div className="sce-row">
                <button type="button" className="sce-secondary" onClick={() => { setVariant((value) => value + 1); mark(); }}>
                  <Sparkles size={14} /> 换一种设计
                </button>
                <span className="sce-chip">{template?.name || "推荐模板"}</span>
              </div>
              <label className="sce-field">
                <span>主标题</span>
                <input value={title} maxLength={40} onChange={(event) => { setTitle(event.target.value); mark(); }} placeholder={info.series.title} />
              </label>
              <label className="sce-field">
                <span>副标题</span>
                <input value={subtitle} maxLength={60} onChange={(event) => { setSubtitle(event.target.value); mark(); }} placeholder={info.series.subtitle} />
              </label>
              <PaletteRow options={info.palettes} value={palette} onChange={(next) => { setPalette(next); mark(); }} />
            </section>
          ) : null}

          {source === "template" ? (
            <section className="sce-panel">
              {grouped.map((group) => (
                <div key={group.category} className="sce-group">
                  <h3>{group.items[0]?.categoryLabel || group.category}</h3>
                  <div className="sce-templates">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`sce-template${templateId === item.id ? " is-active" : ""}`}
                        onClick={() => { setTemplateId(item.id); mark(); }}
                      >
                        <span className={`sce-swatch sw-${item.category}`} aria-hidden="true" />
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <label className="sce-field">
                <span>主标题</span>
                <input value={title} maxLength={40} onChange={(event) => { setTitle(event.target.value); mark(); }} />
              </label>
              <label className="sce-field">
                <span>副标题</span>
                <input value={subtitle} maxLength={60} onChange={(event) => { setSubtitle(event.target.value); mark(); }} />
              </label>
              <PaletteRow options={info.palettes} value={palette} onChange={(next) => { setPalette(next); mark(); }} />
              <button type="button" className="sce-secondary" onClick={() => { setVariant((value) => value + 1); mark(); }}>
                <Sparkles size={14} /> 换一种图案
              </button>
            </section>
          ) : null}

          {source === "upload" ? (
            <section className="sce-panel">
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void pickFile(event.target.files?.[0] || null)} />
              <button type="button" className="sce-secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> {uploadPath ? "更换图片" : "选择图片"}
              </button>
              <p className="sce-hint">支持 JPG、PNG、WebP，建议 600×800 以上。上传后可用下方滑杆调整取景。</p>
              <CropControls crop={crop} onChange={(next) => { setCrop(next); mark(); }} disabled={!uploadPath} />
            </section>
          ) : null}

          {source === "post" ? (
            <section className="sce-panel">
              {posts.length ? (
                <div className="sce-posts">
                  {posts.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`sce-post${postId === item.id ? " is-active" : ""}`}
                      onClick={() => { setPostId(item.id); mark(); }}
                      title={item.title}
                    >
                      <img src={item.image} alt="" loading="lazy" decoding="async" />
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="sce-hint">这个合集还没有带图片的作品，可以改用其它来源。</p>
              )}
              {isMagazine ? (
                <>
                  <p className="sce-hint">当前模板为杂志风，会把作品图片与标题组合成封面。</p>
                  <label className="sce-field">
                    <span>主标题</span>
                    <input value={title} maxLength={40} onChange={(event) => { setTitle(event.target.value); mark(); }} />
                  </label>
                  <label className="sce-field">
                    <span>副标题</span>
                    <input value={subtitle} maxLength={60} onChange={(event) => { setSubtitle(event.target.value); mark(); }} />
                  </label>
                </>
              ) : (
                <CropControls crop={crop} onChange={(next) => { setCrop(next); mark(); }} disabled={!selectedPost} />
              )}
              <div className="sce-group">
                <h3>换用杂志风模板</h3>
                <div className="sce-templates">
                  {info.templates.filter((item) => item.renderType === "magazine" && item.enabled).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`sce-template${templateId === item.id ? " is-active" : ""}`}
                      onClick={() => { setTemplateId(item.id); mark(); }}
                    >
                      <span className="sce-swatch sw-magazine" aria-hidden="true" />
                      <span>{item.name}</span>
                    </button>
                  ))}
                  <button type="button" className={`sce-template${!isMagazine ? " is-active" : ""}`} onClick={() => { setTemplateId(info.recommendedTemplateId || info.templates[0]?.id || ""); mark(); }}>
                    <span className="sce-swatch sw-minimal" aria-hidden="true" />
                    <span>直接使用图片</span>
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {info.cover ? (
            <button
              type="button"
              className="sce-reset"
              onClick={async () => {
                setSaving(true);
                try {
                  const response = await cloudFetch(`/api/v1/series/${seriesId}/cover`, { method: "DELETE" });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error || "恢复失败");
                  setNotice("已恢复自动生成封面");
                  setSource("auto");
                  setDirty(false);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "恢复失败");
                } finally {
                  setSaving(false);
                }
              }}
            >
              恢复自动生成封面
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PaletteRow({ options, value, onChange }: { options: Palette[]; value: string; onChange: (next: string) => void }) {
  return (
    <div className="sce-palettes" role="group" aria-label="配色">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`sce-palette${value === option.key ? " is-active" : ""}`}
          onClick={() => onChange(option.key)}
          title={option.label}
          aria-label={option.label}
        >
          <i style={{ background: option.palette.bg }} />
          <i style={{ background: option.palette.accent }} />
          <i style={{ background: option.palette.ink }} />
        </button>
      ))}
    </div>
  );
}

function CropControls({ crop, onChange, disabled }: { crop: { focusX: number; focusY: number; zoom: number }; onChange: (next: { focusX: number; focusY: number; zoom: number }) => void; disabled?: boolean }) {
  return (
    <div className={`sce-crop${disabled ? " is-disabled" : ""}`}>
      <label>
        <span>左右位置</span>
        <input type="range" min={0} max={100} value={crop.focusX} disabled={disabled} onChange={(event) => onChange({ ...crop, focusX: Number(event.target.value) })} />
      </label>
      <label>
        <span>上下位置</span>
        <input type="range" min={0} max={100} value={crop.focusY} disabled={disabled} onChange={(event) => onChange({ ...crop, focusY: Number(event.target.value) })} />
      </label>
      <label>
        <span>缩放</span>
        <input type="range" min={100} max={220} value={Math.round(crop.zoom * 100)} disabled={disabled} onChange={(event) => onChange({ ...crop, zoom: Number(event.target.value) / 100 })} />
      </label>
    </div>
  );
}

/** 纯图预览：与保存时完全相同的取景几何，只是换成浏览器 canvas 执行。 */
async function renderPureImage(source: Blob | string, crop: { focusX: number; focusY: number; zoom: number }) {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob);
  const rect = cropRect(bitmap.width, bitmap.height, crop);
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持封面预览");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, rect.left, rect.top, rect.width, rect.height, 0, 0, 600, 800);
  bitmap.close();
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) { reject(new Error("封面预览生成失败")); return; }
      resolve(URL.createObjectURL(result));
    }, "image/png");
  });
}
