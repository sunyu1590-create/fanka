import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { ApiError, context, jsonBody, respond, uuid } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";
import { recordSearchClick } from "@/lib/server/search";

export const dynamic = "force-dynamic";

const dayKey = () => new Date().toISOString().slice(0, 10);
const clampPercent = (value: unknown) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

/**
 * 客户端行为上报：有效阅读、读完、推荐曝光、搜索结果点击。
 * 只记录行为事实，不记录正文、复制文本或任何私人内容。
 */
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const body = await jsonBody(req);
    const type = String(body.type || "");
    const admin = adminClient();

    if (type === "read") {
      const postId = uuid(body.postId, "作品");
      const percent = clampPercent(body.percent);
      const seconds = Math.max(0, Math.min(7200, Math.round(Number(body.seconds) || 0)));
      const { data: post } = await db.from("posts").select("id,status,series_id,author_id").eq("id", postId).maybeSingle();
      if (!post || (post as { status: string }).status !== "published") throw new ApiError(404, "内容不存在");
      // 点开即走不算有效阅读：需要阅读深度或停留时间达标。
      if (percent < 25 && seconds < 8) return { recorded: false, reason: "not_enough_reading" };

      const anonymous = user ? null : createHash("sha256")
        .update(`${req.headers.get("x-forwarded-for") || ""}|${req.headers.get("user-agent") || ""}`)
        .digest("hex").slice(0, 16);
      const reader = user?.id || `anon-${anonymous}`;
      const seriesId = typeof body.seriesId === "string" ? body.seriesId : (post as { series_id: string | null }).series_id;

      await admin.from("content_events").upsert({
        entity_type: "post", entity_id: postId, user_id: user?.id || null, kind: "read",
        surface: String(body.surface || "web").slice(0, 20), occurred_at: new Date().toISOString(),
        dedupe_key: `read:${postId}:${reader}:${dayKey()}`,
      }, { onConflict: "dedupe_key", ignoreDuplicates: true });

      if (percent >= 90) {
        await admin.from("content_events").upsert({
          entity_type: "post", entity_id: postId, user_id: user?.id || null, kind: "complete",
          surface: String(body.surface || "web").slice(0, 20), occurred_at: new Date().toISOString(),
          dedupe_key: `complete:${postId}:${reader}`,
        }, { onConflict: "dedupe_key", ignoreDuplicates: true });
      }

      if (seriesId) {
        await admin.from("content_events").upsert({
          entity_type: "series", entity_id: seriesId, user_id: user?.id || null, kind: "read",
          surface: String(body.surface || "web").slice(0, 20), occurred_at: new Date().toISOString(),
          dedupe_key: `series-read:${seriesId}:${reader}:${dayKey()}`,
        }, { onConflict: "dedupe_key", ignoreDuplicates: true });

        if (user && percent >= 60) {
          const writeItem = () => db.from("collection_read_items").upsert({
            user_id: user.id, series_id: seriesId, post_id: postId,
            progress: percent, dwell_seconds: seconds, read_at: new Date().toISOString(),
          }, { onConflict: "user_id,post_id" });
          let { error } = await writeItem();
          if (error?.code === "23503") {
            // 极端情况下 profiles 缺行（Auth 侧新建用户、历史数据），外键会拒绝写入。
            // 补建一次档案再重试，避免用户的阅读进度永远停在 0。
            await admin.from("profiles").upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
            ({ error } = await writeItem());
          }
          if (error) {
            // 不能静默：写失败时前端会以为已记录，进度条却不动。
            console.error("[events] collection_read_items write failed", error.code, error.message);
            return { recorded: true, counted: true, readSaved: false };
          }
          const { error: progressError } = await db.rpc("record_collection_progress", { p_series_id: seriesId, p_post_id: postId });
          if (progressError) console.error("[events] record_collection_progress failed", progressError.message);
        }
      }
      return { recorded: true, counted: percent >= 25 || seconds >= 8, readSaved: true };
    }

    if (type === "impression") {
      const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
      const rows = items.flatMap((raw) => {
        const item = raw as { type?: string; id?: string };
        if ((item.type !== "post" && item.type !== "series") || typeof item.id !== "string") return [];
        if (!/^[0-9a-f-]{36}$/i.test(item.id)) return [];
        return [{
          entity_type: item.type, entity_id: item.id, user_id: user?.id || null,
          surface: String(body.surface || "web").slice(0, 30), pool: String(body.pool || "").slice(0, 20) || null,
        }];
      });
      if (rows.length) await admin.from("content_impressions").insert(rows);
      return { recorded: rows.length };
    }

    if (type === "search_click") {
      await recordSearchClick(String(body.term || ""), String(body.entityType || "post"),
        typeof body.entityId === "string" && /^[0-9a-f-]{36}$/i.test(body.entityId) ? body.entityId : null,
        user?.id || null);
      return { recorded: true };
    }

    throw new ApiError(400, "不支持的行为类型");
  });
}
