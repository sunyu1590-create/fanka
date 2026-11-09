"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { confirmInApp } from "@/lib/in-app-dialog";

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
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!("caches" in window)) { setSupported(false); return; }
    try { setItems(await readCaches()); setError(""); }
    catch { setError("暂时无法读取缓存信息"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const clear = async () => {
    if (busy || !await confirmInApp("清理 HEIKA 离线页面与静态资源缓存？作品、草稿、收藏和登录状态不会被删除。", {title:"清理缓存",confirmLabel:"清理缓存",danger:true})) return;
    setBusy(true); setError("");
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(isHeikaWorkerCache).map((key) => caches.delete(key)));
      await refresh();
      onNotice("缓存已清理");
    } catch { setError("缓存清理失败，请重试"); }
    finally { setBusy(false); }
  };
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <div className="cache-manager">
    <div className="settings-module"><div className="settings-module-heading"><strong>HEIKA 离线与静态资源</strong></div>
      {!supported ? <p className="settings-note">此浏览器不支持 Cache Storage。</p> : error ? <p className="settings-note" role="status">{error}</p> : items.length ? <>
        <p className="settings-note">当前可读取 {total} 个缓存资源。</p>
        <ul className="cache-list">{items.map((item) => <li key={item.name}><span>{item.name}</span><small>{item.count} 项{item.bytes == null ? " · 大小无法准确读取" : ` · ${formatBytes(item.bytes)}`}</small></li>)}</ul>
      </> : <p className="settings-note">目前没有 HEIKA 离线缓存。</p>}
    </div>
    <p className="cache-safe-note">仅清理 Service Worker 保存的离线页面和静态文件，不会清除作品、草稿、收藏、账号偏好或登录凭据。</p>
    <button type="button" className="secondary-button cache-clear-button" disabled={!supported || busy || total === 0} onClick={() => void clear()}><Trash2 size={16}/>{busy ? "正在清理…" : "清理缓存"}</button>
  </div>;
}
