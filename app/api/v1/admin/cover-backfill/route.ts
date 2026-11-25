import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin-client";
import { ApiError, jsonBody } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { loadSeriesSource, persistCover, suggestTemplateId, resolveTemplate } from "@/lib/server/series-cover-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BATCH = 6;
const MAX_BATCH = 12;

/**
 * 历史合集封面补齐。
 *
 * 采用「创建任务 + 每调用一次处理一批」的模型：
 * - 服务端不常驻长任务，不阻塞正常请求，也不会因为超时丢掉进度；
 * - 每次最多处理 12 个合集，CPU 只被占用很短一段时间；
 * - cursor 记录位置，中断后继续处理，重复执行会自动跳过已完成的部分。
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req);
    const [jobs, coverage] = await Promise.all([
      db.from("cover_backfill_jobs").select("*").order("created_at", { ascending: false }).limit(12),
      db.rpc("heika_series_cover_coverage"),
    ]);
    return NextResponse.json({ data: { jobs: jobs.data || [], coverage: coverage.data || null } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[cover-backfill:get]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "读取失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

type SeriesRow = { id: string; title: string; cover_url: string | null; created_at: string };

async function urlAlive(url: string | null | undefined) {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** 处理一批：无封面 → 生成；已有有效封面 → 跳过；封面失效 → 重新生成。 */
async function runBatch(jobId: string, limit: number) {
  const admin = adminClient();
  const { data: job, error: jobError } = await admin.from("cover_backfill_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobError) throw new ApiError(400, jobError.message);
  if (!job) throw new ApiError(404, "任务不存在");
  if (job.status === "done") return job;

  const startedAt = job.started_at || new Date().toISOString();
  await admin.from("cover_backfill_jobs").update({ status: "running", started_at: startedAt, updated_at: new Date().toISOString(), error: null }).eq("id", jobId);

  // 取下一批：按创建时间升序，从 cursor 之后继续。
  let query = admin.from("post_series").select("id,title,cover_url,created_at").order("created_at", { ascending: true }).limit(limit);
  if (job.cursor) query = query.gt("created_at", job.cursor);
  const { data: rows, error } = await query;
  if (error) throw new ApiError(400, error.message);

  let processed = Number(job.processed || 0);
  let succeeded = Number(job.succeeded || 0);
  let failed = Number(job.failed || 0);
  let skipped = Number(job.skipped || 0);
  let cursor: string | null = job.cursor;

  for (const row of (rows || []) as SeriesRow[]) {
    processed += 1;
    cursor = row.created_at;
    try {
      const { data: existing } = await admin.from("series_covers").select("series_id,storage_path,source").eq("series_id", row.id).maybeSingle();
      // 1) 已有独立封面资源：直接跳过，绝不覆盖用户已设置的结果。
      if (existing?.storage_path) {
        skipped += 1;
        continue;
      }
      // 2) 有历史封面且地址仍可访问：保留原图，只补一条记录便于后续追踪。
      if (row.cover_url && (await urlAlive(row.cover_url))) {
        await admin.from("series_covers").upsert({
          series_id: row.id,
          source: "upload",
          storage_path: null,
          generated_at: null,
          version: 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: "series_id" });
        skipped += 1;
        continue;
      }
      // 3) 无封面或已失效：按推荐模板生成。
      const series = await loadSeriesSource(admin, row.id);
      const template = await resolveTemplate(admin, suggestTemplateId(series));
      await persistCover(admin, admin, { seriesId: row.id, source: "auto", series, overrides: { templateId: template.id } });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.warn("[cover-backfill] failed", row.id, error instanceof Error ? error.message : "unknown");
    }
  }

  const done = !rows || rows.length < limit;
  const { data: updated } = await admin.from("cover_backfill_jobs").update({
    status: done ? "done" : "running",
    processed, succeeded, failed, skipped, cursor,
    finished_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId).select("*").single();

  return updated || job;
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const action = String(body.action || "start");
    const limit = Math.min(MAX_BATCH, Math.max(1, Math.round(Number(body.limit) || DEFAULT_BATCH)));
    const admin = adminClient();

    if (action === "start") {
      const { count: total } = await db.from("post_series").select("id", { count: "exact", head: true });
      const { data: job, error } = await admin.from("cover_backfill_jobs").insert({
        status: "running",
        total: total || 0,
        created_by: user!.id,
        started_at: new Date().toISOString(),
      }).select("*").single();
      if (error) throw new ApiError(400, error.message);
      const result = await runBatch(job.id, limit);
      return NextResponse.json({ data: { job: result, batch: limit } });
    }

    if (action === "step" || action === "resume" || action === "retry") {
      const jobId = String(body.job_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new ApiError(400, "任务编号无效");
      if (action === "retry") {
        // 重试只重置计数与游标，已经生成的封面不会被重复处理（跳过分支会接管）。
        await admin.from("cover_backfill_jobs").update({ status: "running", failed: 0, cursor: null, processed: 0, succeeded: 0, skipped: 0, finished_at: null, updated_at: new Date().toISOString() }).eq("id", jobId);
      }
      const result = await runBatch(jobId, limit);
      return NextResponse.json({ data: { job: result, batch: limit } });
    }

    if (action === "pause") {
      const jobId = String(body.job_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new ApiError(400, "任务编号无效");
      const { data } = await admin.from("cover_backfill_jobs").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
      return NextResponse.json({ data: { job: data } });
    }

    throw new ApiError(400, "未知操作");
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[cover-backfill:post]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "任务执行失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
