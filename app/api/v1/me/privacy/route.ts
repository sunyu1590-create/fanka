import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, uuid } from "@/lib/server/api";

/** Account-scoped privacy controls. All reads and writes use the caller's JWT client and RLS. */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const [profile, preference, blocks] = await Promise.all([
      db.from("profiles").select("show_bookmarks,notes_private").eq("id", user!.id).single(),
      db.from("browsing_preferences").select("dm_permission").eq("user_id", user!.id).maybeSingle(),
      db.from("user_blocks").select("blocked_id").eq("owner_id", user!.id),
    ]);
    dbError(profile.error); dbError(preference.error); dbError(blocks.error);
    if (!profile.data) throw new ApiError(404, "账号隐私资料不存在");
    const blockedIds = (blocks.data || []).map((row) => row.blocked_id);
    const blocked = blockedIds.length
      ? await db.from("profiles").select("id,nickname,avatar_url").in("id", blockedIds)
      : { data: [], error: null };
    dbError(blocked.error);
    return {
      show_bookmarks: profile.data.show_bookmarks === true,
      notes_private: profile.data.notes_private === true,
      dm_permission: preference.data?.dm_permission === "nobody" ? "nobody" : "everyone",
      blocked: blocked.data || [],
    };
  });
}

export async function PATCH(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const dmPermission = body.dm_permission;
    const updates: Record<string, unknown> = {};
    if (body.show_bookmarks !== undefined) {
      if (typeof body.show_bookmarks !== "boolean") throw new ApiError(400, "收藏可见设置无效");
      updates.show_bookmarks = body.show_bookmarks;
    }
    if (body.notes_private !== undefined) {
      if (typeof body.notes_private !== "boolean") throw new ApiError(400, "作品可见设置无效");
      updates.notes_private = body.notes_private;
    }
    if (dmPermission !== undefined && dmPermission !== "everyone" && dmPermission !== "nobody") throw new ApiError(400, "私信权限设置无效");
    if (!Object.keys(updates).length && dmPermission === undefined) throw new ApiError(400, "没有可更新的隐私设置");
    const results = await Promise.all([
      Object.keys(updates).length ? db.from("profiles").update(updates).eq("id", user!.id) : Promise.resolve({ error: null }),
      dmPermission !== undefined ? db.from("browsing_preferences").upsert({ user_id: user!.id, dm_permission: dmPermission }) : Promise.resolve({ error: null }),
    ]);
    results.forEach((result) => dbError(result.error));
    return { saved: true, ...updates, ...(dmPermission !== undefined ? { dm_permission: dmPermission } : {}) };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const body = await jsonBody(req);
    const blockedId = uuid(body.blocked_id, "用户");
    if (blockedId === user!.id) throw new ApiError(400, "不能屏蔽自己");
    const target = await db.from("profiles").select("id").eq("id", blockedId).maybeSingle();
    dbError(target.error);
    if (!target.data) throw new ApiError(404, "用户不存在");
    const result = await db.from("user_blocks").upsert({ owner_id: user!.id, blocked_id: blockedId }, { onConflict: "owner_id,blocked_id" });
    dbError(result.error);
    return { saved: true };
  });
}

export async function DELETE(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const blockedId = uuid(req.nextUrl.searchParams.get("blocked_id"), "用户");
    const result = await db.from("user_blocks").delete().eq("owner_id", user!.id).eq("blocked_id", blockedId).select("blocked_id").maybeSingle();
    dbError(result.error);
    return { removed: Boolean(result.data) };
  });
}
