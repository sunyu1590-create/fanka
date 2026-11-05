import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const [appeals, posts, comments, reports, restriction] = await Promise.all([
      db.from("moderation_appeals").select("id,target_type,target_id,target_title,reason,status,review_note,handled_at,created_at").eq("appellant_id", user!.id).order("created_at", { ascending: false }).limit(50),
      db.from("posts").select("id,title,moderation_review_note,channel").eq("author_id", user!.id).eq("status", "hidden").order("updated_at", { ascending: false }).limit(50),
      db.from("comments").select("id,body").eq("author_id", user!.id).eq("status", "hidden").order("created_at", { ascending: false }).limit(50),
      db.from("reports").select("id,reason,status").eq("reporter_id", user!.id).in("status", ["resolved", "dismissed"]).order("created_at", { ascending: false }).limit(50),
      db.from("community_restrictions").select("user_id,reason,restricted_until").eq("user_id", user!.id).eq("active", true).maybeSingle(),
    ]);
    dbError(appeals.error); dbError(posts.error); dbError(comments.error); dbError(reports.error); dbError(restriction.error);
    const targets = [
      ...(posts.data || []).map((item) => ({ type: "content", id: item.id, title: `作品：${item.title}`, reason: item.moderation_review_note || "作品被下架或驳回", channel: item.channel })),
      ...(comments.data || []).map((item) => ({ type: "comment", id: item.id, title: `评论：${String(item.body).slice(0, 48)}`, reason: "评论被隐藏" })),
      ...(reports.data || []).map((item) => ({ type: "report", id: item.id, title: "举报处理结果", reason: `${item.status === "resolved" ? "已处理" : "已驳回"} · ${item.reason}` })),
      ...(restriction.data ? [{ type: "account", id: user!.id, title: "账号发言限制", reason: `${restriction.data.reason}${restriction.data.restricted_until ? ` · 限制至 ${new Date(restriction.data.restricted_until).toLocaleString("zh-CN")}` : " · 永久限制"}` }] : []),
    ];
    return { items: appeals.data || [], targets };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const targetType = ["content", "comment", "report", "account"].includes(String(body.target_type)) ? String(body.target_type) : "";
    if (!targetType) throw new ApiError(400, "申诉对象无效");
    const targetId = targetType === "account" ? user!.id : uuid(body.target_id, "申诉对象");
    const reason = textField(body.reason, "申诉说明", 3, 1000);
    let targetTitle = "";
    if (targetType === "content") {
      const result = await db.from("posts").select("title").eq("id", targetId).eq("author_id", user!.id).eq("status", "hidden").maybeSingle(); dbError(result.error);
      if (!result.data) throw new ApiError(404, "找不到可申诉的已下架作品");
      targetTitle = `作品：${result.data.title}`;
    } else if (targetType === "comment") {
      const result = await db.from("comments").select("body").eq("id", targetId).eq("author_id", user!.id).eq("status", "hidden").maybeSingle(); dbError(result.error);
      if (!result.data) throw new ApiError(404, "找不到可申诉的已隐藏评论");
      targetTitle = `评论：${String(result.data.body).slice(0, 48)}`;
    } else if (targetType === "report") {
      const result = await db.from("reports").select("reason,status").eq("id", targetId).eq("reporter_id", user!.id).in("status", ["resolved", "dismissed"]).maybeSingle(); dbError(result.error);
      if (!result.data) throw new ApiError(404, "只有已处理的举报可以申诉");
      targetTitle = "举报处理结果";
    } else {
      const result = await db.from("community_restrictions").select("user_id").eq("user_id", user!.id).eq("active", true).maybeSingle(); dbError(result.error);
      if (!result.data) throw new ApiError(404, "当前账号没有有效的发言限制");
      targetTitle = "账号发言限制";
    }
    const { data, error } = await db.from("moderation_appeals").insert({ appellant_id: user!.id, target_type: targetType, target_id: targetId, target_title: targetTitle, reason }).select("id,target_type,target_id,target_title,reason,status,created_at").single();
    if (error?.code === "23505") throw new ApiError(409, "该事项已有待处理申诉");
    dbError(error);
    return data;
  });
}
