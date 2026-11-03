import { NextRequest } from "next/server";
import { ApiError, context, dbError, jsonBody, respond, textField, uuid } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin-client";

function inviteCode() { return crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(); }

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const code = textField(req.nextUrl.searchParams.get("code"), "邀请码", 6, 20).toUpperCase();
    const db = adminClient();
    const { data: room, error } = await db.from("co_explore_rooms").select("id,invite_code,host_id,guest_id,prompt,created_at,expires_at").eq("invite_code", code).maybeSingle();
    dbError(error);
    if (!room || new Date(room.expires_at).getTime() < Date.now()) throw new ApiError(404, "双人探索不存在或已过期");
    if (![room.host_id, room.guest_id, null].includes(user!.id)) throw new ApiError(403, "这个探索房间已被其他人加入");
    const { data: picks, error: pickError } = await db.from("co_explore_picks").select("user_id,post_id,note,created_at").eq("room_id", room.id);
    dbError(pickError);
    const ownPick = (picks || []).find((pick) => pick.user_id === user!.id) || null;
    const revealed = Boolean(room.guest_id && picks?.some((pick) => pick.user_id === room.host_id) && picks?.some((pick) => pick.user_id === room.guest_id));
    const visiblePicks = (revealed ? picks || [] : ownPick ? [ownPick] : []);
    const postIds = [...new Set(visiblePicks.map((pick) => pick.post_id))];
    const userIds = [...new Set(visiblePicks.map((pick) => pick.user_id))];
    const [posts, profiles] = await Promise.all([
      postIds.length ? db.from("posts").select("id,client_id,title,tag,body,images,cover_url").in("id", postIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? db.from("profiles").select("id,nickname,avatar_url").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    ]);
    dbError(posts.error); dbError(profiles.error);
    const postMap = new Map((posts.data || []).map((post) => [post.id, post]));
    const profileMap = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
    return { room, joined: room.guest_id === user!.id, isHost: room.host_id === user!.id, ownPick: Boolean(ownPick), revealed, picks: visiblePicks.map((pick) => ({ ...pick, post: postMap.get(pick.post_id) || null, profile: profileMap.get(pick.user_id) || null })) };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    const { user } = await context(req);
    const body = await jsonBody(req);
    const db = adminClient();
    if (body.action === "create") {
      const { data, error } = await db.from("co_explore_rooms").insert({ invite_code: inviteCode(), host_id: user!.id }).select("id,invite_code,host_id,guest_id,prompt,created_at,expires_at").single();
      dbError(error); return data;
    }
    const code = textField(body.code, "邀请码", 6, 20).toUpperCase();
    const { data: room, error } = await db.from("co_explore_rooms").select("id,invite_code,host_id,guest_id,expires_at").eq("invite_code", code).maybeSingle();
    dbError(error);
    if (!room || new Date(room.expires_at).getTime() < Date.now()) throw new ApiError(404, "双人探索不存在或已过期");
    if (body.action === "join") {
      if (room.host_id === user!.id) return { joined: true, host: true, roomId: room.id };
      if (room.guest_id && room.guest_id !== user!.id) throw new ApiError(409, "这个房间已经有另一位探索伙伴");
      if (!room.guest_id) {
        const { error: joinError } = await db.from("co_explore_rooms").update({ guest_id: user!.id }).eq("id", room.id).is("guest_id", null);
        dbError(joinError);
      }
      return { joined: true, host: false, roomId: room.id };
    }
    if (body.action === "pick") {
      if (room.host_id !== user!.id && room.guest_id !== user!.id) throw new ApiError(403, "请先加入这个探索房间");
      if (!room.guest_id) throw new ApiError(409, "等朋友加入后就可以一起探索了");
      const postId = uuid(body.postId, "内容");
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 180) : "";
      const { data: post, error: postError } = await db.from("posts").select("id").eq("id", postId).eq("status", "published").maybeSingle();
      dbError(postError); if (!post) throw new ApiError(404, "这篇内容暂时不可用");
      const { error: pickError } = await db.from("co_explore_picks").upsert({ room_id: room.id, user_id: user!.id, post_id: postId, note }, { onConflict: "room_id,user_id" });
      dbError(pickError); return { saved: true };
    }
    throw new ApiError(400, "双人探索操作无效");
  });
}
