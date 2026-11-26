import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonBody } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/require-admin";
import { publicUrlFor, sanitizeBannerBody, assertVideoQuota } from "@/lib/server/home-banners";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req);
    const { data, error } = await db.from("home_banners").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (error) throw new ApiError(400, error.message);
    const admin = (await import("@/lib/server/admin-client")).adminClient();
    type AdminBannerRow = Record<string, unknown> & { target_type?: string; target_id?: string | null };
    const rows: AdminBannerRow[] = (data || []).map((row: Record<string, unknown>): AdminBannerRow => ({
      ...row,
      image_url: publicUrlFor(admin, row.image_path as string | null),
      video_url: publicUrlFor(admin, row.video_path as string | null),
      poster_url: publicUrlFor(admin, row.poster_path as string | null),
    }));

    // 目标标题：后台需要看到"这条轮播指向哪个作品/合集"，而不是一串 uuid。
    const postIds = rows.filter((row) => row.target_type === "post" && row.target_id).map((row) => String(row.target_id));
    const seriesIds = rows.filter((row) => row.target_type === "series" && row.target_id).map((row) => String(row.target_id));
    const [postRes, seriesRes] = await Promise.all([
      postIds.length ? db.from("posts").select("id,title,status").in("id", postIds) : Promise.resolve({ data: [] }),
      seriesIds.length ? db.from("post_series").select("id,title,review_status,is_public").in("id", seriesIds) : Promise.resolve({ data: [] }),
    ]);
    const postMap = new Map(((postRes.data || []) as { id: string; title: string; status: string }[]).map((row) => [row.id, row]));
    const seriesMap = new Map(((seriesRes.data || []) as { id: string; title: string; review_status: string; is_public: boolean }[]).map((row) => [row.id, row]));

    return NextResponse.json({
      data: {
        items: rows.map((row) => {
          if (row.target_type === "post") {
            const target = postMap.get(String(row.target_id));
            return { ...row, target_title: target?.title || null, target_available: target?.status === "published" };
          }
          if (row.target_type === "series") {
            const target = seriesMap.get(String(row.target_id));
            return { ...row, target_title: target?.title || null, target_available: Boolean(target && target.review_status === "approved" && target.is_public) };
          }
          return { ...row, target_title: null, target_available: true };
        }),
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-banners]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "读取失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireAdmin(req);
    const body = await jsonBody(req);
    const values = sanitizeBannerBody(body);
    if (values.media_type === "image" && !values.image_path) throw new ApiError(400, "请先上传轮播图片");
    if (values.media_type === "video" && !values.video_path) throw new ApiError(400, "请先上传轮播视频");
    await assertVideoQuota(db, {
      addingVideo: values.media_type === "video",
      live: values.status === "published" && values.enabled !== false,
    });
    const { data: maxRow } = await db.from("home_banners").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db.from("home_banners").insert({
      ...values,
      sort_order: values.sort_order ?? (Number(maxRow?.sort_order || 0) + 10),
      created_by: user.id,
      updated_by: user.id,
    }).select("*").single();
    if (error) throw new ApiError(400, error.message);
    return NextResponse.json({ data });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[admin-banners:create]", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "创建失败" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
