import { NextRequest } from "next/server";
import { ApiError, dbError, respond } from "@/lib/server/api";
import { requirePermission } from "@/lib/server/require-permission";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db } = await requirePermission(req, "reports.manage");
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "open";
    if (!["open", "in_progress", "resolved", "dismissed", "all"].includes(status)) throw new ApiError(400, "筛选状态无效");
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    const limit = Math.max(1, Math.min(30, Number(params.get("limit")) || 20));
    let query = db.from("user_feedback").select("id,user_id,category,message,status,review_note,attachment_path,handled_by,handled_at,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error, count } = await query.range((page - 1) * limit, page * limit - 1);
    dbError(error);
    const paths = (data || []).flatMap((item) => item.attachment_path ? [item.attachment_path] : []);
    const signed = paths.length ? await db.storage.from("user-feedback").createSignedUrls(paths, 3600) : { data: [], error: null };
    dbError(signed.error);
    const urls = new Map((signed.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
    return { items: (data || []).map((item) => ({ ...item, attachment_url: item.attachment_path ? urls.get(item.attachment_path) || null : null })), total: count || 0, page, limit };
  });
}
