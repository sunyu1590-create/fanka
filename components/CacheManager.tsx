"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { confirmInApp } from "@/lib/in-app-dialog";
import { bannerCacheStats, clearBannerMediaCache, forgetMemoryMedia, type BannerCacheStats } from "@/lib/home-banner-cache";

type CacheSummary = { name: string; count: number; bytes: number | null };
const isHeikaWorkerCache = (name: string) => name.startsWith("heika-shell-") || name.startsWith("heika-static-");
async function readCaches(): Promise<CacheSummary[]> {
  if (!("caches" in window)) return [];
  const names = (await caches.keys()).filter(isHeikaWorkerCache);
  return Promise.all(names.map(async (name) => {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    let bytes = 0;
    let known = true;
    for (const request of keys) {
      const response = await cache.match(request);
      if (!response || response.type === "opaque") { known = false; continue; }
      try { bytes += (await response.blob()).size; } catch { known = false; }
    }
    return { name, count: keys.length, bytes: known ? bytes : null };
  }));
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function CacheManager({ onNotice }: { onNotice: (message: string) => void }) {
  const [items, setItems] = useState<CacheSummary[]>([]);
  const [banner, setBanner] = useState<BannerCacheStats | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState<"shell" | "banner" | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [shell, bannerStats] = await Promise.all([
        "caches" in window ? readCaches() : Promise.resolve([] as CacheSummary[]),
        bannerCacheStats(),
      ]);
      if (!("caches" in window)) setSupported(false);
      else setItems(shell);
      setBanner(bannerStats);
      setError("");
    } catch {
      setError("暂时无法读取缓存信息");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const clearShell = async () => {
    if (busy || !await confirmInApp("清理 HEIKA 离线页面与静态资源缓存？作品、草稿、收藏和登录状态不会被删除。", { title: "清理缓存", confirmLabel: "清理缓存", danger: true })) return;
    setBusy("shell"); setError("");
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(isHeikaWorkerCache).map((key) => caches.delete(key)));
      await refresh();
      onNotice("离线页面缓存已清理");
    } catch { setError("缓存清理失败，请重试"); }
    finally { setBusy(null); }
  };

  const clearBanner = async () => {
    if (busy || !await confirmInApp("清理首页轮播的本地图片与视频缓存？下次进入首页会重新下载，账号与配置不受影响。", { title: "清理轮播缓存", confirmLabel: "清理", danger: true })) return;
    setBusy("banner"); setError("");
    try {
      forgetMemoryMedia();
      await clearBannerMediaCache();
      await refresh();
      onNotice("轮播媒体缓存已清理");
    } catch { setError("轮播缓存清理失败，请重试"); }
    finally { setBusy(null); }
  };

  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <div className="cache-manager">
    <div className="settings-module"><div className="settings-module-heading"><strong>HEIKA 离线与静态资源</strong></div>
      {!supported ? <p className="settings-note">此浏览器不支持 Cache Storage。</p> : error ? <p className="settings-note" role="status">{error}</p> : items.length ? <>
        <p className="settings-note">当前可读取 {total} 个缓存资源。</p>
        <ul className="cache-list">{items.map((item) => <li key={item.name}><span>{item.name}</span><small>{item.count} 项{item.bytes == null ? " · 大小无法准确读取" : ` · ${formatBytes(item.bytes)}`}</small></li>)}</ul>
      </> : <p className="settings-note">目前没有 HEIKA 离线缓存。</p>}
    </div>

    <div className="settings-module"><div className="settings-module-heading"><strong>首页轮播媒体</strong></div>
      {banner?.supported ? (
        banner.entries
          ? <>
              <p className="settings-note">已缓存 {banner.imageCount} 张图片（{formatBytes(banner.imageBytes)}）与 {banner.videoCount} 段视频（{formatBytes(banner.videoBytes)}），共 {formatBytes(banner.bytes)}。</p>
              {banner.quotaBytes ? <p className="settings-note">浏览器为本站分配约 {formatBytes(banner.quotaBytes)}，已用 {formatBytes(banner.usageBytes || 0)}。</p> : null}
            </>
          : <p className="settings-note">暂无本地轮播媒体缓存，进入首页后会自动按需缓存。</p>
      ) : <p className="settings-note">此浏览器不支持 IndexedDB，轮播将直接使用网络资源。</p>}
    </div>

    <p className="cache-safe-note">仅清理 Service Worker 保存的离线页面、静态文件与首页轮播媒体，不会清除作品、草稿、收藏、账号偏好或登录凭据。</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="secondary-button cache-clear-button" disabled={supported === false || busy !== null || total === 0} onClick={() => void clearShell()}>
        <Trash2 size={16} />{busy === "shell" ? "正在清理…" : "清理离线缓存"}
      </button>
      <button type="button" className="secondary-button cache-clear-button" disabled={busy !== null || !banner?.entries} onClick={() => void clearBanner()}>
        <Trash2 size={16} />{busy === "banner" ? "正在清理…" : "清理轮播媒体"}
      </button>
    </div>
  </div>;
}
