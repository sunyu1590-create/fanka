"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Image as ImageIcon, Plus, RefreshCw,
  Trash2, Upload, Video, X,
} from "lucide-react";
import { cloudFetch, cloudRequest } from "@/lib/cloud";
import { userMessage } from "@/lib/user-message";
import { confirmInApp } from "@/lib/in-app-dialog";
import { Collapse, Empty, Group, Segmented, fmtNum, fmtPct } from "./AdminUIKit";

/**
 * 首页推荐位管理。
 *
 * 全部写入走后端接口：配置、内容、上传、预览、统计。
 * 页面不做乐观假数据——保存成功才更新本地状态，失败展示真实错误。
 */

type Settings = {
  enabled: boolean; autoplay: boolean; imageDurationMs: number; transitionMs: number;
  videoAutoplay: boolean; videoMuted: boolean; allowUnmute: boolean; dataSaverFallback: boolean; videoMaxMs: number;
  sizeMode: "ratio" | "fixed"; coverRatio: string;
  heights: { app: number; mobile: number; tablet: number; desktop: number };
  unifiedSize: boolean; fitMode: "cover" | "contain"; focus: "center" | "top" | "bottom";
  radius: number; showIndicator: boolean; invalidTargetPolicy: "media" | "filter";
  version: number; updatedAt: string;
};

type Banner = {
  id: string; name: string; alt: string; media_type: "image" | "video";
  image_path: string | null; video_path: string | null; poster_path: string | null;
  image_url: string | null; video_url: string | null; poster_url: string | null;
  width: number | null; height: number | null; video_duration_ms: number | null; display_ms: number | null;
  target_type: "none" | "post" | "series"; target_id: string | null;
  target_title: string | null; target_available: boolean;
  focus: "center" | "top" | "bottom"; sort_order: number; platforms: string[];
  enabled: boolean; status: "draft" | "published"; starts_at: string | null; ends_at: string | null;
  created_at: string; updated_at: string;
};

type Stats = {
  days: number;
  daily: Array<{ day: string; platform: string; impressions: number; clicks: number; impression_users: number; click_users: number; video_starts: number; video_completes: number }>;
  banners: Array<{ banner_id: string; name: string; media_type: string | null; impressions: number; clicks: number; impression_users: number; click_users: number; video_starts: number; video_completes: number; ctr: number | null; completion_rate: number | null; avg_watch_ms: number | null }>;
  totals: { impressions: number; clicks: number; video_starts: number; video_completes: number; ctr: number | null; completion_rate: number | null; avg_watch_ms: number | null };
  generated_at: string;
};

type Target = { id: string; type: "post" | "series"; title: string; author: string | null; cover: string | null; meta: string };
type PreviewDevice = "app" | "mobile" | "tablet" | "desktop";

const DEVICE_LABEL: Record<PreviewDevice, string> = { app: "APP", mobile: "手机网页", tablet: "平板网页", desktop: "电脑网页" };
const RATIOS = ["4:1", "3:1", "21:9", "16:9", "2:1", "custom"];

const emptyDraft = (): Partial<Banner> => ({
  name: "", alt: "", media_type: "image", target_type: "none", target_id: null,
  focus: "center", platforms: ["app", "web"], enabled: true, status: "draft",
  display_ms: null, starts_at: null, ends_at: null, sort_order: 0,
});

export default function AdminHomeBanners({ refreshKey = 0 }: { refreshKey?: number }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Partial<Banner> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  const [statDays, setStatDays] = useState(7);
  const [uploading, setUploading] = useState<"image" | "video" | "poster" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, listRes] = await Promise.all([
        cloudRequest("/api/v1/admin/home-banners/settings"),
        cloudRequest("/api/v1/admin/home-banners"),
      ]);
      setSettings(settingsRes as Settings);
      setBanners(((listRes as { items?: Banner[] })?.items || []) as Banner[]);
      setError("");
    } catch (err) {
      setError(userMessage(err, "推荐位读取失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const loadStats = useCallback(async (days: number) => {
    try {
      const result = await cloudRequest(`/api/v1/admin/home-banners/stats?days=${days}`);
      setStats(result as Stats);
    } catch (err) {
      setError(userMessage(err, "统计数据读取失败"));
    }
  }, []);

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    if (patch.heights) next.heights = { ...settings.heights, ...patch.heights };
    setSettings(next);
    setBusy(true);
    setError("");
    try {
      const body = {
        enabled: next.enabled, autoplay: next.autoplay, image_duration_ms: next.imageDurationMs,
        transition_ms: next.transitionMs, video_autoplay: next.videoAutoplay, video_muted: next.videoMuted,
        allow_unmute: next.allowUnmute, data_saver_fallback: next.dataSaverFallback, video_max_ms: next.videoMaxMs,
        size_mode: next.sizeMode, cover_ratio: next.coverRatio, app_height: next.heights.app,
        mobile_height: next.heights.mobile, tablet_height: next.heights.tablet, desktop_height: next.heights.desktop,
        unified_size: next.unifiedSize, fit_mode: next.fitMode, focus: next.focus, radius: next.radius,
        show_indicator: next.showIndicator, invalid_target_policy: next.invalidTargetPolicy,
      };
      const saved = await cloudRequest("/api/v1/admin/home-banners/settings", body, "PUT") as Settings;
      setSettings(saved);
      setNotice("配置已保存，客户端会在下次拉取配置时生效");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (err) {
      setError(userMessage(err, "配置保存失败"));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (file: File, kind: "image" | "video" | "poster") => {
    setUploading(kind);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind === "poster" ? "poster" : kind);
      if (kind === "video") {
        const meta = await readVideoMeta(file);
        form.append("duration_ms", String(Math.round(meta.duration * 1000)));
        form.append("width", String(meta.width));
        form.append("height", String(meta.height));
      }
      const response = await cloudFetch("/api/v1/admin/home-banners/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "上传失败");
      const data = result.data as { path: string; url: string; width: number | null; height: number | null; duration_ms: number | null; media_type: "image" | "video" };
      setDraft((current) => {
        if (!current) return current;
        if (kind === "poster") return { ...current, poster_path: data.path, poster_url: data.url };
        if (kind === "video") {
          return { ...current, media_type: "video", video_path: data.path, video_url: data.url, width: data.width, height: data.height, video_duration_ms: data.duration_ms };
        }
        return { ...current, media_type: "image", image_path: data.path, image_url: data.url, width: data.width, height: data.height };
      });
      // 视频上传后自动抽首帧做封面，省掉管理员再截一次图。
      if (kind === "video") {
        try {
          const poster = await extractPoster(file);
          if (poster) {
            const posterForm = new FormData();
            posterForm.append("file", poster, "poster.jpg");
            posterForm.append("kind", "poster");
            const posterResponse = await cloudFetch("/api/v1/admin/home-banners/upload", { method: "POST", body: posterForm });
            const posterResult = await posterResponse.json();
            if (posterResponse.ok) {
              setDraft((current) => current ? { ...current, poster_path: posterResult.data.path, poster_url: posterResult.data.url } : current);
            }
          }
        } catch { /* 抽帧失败不阻塞视频上传 */ }
      }
    } catch (err) {
      setError(userMessage(err, "上传失败"));
    } finally {
      setUploading(null);
    }
  };

  const save = async (publish: boolean) => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name: draft.name,
        alt: draft.alt,
        media_type: draft.media_type,
        image_path: draft.image_path ?? null,
        video_path: draft.video_path ?? null,
        poster_path: draft.poster_path ?? null,
        width: draft.width ?? null,
        height: draft.height ?? null,
        video_duration_ms: draft.video_duration_ms ?? null,
        display_ms: draft.display_ms ?? null,
        target_type: draft.target_type,
        target_id: draft.target_id ?? null,
        focus: draft.focus,
        platforms: draft.platforms,
        enabled: draft.enabled,
        status: publish ? "published" : "draft",
        starts_at: draft.starts_at ?? null,
        ends_at: draft.ends_at ?? null,
        sort_order: draft.sort_order ?? 0,
      };
      if (editingId) await cloudRequest(`/api/v1/admin/home-banners/${editingId}`, body, "PATCH");
      else await cloudRequest("/api/v1/admin/home-banners", body, "POST");
      setDraft(null);
      setEditingId(null);
      setNotice(publish ? "已发布" : "已保存草稿");
      window.setTimeout(() => setNotice(""), 2600);
      await load();
    } catch (err) {
      setError(userMessage(err, "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (banner: Banner, patch: Partial<Banner>) => {
    setBusy(true);
    try {
      await cloudRequest(`/api/v1/admin/home-banners/${banner.id}`, patch, "PATCH");
      await load();
    } catch (err) {
      setError(userMessage(err, "操作失败"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (banner: Banner) => {
    if (!(await confirmInApp(`确定删除「${banner.name}」？关联的媒体文件在没有其它推荐位引用时会被一并清理。`, { title: "删除推荐位", confirmLabel: "删除", danger: true }))) return;
    setBusy(true);
    try {
      await cloudRequest(`/api/v1/admin/home-banners/${banner.id}`, undefined, "DELETE");
      await load();
    } catch (err) {
      setError(userMessage(err, "删除失败"));
    } finally {
      setBusy(false);
    }
  };

  const reorder = async (from: number, to: number) => {
    if (to < 0 || to >= banners.length) return;
    const next = [...banners];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setBanners(next);
    setBusy(true);
    try {
      await Promise.all(next.map((banner, index) => cloudRequest(`/api/v1/admin/home-banners/${banner.id}`, { sort_order: (index + 1) * 10 }, "PATCH")));
    } catch (err) {
      setError(userMessage(err, "排序保存失败"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const previewItem = useMemo(() => banners.find((banner) => banner.enabled && banner.status === "published") || banners[0] || null, [banners]);
  const previewHeight = settings ? (settings.sizeMode === "fixed" ? settings.heights[device === "app" ? "app" : device] : 0) : 0;

  if (loading && !settings) return <p className="ab-empty-line">正在读取推荐位…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
      {error ? <p className="moderation-feedback error animated-notice" role="alert">{error}</p> : null}
      {notice ? <p className="moderation-feedback animated-notice" role="status">{notice}</p> : null}

      <Group>
        <div className="ab-row" style={{ alignItems: "center" }}>
          <span className="ab-row__body">
            <span className="ab-row__title">首页推荐位</span>
            <span className="ab-row__meta">
              {settings?.enabled ? "已开启" : "已关闭"} · 配置版本 v{settings?.version ?? 1} · {banners.length} 条内容
            </span>
          </span>
          <button
            type="button"
            className={`ab-switch${settings?.enabled ? " is-on" : ""}`}
            aria-pressed={settings?.enabled}
            aria-label="首页推荐位总开关"
            disabled={busy || !settings}
            onClick={() => void saveSettings({ enabled: !settings?.enabled })}
          ><i /></button>
        </div>
      </Group>

      <Collapse title="全局展示设置" hint="尺寸 · 播放 · 降级" defaultOpen={!banners.length}>
        {settings ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 2px 2px" }}>
            <div className="ab-kv-grid">
              <label className="ab-field">
                <span>自动轮播</span>
                <button type="button" className={`ab-switch${settings.autoplay ? " is-on" : ""}`} aria-pressed={settings.autoplay} onClick={() => void saveSettings({ autoplay: !settings.autoplay })}><i /></button>
              </label>
              <label className="ab-field">
                <span>指示器</span>
                <button type="button" className={`ab-switch${settings.showIndicator ? " is-on" : ""}`} aria-pressed={settings.showIndicator} onClick={() => void saveSettings({ showIndicator: !settings.showIndicator })}><i /></button>
              </label>
              <label className="ab-field">
                <span>视频自动播放</span>
                <button type="button" className={`ab-switch${settings.videoAutoplay ? " is-on" : ""}`} aria-pressed={settings.videoAutoplay} onClick={() => void saveSettings({ videoAutoplay: !settings.videoAutoplay })}><i /></button>
              </label>
              <label className="ab-field">
                <span>默认静音</span>
                <button type="button" className={`ab-switch${settings.videoMuted ? " is-on" : ""}`} aria-pressed={settings.videoMuted} onClick={() => void saveSettings({ videoMuted: !settings.videoMuted })}><i /></button>
              </label>
              <label className="ab-field">
                <span>允许取消静音</span>
                <button type="button" className={`ab-switch${settings.allowUnmute ? " is-on" : ""}`} aria-pressed={settings.allowUnmute} onClick={() => void saveSettings({ allowUnmute: !settings.allowUnmute })}><i /></button>
              </label>
              <label className="ab-field">
                <span>弱网/省流量降级</span>
                <button type="button" className={`ab-switch${settings.dataSaverFallback ? " is-on" : ""}`} aria-pressed={settings.dataSaverFallback} onClick={() => void saveSettings({ dataSaverFallback: !settings.dataSaverFallback })}><i /></button>
              </label>
            </div>

            <div className="ab-kv-grid">
              <label className="ab-field">
                <span>图片展示时长（秒）</span>
                <input type="number" min={1.5} max={20} step={0.5} defaultValue={settings.imageDurationMs / 1000}
                  onBlur={(event) => { const value = Number(event.target.value) * 1000; if (value && Math.round(value) !== settings.imageDurationMs) void saveSettings({ imageDurationMs: Math.round(value) }); }} />
              </label>
              <label className="ab-field">
                <span>切换动画（毫秒）</span>
                <input type="number" min={120} max={1500} step={10} defaultValue={settings.transitionMs}
                  onBlur={(event) => { const value = Number(event.target.value); if (value && Math.round(value) !== settings.transitionMs) void saveSettings({ transitionMs: Math.round(value) }); }} />
              </label>
              <label className="ab-field">
                <span>视频最长播放（秒）</span>
                <input type="number" min={3} max={120} step={1} defaultValue={Math.round(settings.videoMaxMs / 1000)}
                  onBlur={(event) => { const value = Number(event.target.value) * 1000; if (value && Math.round(value) !== settings.videoMaxMs) void saveSettings({ videoMaxMs: Math.round(value) }); }} />
              </label>
              <label className="ab-field">
                <span>圆角（px）</span>
                <input type="number" min={0} max={28} step={1} defaultValue={settings.radius}
                  onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && Math.round(value) !== settings.radius) void saveSettings({ radius: Math.round(value) }); }} />
              </label>
            </div>

            <div>
              <p className="ab-label" style={{ marginBottom: 6 }}>尺寸模式</p>
              <Segmented value={settings.sizeMode} ariaLabel="尺寸模式" onChange={(value) => void saveSettings({ sizeMode: value })}
                options={[{ value: "ratio" as const, label: "固定宽高比" }, { value: "fixed" as const, label: "自定义高度" }]} />
            </div>

            {settings.sizeMode === "ratio" ? (
              <div>
                <p className="ab-label" style={{ marginBottom: 6 }}>宽高比</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {RATIOS.map((ratio) => (
                    <button key={ratio} type="button" className={`ab-chip-btn${settings.coverRatio === ratio ? " is-active" : ""}`}
                      onClick={() => {
                        if (ratio === "custom") {
                          const value = window.prompt("输入自定义宽高比（宽:高），例如 2.5:1", settings.coverRatio.includes(":") ? settings.coverRatio : "2.5:1");
                          if (value) void saveSettings({ coverRatio: value.trim() });
                        } else void saveSettings({ coverRatio: ratio });
                      }}>{ratio === "custom" ? "自定义" : ratio}</button>
                  ))}
                </div>
                <p className="ab-label" style={{ marginTop: 6 }}>当前：{settings.coverRatio} · 高度随容器宽度自动计算</p>
              </div>
            ) : (
              <div className="ab-kv-grid">
                {(["app", "mobile", "tablet", "desktop"] as PreviewDevice[]).map((key) => (
                  <label className="ab-field" key={key}>
                    <span>{DEVICE_LABEL[key]}高度（{key === "app" ? "dp" : "px"}）</span>
                    <input type="number" min={80} max={key === "desktop" ? 360 : key === "tablet" ? 320 : 280} step={4} defaultValue={settings.heights[key]}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && Math.round(value) !== settings.heights[key]) void saveSettings({ heights: { ...settings.heights, [key]: Math.round(value) } });
                      }} />
                  </label>
                ))}
              </div>
            )}

            <div className="ab-kv-grid">
              <label className="ab-field">
                <span>媒体填充</span>
                <select value={settings.fitMode} onChange={(event) => void saveSettings({ fitMode: event.target.value as Settings["fitMode"] })}>
                  <option value="cover">cover · 填满裁切</option>
                  <option value="contain">contain · 完整显示</option>
                </select>
              </label>
              <label className="ab-field">
                <span>默认裁切焦点</span>
                <select value={settings.focus} onChange={(event) => void saveSettings({ focus: event.target.value as Settings["focus"] })}>
                  <option value="center">居中</option>
                  <option value="top">顶部</option>
                  <option value="bottom">底部</option>
                </select>
              </label>
              <label className="ab-field">
                <span>失效跳转处理</span>
                <select value={settings.invalidTargetPolicy} onChange={(event) => void saveSettings({ invalidTargetPolicy: event.target.value as Settings["invalidTargetPolicy"] })}>
                  <option value="media">降级为仅展示媒体</option>
                  <option value="filter">自动过滤该条</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}
      </Collapse>

      <Collapse title="轮播内容" count={banners.length} hint="图片与视频共用一个有序池">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ab-chip-btn is-active" onClick={() => { setDraft(emptyDraft()); setEditingId(null); }}>
              <Plus size={13} /> 新增内容
            </button>
            <button type="button" className="ab-chip-btn" disabled={busy} onClick={() => void load()}><RefreshCw size={13} /> 刷新</button>
          </div>

          {banners.length ? banners.map((banner, index) => (
            <div
              key={banner.id}
              className={`ab-banner-row${dragId === banner.id ? " is-dragging" : ""}`}
              draggable
              onDragStart={() => setDragId(banner.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (dragId && dragId !== banner.id) { const from = banners.findIndex((item) => item.id === dragId); void reorder(from, index); } setDragId(null); }}
            >
              <div className="ab-banner-thumb">
                {banner.media_type === "video" ? <Video size={15} /> : null}
                {(banner.poster_url || banner.image_url) ? <img src={(banner.poster_url || banner.image_url) as string} alt="" loading="lazy" /> : <ImageIcon size={15} />}
              </div>
              <div className="ab-banner-body">
                <strong>{banner.name}</strong>
                <small>
                  {banner.media_type === "video" ? `视频 · ${Math.round((banner.video_duration_ms || 0) / 1000)}s` : "图片"}
                  {" · "}{banner.platforms.map((platform) => platform === "app" ? "APP" : "网页").join("/")}
                  {" · "}{banner.status === "published" ? "已发布" : "草稿"}
                  {banner.target_type === "none" ? " · 不跳转" : ` · ${banner.target_type === "post" ? "作品" : "合集"}：${banner.target_title || "目标已失效"}`}
                </small>
                {!banner.target_available ? <em className="ab-banner-warn">跳转目标已失效，将按配置降级</em> : null}
              </div>
              <div className="ab-banner-actions">
                <button type="button" className="ab-iconbtn" aria-label="上移" disabled={index === 0 || busy} onClick={() => void reorder(index, index - 1)}><ArrowUp size={14} /></button>
                <button type="button" className="ab-iconbtn" aria-label="下移" disabled={index === banners.length - 1 || busy} onClick={() => void reorder(index, index + 1)}><ArrowDown size={14} /></button>
                <button type="button" className={`ab-chip-btn${banner.enabled ? " is-active" : ""}`} disabled={busy}
                  onClick={() => void toggle(banner, { enabled: !banner.enabled })}>{banner.enabled ? "已启用" : "已停用"}</button>
                <button type="button" className="ab-chip-btn" disabled={busy}
                  onClick={() => void toggle(banner, { status: banner.status === "published" ? "draft" : "published" })}>
                  {banner.status === "published" ? "转草稿" : "发布"}
                </button>
                <button type="button" className="ab-chip-btn" onClick={() => { setDraft({ ...banner }); setEditingId(banner.id); }}>编辑</button>
                <button type="button" className="ab-iconbtn danger" aria-label="删除" disabled={busy} onClick={() => void remove(banner)}><Trash2 size={14} /></button>
              </div>
            </div>
          )) : <Empty title="还没有轮播内容" hint="新增一条图片或视频后，首页会在额度下方自动展示" />}
        </div>
      </Collapse>

      {draft ? (
        <div className="ab-banner-editor">
          <div className="ab-banner-editor-head">
            <strong>{editingId ? "编辑轮播内容" : "新增轮播内容"}</strong>
            <button type="button" className="ab-iconbtn" aria-label="关闭" onClick={() => { setDraft(null); setEditingId(null); }}><X size={15} /></button>
          </div>

          <div className="ab-kv-grid">
            <label className="ab-field">
              <span>内部名称（仅后台可见）</span>
              <input value={draft.name || ""} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：双十一活动主图" />
            </label>
            <label className="ab-field">
              <span>无障碍描述</span>
              <input value={draft.alt || ""} maxLength={120} onChange={(event) => setDraft({ ...draft, alt: event.target.value })} placeholder="给读屏用户的一句话说明" />
            </label>
          </div>

          <div className="ab-banner-media">
            <div>
              <p className="ab-label">媒体类型</p>
              <Segmented value={draft.media_type || "image"} ariaLabel="媒体类型" onChange={(value) => setDraft({ ...draft, media_type: value })}
                options={[{ value: "image" as const, label: "图片" }, { value: "video" as const, label: "视频" }]} />
            </div>
            <label className="ab-upload-btn">
              <Upload size={14} /> {uploading ? "上传中…" : draft.media_type === "video" ? "上传视频（MP4）" : "上传图片"}
              <input type="file" hidden accept={draft.media_type === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file, draft.media_type === "video" ? "video" : "image"); event.currentTarget.value = ""; }} />
            </label>
            {draft.media_type === "video" ? (
              <label className="ab-upload-btn">
                <Upload size={14} /> 更换视频封面
                <input type="file" hidden accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file, "poster"); event.currentTarget.value = ""; }} />
              </label>
            ) : null}
          </div>

          {(draft.poster_url || draft.image_url || draft.video_url) ? (
            <div className="ab-banner-preview-mini">
              {draft.media_type === "video" && draft.video_url ? <video src={draft.video_url} poster={draft.poster_url || undefined} muted playsInline preload="metadata" /> : null}
              {draft.media_type === "image" && draft.image_url ? <img src={draft.image_url} alt="" /> : null}
              {draft.media_type === "video" && !draft.video_url ? <span className="ab-label">视频尚未上传</span> : null}
            </div>
          ) : null}

          <div className="ab-kv-grid">
            <label className="ab-field">
              <span>跳转类型</span>
              <select value={draft.target_type || "none"} onChange={(event) => setDraft({ ...draft, target_type: event.target.value as Banner["target_type"], target_id: null })}>
                <option value="none">不跳转，仅展示</option>
                <option value="post">作品详情</option>
                <option value="series">合集详情</option>
              </select>
            </label>
            {draft.target_type !== "none" ? (
              <div className="ab-field">
                <span>关联目标</span>
                <TargetPicker type={draft.target_type === "series" ? "series" : "post"} value={draft.target_id || null} title={draft.target_title || null} onChange={(target) => setDraft({ ...draft, target_id: target?.id || null, target_title: target?.title || null })} />
              </div>
            ) : null}
            <label className="ab-field">
              <span>展示平台</span>
              <div style={{ display: "flex", gap: 6 }}>
                {(["app", "web"] as const).map((platform) => {
                  const active = (draft.platforms || []).includes(platform);
                  return (
                    <button key={platform} type="button" className={`ab-chip-btn${active ? " is-active" : ""}`}
                      onClick={() => {
                        const current = new Set(draft.platforms || []);
                        if (active) current.delete(platform); else current.add(platform);
                        if (!current.size) return;
                        setDraft({ ...draft, platforms: [...current] });
                      }}>{platform === "app" ? "APP" : "网页"}</button>
                  );
                })}
              </div>
            </label>
            <label className="ab-field">
              <span>裁切焦点</span>
              <select value={draft.focus || "center"} onChange={(event) => setDraft({ ...draft, focus: event.target.value as Banner["focus"] })}>
                <option value="center">居中</option>
                <option value="top">顶部</option>
                <option value="bottom">底部</option>
              </select>
            </label>
            <label className="ab-field">
              <span>展示时长（秒，留空用全局）</span>
              <input type="number" min={1.5} max={60} step={0.5} value={draft.display_ms ? draft.display_ms / 1000 : ""}
                onChange={(event) => setDraft({ ...draft, display_ms: event.target.value ? Math.round(Number(event.target.value) * 1000) : null })} />
            </label>
            <label className="ab-field">
              <span>排序权重</span>
              <input type="number" min={0} max={9999} value={draft.sort_order ?? 0}
                onChange={(event) => setDraft({ ...draft, sort_order: Number(event.target.value) })} />
            </label>
            <label className="ab-field">
              <span>定时上线</span>
              <input type="datetime-local" value={toLocalInput(draft.starts_at)} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value ? new Date(event.target.value).toISOString() : null })} />
            </label>
            <label className="ab-field">
              <span>定时下架</span>
              <input type="datetime-local" value={toLocalInput(draft.ends_at)} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value ? new Date(event.target.value).toISOString() : null })} />
            </label>
            <label className="ab-field">
              <span>启用状态</span>
              <button type="button" className={`ab-switch${draft.enabled !== false ? " is-on" : ""}`} aria-pressed={draft.enabled !== false} onClick={() => setDraft({ ...draft, enabled: draft.enabled === false })}><i /></button>
            </label>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ab-primary-btn" disabled={busy} onClick={() => void save(true)}>{busy ? "保存中…" : "保存并发布"}</button>
            <button type="button" className="ab-chip-btn" disabled={busy} onClick={() => void save(false)}>保存草稿</button>
          </div>
        </div>
      ) : null}

      <Collapse title="多端预览" hint={DEVICE_LABEL[device]} defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Segmented value={device} ariaLabel="预览端" onChange={setDevice}
            options={(["app", "mobile", "tablet", "desktop"] as PreviewDevice[]).map((key) => ({ value: key, label: DEVICE_LABEL[key] }))} />
          {previewItem ? (
            <div className={`ab-device ab-device--${device}`}>
              <div
                className="ab-device-screen"
                style={{
                  height: settings?.sizeMode === "fixed" ? previewHeight : Math.round((device === "desktop" ? 720 : device === "tablet" ? 520 : 360) / ratioOf(settings?.coverRatio || "3:1")),
                  borderRadius: settings?.radius || 12,
                }}
              >
                <img src={(previewItem.poster_url || previewItem.image_url) as string} alt="" />
                {previewItem.media_type === "video" ? <span className="ab-device-badge">视频 · 静音自动播放</span> : null}
                {settings?.showIndicator && banners.length > 1 ? <span className="ab-device-dots" aria-hidden="true">{banners.map((banner) => <i key={banner.id} className={banner.id === previewItem.id ? "is-active" : ""} />)}</span> : null}
              </div>
              <p className="ab-label">
                {settings?.sizeMode === "fixed" ? `${previewHeight}${device === "app" ? "dp" : "px"}` : `按 ${settings?.coverRatio} 自适应`}
                {" · "}{settings?.fitMode === "contain" ? "完整显示" : "填满裁切"}
                {" · "}{settings?.showIndicator ? "显示指示器" : "隐藏指示器"}
              </p>
            </div>
          ) : <Empty title="暂无可预览的内容" hint="先新增一条并发布" />}
        </div>
      </Collapse>

      <Collapse title="运营数据" hint="真实曝光与点击" onOpen={() => { if (!stats) void loadStats(statDays); }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 7, 30].map((days) => (
              <button key={days} type="button" className={`ab-chip-btn${statDays === days ? " is-active" : ""}`}
                onClick={() => { setStatDays(days); void loadStats(days); }}>{days === 1 ? "今日" : `${days} 天`}</button>
            ))}
            <button type="button" className="ab-chip-btn" onClick={() => void loadStats(statDays)}><RefreshCw size={12} /> 刷新</button>
          </div>
          {stats ? (
            <>
              <div className="ab-stat-grid">
                <StatCell label="有效曝光" value={fmtNum(stats.totals.impressions)} hint="按会话去重后累加" />
                <StatCell label="点击次数" value={fmtNum(stats.totals.clicks)} />
                <StatCell label="点击率" value={stats.totals.ctr == null ? "—" : fmtPct(stats.totals.ctr * 100)} />
                <StatCell label="视频完播率" value={stats.totals.completion_rate == null ? "—" : fmtPct(stats.totals.completion_rate * 100)} hint={`${fmtNum(stats.totals.video_completes)}/${fmtNum(stats.totals.video_starts)}`} />
                <StatCell label="平均播放" value={stats.totals.avg_watch_ms ? `${(stats.totals.avg_watch_ms / 1000).toFixed(1)}s` : "—"} />
              </div>
              {stats.banners.length ? (
                <div className="ab-table">
                  <div className="ab-table-head"><span>内容</span><span>曝光</span><span>点击</span><span>点击率</span><span>完播</span></div>
                  {stats.banners.map((row) => (
                    <div className="ab-table-row" key={row.banner_id}>
                      <span title={row.name}>{row.name}{row.media_type === "video" ? " · 视频" : ""}</span>
                      <span>{fmtNum(row.impressions)}</span>
                      <span>{fmtNum(row.clicks)}</span>
                      <span>{row.ctr == null ? "—" : fmtPct(row.ctr * 100)}</span>
                      <span>{row.completion_rate == null ? "—" : fmtPct(row.completion_rate * 100)}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty title="该区间还没有产生数据" hint="内容上线并有人浏览后才会出现真实统计" />}
              <p className="ab-label">统计生成于 {new Date(stats.generated_at).toLocaleString("zh-CN")}</p>
            </>
          ) : <p className="ab-label">正在读取…</p>}
        </div>
      </Collapse>
    </div>
  );
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="ab-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function ratioOf(ratio: string) {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(ratio);
  if (!match) return 3;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : 3;
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** 目标搜索选择器：按标题/作者查，不要求管理员手填 UUID 或 URL。 */
function TargetPicker({ type, value, title, onChange }: { type: "post" | "series"; value: string | null; title: string | null; onChange: (target: Target | null) => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Target[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const search = async (keyword: string) => {
    setBusy(true);
    try {
      const result = await cloudRequest(`/api/v1/admin/home-banners/targets?type=${type}&q=${encodeURIComponent(keyword)}`) as { items: Target[] };
      setItems(result?.items || []);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void search(query), 260);
    return () => window.clearTimeout(timer);
  }, [query, open, type]);

  return (
    <div className="ab-target">
      <div className="ab-target-current">
        <span>{value ? title || "已选择" : "未选择"}</span>
        <button type="button" className="ab-chip-btn" onClick={() => setOpen((current) => !current)}>{open ? "收起" : "选择"}</button>
      </div>
      {open ? (
        <>
          <input value={query} placeholder={type === "post" ? "搜索作品标题" : "搜索合集标题"} onChange={(event) => setQuery(event.target.value)} />
          <div className="ab-target-list">
            {busy ? <p className="ab-label">搜索中…</p> : items.length ? items.map((item) => (
              <button key={item.id} type="button" className={`ab-target-item${value === item.id ? " is-active" : ""}`}
                onClick={() => { onChange(item); setOpen(false); }}>
                {item.cover ? <img src={item.cover} alt="" loading="lazy" /> : <span className="ab-target-fallback" />}
                <span><strong>{item.title}</strong><small>{item.meta}{item.author ? ` · ${item.author}` : ""}</small></span>
              </button>
            )) : <p className="ab-label">{query ? "没有匹配的内容" : "输入关键词开始搜索"}</p>}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** 读取视频元数据：时长与分辨率由浏览器解析，服务端只做容器校验。 */
function readVideoMeta(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const meta = { duration: video.duration || 0, width: video.videoWidth || 0, height: video.videoHeight || 0 };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("视频无法读取")); };
    video.src = url;
  });
}

/** 抽首帧：失败返回 null，不阻塞视频上传。 */
function extractPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.12, (video.duration || 1) / 8);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no ctx");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob); }, "image/jpeg", 0.86);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });
}
