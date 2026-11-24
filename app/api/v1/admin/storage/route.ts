import { NextRequest } from "next/server";
import { respond, dbError, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export const runtime = "nodejs";

/**
 * 存储资源管理：
 * - GET  overview：各桶占用统计（真实 list 遍历，标注口径）
 * - POST action=scan：孤立资源扫描（只生成报告，不删除）
 */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const view = req.nextUrl.searchParams.get("view") || "overview";
    if (view !== "overview") throw new ApiError(400, "视图无效");

    const countBucket = async (bucket: string) => {
      let totalFiles = 0;
      let totalBytes = 0;
      let cursor = "";
      for (let page = 0; page < 20; page += 1) {
        const { data, error } = await db.storage.from(bucket).list(cursor, { limit: 1000 });
        if (error) return { bucket, error: error.message, files: totalFiles, bytes: totalBytes };
        const items = data || [];
        for (const item of items) {
          if (item.id) {
            totalFiles += 1;
            totalBytes += Number((item.metadata as { size?: number } | null)?.size ?? 0);
          }
        }
        if (items.length < 1000) break;
        const last = items[items.length - 1];
        if (!last?.name) break;
        cursor = cursor ? `${cursor}/${last.name}` : last.name;
      }
      return { bucket, files: totalFiles, bytes: totalBytes, error: null };
    };

    const [covers, attachments, videos, avatars, decor, assetCount, postMediaCount] = await Promise.all([
      countBucket("post-covers"),
      countBucket("post-attachments"),
      countBucket("post-videos"),
      countBucket("heika-avatars"),
      countBucket("heika-decor"),
      db.from("media_assets").select("id", { count: "exact", head: true }),
      db.from("post_media").select("id", { count: "exact", head: true }),
    ]);

    return {
      buckets: [covers, attachments, videos, avatars, decor],
      media_assets: assetCount.count ?? null,
      post_media_rows: postMediaCount.count ?? null,
      note: "统计口径：storage.list 遍历（每个桶最多 20 页 × 1000 项）；对象存储无固定容量上限，此处展示真实使用量而非虚构百分比。",
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "content.read");
    const body = await jsonBody(req);
    const action = String(body.action || "");
    if (action !== "scan") throw new ApiError(400, "操作无效");

    // 孤立资源扫描（安全只读）：列出未被 post_media / 已认领 media_assets 引用的 staging 资产，
    // 以及 post_media 中登记但 storage 对象缺失的行。默认只出报告，绝不自动删除。
    const [{ data: staleAssets, error: staleError }, { data: mediaRows, error: mediaError }] = await Promise.all([
      db.from("media_assets").select("id,storage_path,user_id,status,created_at,byte_size").is("post_id", null).neq("status", "claimed").order("created_at", { ascending: false }).limit(200),
      db.from("post_media").select("id,post_id,storage_path,thumbnail_path,retina_thumbnail_path").limit(500),
    ]);
    dbError(staleError);
    dbError(mediaError);

    const missing: { storage_path: string; post_id: string }[] = [];
    const byFolder = new Map<string, string[]>();
    for (const row of mediaRows || []) {
      const idx = row.storage_path.lastIndexOf("/");
      const folder = idx >= 0 ? row.storage_path.slice(0, idx) : "";
      const name = idx >= 0 ? row.storage_path.slice(idx + 1) : row.storage_path;
      byFolder.set(folder, [...(byFolder.get(folder) || []), name]);
    }
    for (const [folder, names] of byFolder) {
      const { data } = await db.storage.from("post-covers").list(folder, { limit: 1000 });
      const found = new Set((data || []).map((item) => item.name));
      for (const name of names) {
        if (!found.has(name)) {
          const row = (mediaRows || []).find((item) => item.storage_path === `${folder ? `${folder}/` : ""}${name}`);
          if (row) missing.push({ storage_path: row.storage_path, post_id: row.post_id });
        }
      }
    }

    return {
      unclaimed_staging_assets: (staleAssets || []).map((item) => ({
        id: item.id,
        storage_path: item.storage_path,
        status: item.status,
        created_at: item.created_at,
        byte_size: item.byte_size,
        age_days: Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86_400_000),
      })),
      missing_objects: missing,
      note: "扫描为只读报告：未认领 staging 资产建议保留 7 天宽限期（用户本地草稿可能仍引用）；缺失对象无法在服务端恢复源文件，需用户重新上传。批量删除前需人工确认，默认不执行任何删除。",
    };
  });
}
