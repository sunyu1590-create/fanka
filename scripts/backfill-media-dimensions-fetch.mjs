#!/usr/bin/env node
/**
 * 回填 post_media 像素尺寸（容器内可直接运行版）。
 * 只依赖 sharp 与 fetch：查询缺 width/height 的行 → 经 storage API 取原图 →
 * sharp 读尺寸（EXIF 方向校正）→ PATCH 回写。不改动其他字段。
 *
 * 用法: node scripts/backfill-media-dimensions-fetch.mjs [--limit N] [--dry-run]
 */
import sharp from "sharp";

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIndex = args.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) || 200 : 200;

if (!SUPABASE_URL || !KEY) {
  console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`REST ${path} ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const rows = await rest(`post_media?select=id,storage_path,width,height&or=(width.is.null,height.is.null)&limit=${limit}`);
console.log(`待回填 ${rows.length} 行`);
let updated = 0;
let skipped = 0;
for (const row of rows) {
  try {
    const bucket = /\.(?:mp4|webm)$/i.test(row.storage_path) ? "post-videos" : "post-covers";
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${row.storage_path}`;
    const response = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!response.ok) { skipped += 1; continue; }
    const bytes = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    const orientation = meta.orientation ?? 1;
    const swapped = orientation >= 5 && orientation <= 8;
    const width = swapped ? meta.height : meta.width;
    const height = swapped ? meta.width : meta.height;
    if (!width || !height) { skipped += 1; continue; }
    if (!dryRun) await rest(`post_media?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ width, height }) });
    updated += 1;
    if (updated % 20 === 0) console.log(`已回填 ${updated}`);
  } catch (error) {
    skipped += 1;
    console.warn(`跳过 ${row.storage_path}:`, error instanceof Error ? error.message : error);
  }
}
console.log(`完成：回填 ${updated}，跳过 ${skipped}${dryRun ? "（dry-run 未写库）" : ""}`);
