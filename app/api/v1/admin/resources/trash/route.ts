import { NextRequest } from "next/server";
import { respond, ApiError, jsonBody } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";
import { requireReauth } from "@/lib/server/reauth";
import { adminClient } from "@/lib/server/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRASH_BUCKET = "resource-trash";
const RETENTION_DAYS = 7;

/** 系统关键资源不允许进入回收站（APK、Logo、默认头像、官方封面/轮播、备份）。 */
const PROTECTED = [
  /^heika-native-.*\.apk$/i,
  /^dl\//i,
  /logo/i,
  /default-avatar/i,
  /cover-templates?\//i,
  /banners?\//i,
  /backup/i,
  /^icon/i,
];

function isProtected(name: string) {
  return PROTECTED.some((pattern) => pattern.test(name));
}

async function ensureTrashBucket(admin: ReturnType<typeof adminClient>) {
  const { data } = await admin.storage.getBucket(TRASH_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(TRASH_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw new ApiError(500, "无法创建回收站存储桶");
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    await requirePermission(req, "resources.manage");
    const admin = adminClient();
    const { data, error } = await admin.from("resource_trash")
      .select("id,resource_kind,resource_key,display_name,size_bytes,deleted_at,purge_after,restored_at,meta")
      .order("deleted_at", { ascending: false })
      .limit(300);
    if (error) throw new ApiError(500, "回收站读取失败（请确认控制中心迁移已执行）");
    const active = (data || []).filter((row) => !row.restored_at);
    return {
      items: data || [],
      totals: {
        count: active.length,
        bytes: active.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0),
        expiring: active.filter((row) => new Date(row.purge_after).getTime() - Date.now() < 2 * 86_400_000).length,
      },
      retention_days: RETENTION_DAYS,
      note: "回收站只存放明确删除且无业务引用的对象；到期前需人工确认才会永久删除。",
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await requirePermission(req, "resources.manage");
    const body = await jsonBody(req);
    const action = String(body.action || "");
    if (action === "purge") requireReauth(req, user.id);
    const admin = adminClient();

    if (action === "trash") {
      const bucket = String(body.bucket || "");
      const name = String(body.name || "");
      if (!bucket || !name) throw new ApiError(400, "请指定资源");
      if (isProtected(name)) throw new ApiError(403, "该资源受系统保护，不能删除");
      const { data: detail } = await admin.rpc("heika_storage_detail", { p_bucket: bucket, p_name: name });
      const refCount = Number((detail as { ref_count?: number } | null)?.ref_count || 0);
      if (refCount > 0) throw new ApiError(409, `该资源仍被 ${refCount} 处引用，已阻止删除`);
      await ensureTrashBucket(admin);
      const id = crypto.randomUUID();
      const key = `${id}/${name.split("/").pop() || "file"}`;
      const { data: file, error: downloadError } = await admin.storage.from(bucket).download(name);
      if (downloadError || !file) throw new ApiError(500, "资源下载失败，原文件未改动");
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage.from(TRASH_BUCKET).upload(key, buffer, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw new ApiError(500, "写入回收站失败，原文件未改动");
      const { error: removeError } = await admin.storage.from(bucket).remove([name]);
      if (removeError) {
        await admin.storage.from(TRASH_BUCKET).remove([key]);
        throw new ApiError(500, "删除原文件失败，已回滚回收站副本");
      }
      const { error } = await admin.from("resource_trash").insert({
        resource_kind: String(body.kind || "file").slice(0, 40),
        resource_key: `${bucket}/${name}`,
        display_name: name.split("/").pop() || name,
        size_bytes: buffer.byteLength,
        meta: { bucket, name, trash_key: key, mime: file.type || null },
        deleted_by: user.id,
        purge_after: new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString(),
      });
      if (error) {
        // 数据库失败则恢复原文件，保证存储与记录一致。
        await admin.storage.from(bucket).upload(name, buffer, { upsert: true });
        await admin.storage.from(TRASH_BUCKET).remove([key]);
        throw new ApiError(500, "回收站记录写入失败，已恢复原文件");
      }
      await admin.from("admin_action_logs").insert({ actor_id: user.id, action: "resource_trash", target: `${bucket}/${name}`, detail: { bytes: buffer.byteLength } });
      return { trashed: true, key };
    }

    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "记录 ID 无效");
    const { data: row } = await admin.from("resource_trash").select("*").eq("id", id).maybeSingle();
    if (!row) throw new ApiError(404, "回收站记录不存在");
    const meta = row.meta as { bucket?: string; name?: string; trash_key?: string; mime?: string | null };

    if (action === "restore") {
      if (!meta.bucket || !meta.name || !meta.trash_key) throw new ApiError(400, "记录缺少存储信息");
      const { data: file, error: downloadError } = await admin.storage.from(TRASH_BUCKET).download(meta.trash_key);
      if (downloadError || !file) throw new ApiError(500, "回收站文件读取失败");
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage.from(meta.bucket).upload(meta.name, buffer, { upsert: true, contentType: meta.mime || undefined });
      if (uploadError) throw new ApiError(500, "恢复原路径失败");
      await admin.storage.from(TRASH_BUCKET).remove([meta.trash_key]);
      await admin.from("resource_trash").update({ restored_at: new Date().toISOString() }).eq("id", id);
      await admin.from("admin_action_logs").insert({ actor_id: user.id, action: "resource_restore", target: `${meta.bucket}/${meta.name}`, detail: {} });
      return { restored: true };
    }

    if (action === "purge") {
      // 永久删除前再次校验引用，避免恢复后又被业务使用的文件被误删。
      if (meta.bucket && meta.name) {
        const { data: detail } = await admin.rpc("heika_storage_detail", { p_bucket: meta.bucket, p_name: meta.name });
        if (Number((detail as { ref_count?: number } | null)?.ref_count || 0) > 0) throw new ApiError(409, "该路径已被重新引用，不能永久删除");
      }
      if (meta.trash_key) await admin.storage.from(TRASH_BUCKET).remove([meta.trash_key]);
      await admin.from("resource_trash").delete().eq("id", id);
      await admin.from("admin_action_logs").insert({ actor_id: user.id, action: "resource_purge", target: row.resource_key, detail: { bytes: row.size_bytes } });
      return { purged: true };
    }

    throw new ApiError(400, "未知操作");
  });
}
