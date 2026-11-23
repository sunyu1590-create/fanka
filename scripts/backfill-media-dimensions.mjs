#!/usr/bin/env node
/**
 * 回填 post_media 的原图像素尺寸。
 *
 * 详情页要在图片到达前就把容器高度定死，因此需要真实的宽高。
 * 2026-11 之前上传的图片只有 storage_path，没有 width/height，
 * 这里读回对象本体、用 sharp 取尺寸（按 EXIF 方向校正），再写回数据库。
 *
 * 用法:
 *   node scripts/backfill-media-dimensions.mjs --dry-run   # 只统计不写库
 *   node scripts/backfill-media-dimensions.mjs             # 实际回填
 *   node scripts/backfill-media-dimensions.mjs --limit 50  # 分批处理
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) || 500 : 5000;

/** 读取 .env.local（脚本在仓库根目录执行，Next.js 的变量都在这里）。 */
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!match) continue;
        const [, key, raw] = match;
        if (process.env[key]) continue;
        process.env[key] = raw.replace(/^["']|["']$/g, "");
      }
    } catch {
      /* 没有这个文件就跳过 */
    }
  }
}

loadEnv();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，无法回填。");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** 与 lib/server/media-thumbnails.ts 保持一致：5–8 表示需要交换宽高。 */
function orientedSize(meta) {
  const width = Number(meta.width) || 0;
  const height = Number(meta.height) || 0;
  if (!width || !height) return null;
  const orientation = Number(meta.orientation) || 1;
  return orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

async function main() {
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from("post_media")
      .select("id,storage_path,width,height")
      .is("width", null)
      .order("id", { ascending: true })
      .limit(Math.min(200, limit - scanned));
    if (error) throw new Error(`查询 post_media 失败: ${error.message}`);
    if (!rows?.length) break;

    for (const row of rows) {
      scanned += 1;
      const path = String(row.storage_path || "");
      if (!path) {
        skipped += 1;
        continue;
      }
      try {
        const { data: blob, error: downloadError } = await supabase.storage.from("post-covers").download(path);
        if (downloadError || !blob) throw new Error(downloadError?.message || "下载失败");
        const buffer = Buffer.from(await blob.arrayBuffer());
        const size = orientedSize(await sharp(buffer).metadata());
        if (!size) {
          skipped += 1;
          continue;
        }
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from("post_media")
            .update({ width: size.width, height: size.height })
            .eq("id", row.id);
          if (updateError) throw new Error(updateError.message);
        }
        updated += 1;
        if (updated % 25 === 0) console.log(`…已处理 ${updated} 条`);
      } catch (error) {
        failed += 1;
        console.warn(`跳过 ${path}: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (rows.length < 200 || scanned >= limit) break;
  }

  console.log(JSON.stringify({ dryRun, scanned, updated, skipped, failed }, null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
