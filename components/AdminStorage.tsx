"use client";

/**
 * 存储资源：真实桶占用统计与只读孤立资源扫描。
 * 对象存储没有固定容量上限，因此只展示真实使用量，不编造容量百分比。
 */

import { useCallback, useEffect, useState } from "react";
import { HardDrive, Search } from "lucide-react";
import { cloudRequest } from "@/lib/cloud";
import { Empty, fmtBytes, fmtNum, fmtTime, Group } from "./admin/AdminUIKit";

type Bucket = { bucket: string; files: number; bytes: number; error: string | null };
type Overview = { buckets: Bucket[]; media_assets: number | null; post_media_rows: number | null; note: string };
type ScanReport = {
  unclaimed_staging_assets: Array<{ id: string; storage_path: string; status: string; created_at: string; byte_size: number | null; age_days: number }>;
  missing_objects: Array<{ storage_path: string; post_id: string }>;
  note: string;
};

const BUCKET_LABEL: Record<string, string> = {
  "post-covers": "作品图片",
  "post-attachments": "作品附件",
  "post-videos": "视频",
  "heika-avatars": "头像",
  "heika-decor": "装扮资源",
};

export default function AdminStorage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cloudRequest("/api/v1/admin/storage?view=overview") as Overview;
      setOverview(result);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "存储统计读取失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runScan = async () => {
    setScanning(true); setError("");
    try {
      const result = await cloudRequest("/api/v1/admin/storage", { action: "scan" }, "POST") as ScanReport;
      setScan(result);
    } catch (e) { setError(e instanceof Error ? e.message : "扫描失败"); }
    finally { setScanning(false); }
  };

  const totalBytes = overview?.buckets.reduce((sum, bucket) => sum + (bucket.bytes || 0), 0) || 0;
  const totalFiles = overview?.buckets.reduce((sum, bucket) => sum + (bucket.files || 0), 0) || 0;
  const maxBytes = Math.max(1, ...(overview?.buckets || []).map((bucket) => bucket.bytes || 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {loading ? <div className="ab-skel" style={{ height: 200, borderRadius: 18 }} /> : null}
      {error ? <p className="ab-sub" style={{ color: "var(--ab-coral)" }}>{error}</p> : null}
      {overview ? (
        <>
          <div className="ab-card">
            <div className="ab-card__head"><span className="ab-card__title">存储占用</span><span className="ab-card__badge">真实遍历</span></div>
            <div style={{ display: "flex", gap: 22, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div><b style={{ fontSize: 32, fontWeight: 720, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{fmtBytes(totalBytes)}</b><div className="ab-label">总占用</div></div>
              <div><b style={{ fontSize: 18, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtNum(totalFiles)}</b><div className="ab-label">对象总数</div></div>
              <div><b style={{ fontSize: 18, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtNum(overview.media_assets)}</b><div className="ab-label">媒体资产记录</div></div>
              <div><b style={{ fontSize: 18, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtNum(overview.post_media_rows)}</b><div className="ab-label">作品媒体关联</div></div>
            </div>
            <p className="ab-label" style={{ margin: 0 }}>{overview.note}</p>
          </div>

          <div>
            <div className="ab-section__head"><h2 className="ab-section__title">资源分类</h2></div>
            <Group>
              {overview.buckets.map((bucket) => (
                <div key={bucket.bucket} className="ab-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="ab-row__icon tone-blue"><HardDrive size={14} /></span>
                    <span className="ab-row__body">
                      <span className="ab-row__title">{BUCKET_LABEL[bucket.bucket] || bucket.bucket}</span>
                      <span className="ab-row__meta">{fmtNum(bucket.files)} 个对象{bucket.error ? ` · ${bucket.error}` : ""}</span>
                    </span>
                    <span className="ab-row__value"><b>{fmtBytes(bucket.bytes)}</b></span>
                  </div>
                  <div className="ab-bar tone-blue"><i style={{ width: `${Math.max(2, Math.round(((bucket.bytes || 0) / maxBytes) * 100))}%` }} /></div>
                </div>
              ))}
            </Group>
            <p className="ab-label" style={{ marginTop: 8, padding: "0 4px" }}>对象存储无固定容量上限，柱状长度按最大桶归一化，仅表达相对占用。</p>
          </div>

          <div className="ab-panel">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h3 className="ab-panel__title" style={{ margin: 0 }}>孤立资源扫描</h3>
              <button type="button" className="ab-chip info" style={{ border: 0, padding: "8px 12px" }} disabled={scanning} onClick={() => void runScan()}>
                <Search size={12} />{scanning ? "扫描中…" : "开始扫描"}
              </button>
            </div>
            {scan ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div className="ab-section__head" style={{ marginBottom: 6 }}><span className="ab-section__title" style={{ fontSize: 12 }}>未认领 staging 资产</span><span className="ab-section__meta">{scan.unclaimed_staging_assets.length} 条</span></div>
                  <Group plain>
                    {scan.unclaimed_staging_assets.slice(0, 8).map((asset) => (
                      <div key={asset.id} className="ab-row">
                        <span className="ab-row__body">
                          <span className="ab-row__title" style={{ fontSize: 12 }}>{asset.storage_path}</span>
                          <span className="ab-row__meta">{asset.status} · {fmtBytes(asset.byte_size)} · {asset.age_days} 天前 · {fmtTime(asset.created_at)}</span>
                        </span>
                      </div>
                    ))}
                    {!scan.unclaimed_staging_assets.length ? <Empty title="没有未认领资产" /> : null}
                  </Group>
                </div>
                <div>
                  <div className="ab-section__head" style={{ marginBottom: 6 }}><span className="ab-section__title" style={{ fontSize: 12 }}>登记但对象缺失</span><span className="ab-section__meta">{scan.missing_objects.length} 条</span></div>
                  <Group plain>
                    {scan.missing_objects.slice(0, 8).map((item) => (
                      <div key={item.storage_path} className="ab-row">
                        <span className="ab-row__body">
                          <span className="ab-row__title" style={{ fontSize: 12 }}>{item.storage_path}</span>
                          <span className="ab-row__meta">作品 {item.post_id.slice(0, 8)}</span>
                        </span>
                        <span className="ab-chip bad">缺失</span>
                      </div>
                    ))}
                    {!scan.missing_objects.length ? <Empty title="没有缺失对象" /> : null}
                  </Group>
                </div>
                <p className="ab-label" style={{ lineHeight: 1.7 }}>{scan.note}</p>
              </div>
            ) : <p className="ab-label" style={{ marginTop: 8 }}>扫描只生成报告，不会删除任何对象。</p>}
          </div>
        </>
      ) : null}
    </div>
  );
}
