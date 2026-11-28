import { NextRequest } from "next/server";
import { context, dbError, jsonBody, respond, textField, ApiError } from "@/lib/server/api";
import { requireFeature } from "@/lib/server/feature-flags";
import { requireAbility } from "@/lib/server/account-limits";

// Discussion 2.0：评论读写。新增字段全部可空，旧客户端请求格式继续可用。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOT_WINDOW = 100;
const MAX_ATTACHMENTS = 6;
const MAX_MENTIONS = 10;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

type Attachment = { path: string; width?: number; height?: number };
type ProfileRow = { id: string; nickname: string | null; avatar_url: string | null };
type CommentRow = {
  id: string;
  client_id: number;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  reply_to_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  edit_count: number | null;
  pinned: boolean | null;
  deleted_at: string | null;
  attachments: unknown;
  mention_ids: string[] | null;
  comment_reactions?: { user_id: string }[];
};

function attachmentsField(value: unknown): Attachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "图片附件格式无效");
  if (value.length > MAX_ATTACHMENTS) throw new ApiError(400, "最多附上 " + MAX_ATTACHMENTS + " 张图片");
  const list: Attachment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "图片附件格式无效");
    const item = raw as Record<string, unknown>;
    const path = typeof item.path === "string" ? item.path.trim() : "";
    if (!path || path.length > 300) throw new ApiError(400, "图片附件地址无效");
    if (/^[a-z]+:/i.test(path)) throw new ApiError(400, "图片附件地址无效");
    const width = Number(item.width);
    const height = Number(item.height);
    const entry: Attachment = { path };
    if (Number.isFinite(width) && width > 0) entry.width = Math.round(width);
    if (Number.isFinite(height) && height > 0) entry.height = Math.round(height);
    list.push(entry);
  }
  return list;
}

function mentionsField(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "提及格式无效");
  const ids: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !UUID_RE.test(raw)) continue;
    if (!ids.includes(raw)) ids.push(raw);
  }
  return ids.slice(0, MAX_MENTIONS);
}

function bodyField(value: unknown, hasMedia: boolean): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw && !hasMedia) throw new ApiError(400, "请输入评论内容");
  if (raw.length > 1000) throw new ApiError(400, "评论长度须为 1-1000");
  return raw;
}

function attachmentsOf(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Attachment => !!item && typeof item === "object" && typeof (item as Attachment).path === "string");
}

function serialize(
  row: CommentRow,
  profiles: Map<string, ProfileRow>,
  parents: Map<string, { client_id: number; author_id: string; deleted: boolean }>,
  viewer: string | null,
  postClientId: number,
) {
  const reactions = row.comment_reactions || [];
  const deleted = !!row.deleted_at;
  const directParent = row.reply_to_id ? parents.get(row.reply_to_id) : undefined;
  const rootParent = row.parent_id ? parents.get(row.parent_id) : undefined;
  const profile = profiles.get(row.author_id);
  return {
    id: Number(row.client_id),
    cloudId: row.id,
    post: postClientId,
    body: deleted ? "" : row.body,
    authorId: row.author_id,
    name: profile?.nickname?.trim() || "探索者",
    avatar: profile?.avatar_url || undefined,
    parent: rootParent ? Number(rootParent.client_id) : undefined,
    replyToName: directParent ? (profiles.get(directParent.author_id)?.nickname?.trim() || "探索者") : undefined,
    time: new Date(row.created_at).getTime(),
    likes: reactions.length,
    liked: !!viewer && reactions.some((reaction) => reaction.user_id === viewer),
    pinned: !!row.pinned,
    deleted,
    edited: !!row.edited_at,
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : undefined,
    attachments: deleted ? [] : attachmentsOf(row.attachments),
    mentions: deleted ? [] : row.mention_ids || [],
  };
}

export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const clientId = Number(req.nextUrl.searchParams.get("id"));
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
    const limit = Math.max(1, Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 40));
    const sort = req.nextUrl.searchParams.get("sort") === "hot" ? "hot" : "new";
    if (!Number.isSafeInteger(clientId) || clientId < 1) throw new ApiError(400, "内容编号无效");

    const { data: post, error: postError } = await db.from("posts").select("id").eq("client_id", clientId).single();
    dbError(postError);

    const fields = "id,client_id,post_id,author_id,parent_id,reply_to_id,body,created_at,edited_at,edit_count,pinned,deleted_at,attachments,mention_ids,comment_reactions(user_id)";

    const { data: pinnedRow, error: pinnedError } = await db
      .from("comments")
      .select(fields)
      .eq("post_id", post!.id)
      .eq("status", "visible")
      .eq("pinned", true)
      .limit(1)
      .maybeSingle();
    dbError(pinnedError);

    let query = db
      .from("comments")
      .select(fields)
      .eq("post_id", post!.id)
      .eq("status", "visible")
      .eq("pinned", false);

    if (sort === "hot") query = query.order("created_at", { ascending: false }).limit(HOT_WINDOW);
    else query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);

    const { data, error: readError } = await query;
    dbError(readError);

    const rows = (data || []) as unknown as CommentRow[];
    let items = rows;
    if (sort === "hot") {
      items = [...rows]
        .sort((a, b) => (b.comment_reactions || []).length - (a.comment_reactions || []).length
          || b.created_at.localeCompare(a.created_at)
          || a.id.localeCompare(b.id))
        .slice(offset, offset + limit);
    }

    const parentIds = [...new Set([
      ...items.flatMap((row) => (row.parent_id ? [row.parent_id] : [])),
      ...items.flatMap((row) => (row.reply_to_id ? [row.reply_to_id] : [])),
    ])];
    const parents = new Map<string, { client_id: number; author_id: string; deleted: boolean }>();
    const parentAuthorIds: string[] = [];
    if (parentIds.length) {
      const { data: parentRows, error: parentError } = await db
        .from("comments")
        .select("id,client_id,author_id,deleted_at")
        .in("id", parentIds);
      dbError(parentError);
      for (const parent of parentRows || []) {
        parents.set(parent.id, { client_id: Number(parent.client_id), author_id: parent.author_id, deleted: !!parent.deleted_at });
        parentAuthorIds.push(parent.author_id);
      }
    }

    const profileIds = [...new Set([...items.map((row) => row.author_id), ...parentAuthorIds])];
    const profiles = new Map<string, ProfileRow>();
    if (profileIds.length) {
      const { data: profileRows, error: profileError } = await db.from("profiles").select("id,nickname,avatar_url").in("id", profileIds);
      dbError(profileError);
      for (const profile of (profileRows || []) as ProfileRow[]) profiles.set(profile.id, profile);
    }

    const serialized = items.map((row) => serialize(row, profiles, parents, user?.id || null, clientId));
    const pinned = pinnedRow ? serialize(pinnedRow as unknown as CommentRow, profiles, parents, user?.id || null, clientId) : null;

    // 总数口径统一：所有 status=visible 的评论（含置顶与已删除占位）都计入，
    // 与列表实际渲染条数保持一致，避免详情页计数与列表对不上。
    const { count: totalCount, error: countError } = await db
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post!.id)
      .eq("status", "visible");
    dbError(countError);

    const total = totalCount || 0;
    return {
      items: pinned ? [pinned, ...serialized] : serialized,
      pinned,
      total,
      has_more: sort === "hot" ? offset + serialized.length < Math.min(total, HOT_WINDOW) : rows.length === limit,
      offset,
      limit,
      sort,
    };
  });
}

export async function POST(req: NextRequest) {
  return respond(async () => {
    await requireFeature("comment");
    const { db, user } = await context(req);
    const b = await jsonBody(req);

    const commentByClient = async (value: unknown) => {
      const numeric = Number(value);
      if (!Number.isSafeInteger(numeric) || numeric < 1) throw new ApiError(400, "评论编号无效");
      const { data, error } = await db
        .from("comments")
        .select("id,client_id,post_id,author_id,status,created_at,deleted_at,edit_count,pinned")
        .eq("client_id", numeric)
        .maybeSingle();
      dbError(error);
      if (!data) throw new ApiError(404, "评论不存在");
      return data;
    };

    if (b.action === "delete") {
      const target = await commentByClient(b.id);
      if (target.author_id !== user!.id) throw new ApiError(403, "只能删除自己的评论");
      if (target.deleted_at) return { removed: true, already: true };
      const now = new Date().toISOString();
      // 软删除：保留 id、时间与回复关系，正文清空，不级联任何子回复；
      // 同时取消置顶，避免已删除的占位评论继续占用唯一的置顶位。
      const { error: deleteError } = await db
        .from("comments")
        .update({ body: "", deleted_at: now, pinned: false, pinned_at: null })
        .eq("id", target.id)
        .eq("author_id", user!.id);
      dbError(deleteError);
      return { removed: true };
    }

    if (b.action === "like") {
      const target = await commentByClient(b.id);
      const values = { comment_id: target.id, user_id: user!.id, kind: "like" };
      const result = b.value
        ? await db.from("comment_reactions").upsert(values, { onConflict: "comment_id,user_id,kind" })
        : await db.from("comment_reactions").delete().match(values);
      dbError(result.error);
      const { count } = await db
        .from("comment_reactions")
        .select("user_id", { count: "exact", head: true })
        .eq("comment_id", target.id)
        .eq("kind", "like");
      return { saved: true, liked: !!b.value, likes: count || 0 };
    }

    if (b.action === "edit") {
      await requireAbility(user!.id, "comment");
      const target = await commentByClient(b.id);
      if (target.author_id !== user!.id) throw new ApiError(403, "只能编辑自己的评论");
      if (target.deleted_at) throw new ApiError(409, "评论已删除");
      if (Date.now() - new Date(target.created_at).getTime() > EDIT_WINDOW_MS) throw new ApiError(403, "超过可编辑时间");
      const body = textField(b.body, "评论", 1, 1000);
      const { data, error } = await db
        .from("comments")
        .update({ body, edited_at: new Date().toISOString(), edit_count: Number(target.edit_count || 0) + 1 })
        .eq("id", target.id)
        .eq("author_id", user!.id)
        .select("id,client_id,body,created_at,edited_at,edit_count")
        .single();
      dbError(error);
      return {
        id: Number(data!.client_id),
        cloudId: data!.id,
        body: data!.body,
        edited: true,
        editedAt: data!.edited_at ? new Date(data!.edited_at).getTime() : undefined,
      };
    }

    if (b.action === "pin") {
      const target = await commentByClient(b.id);
      const { data: post, error: postError } = await db.from("posts").select("id,author_id").eq("id", target.post_id).single();
      dbError(postError);
      const { data: adminFlag } = await db.rpc("is_admin");
      if (post!.author_id !== user!.id && !adminFlag) throw new ApiError(403, "只有作者可以置顶评论");
      const value = !!b.value;
      if (value) {
        const cleared = await db
          .from("comments")
          .update({ pinned: false, pinned_at: null })
          .eq("post_id", target.post_id)
          .eq("pinned", true)
          .neq("id", target.id);
        dbError(cleared.error);
      }
      const { error } = await db
        .from("comments")
        .update({ pinned: value, pinned_at: value ? new Date().toISOString() : null })
        .eq("id", target.id);
      dbError(error);
      return { pinned: value };
    }

    await requireAbility(user!.id, "comment");
    const { data: post, error: postError } = await db.from("posts").select("id").eq("client_id", Number(b.post)).single();
    dbError(postError);

    const attachments = attachmentsField(b.attachments);
    const mentions = mentionsField(b.mention_ids);
    const body = bodyField(b.body, attachments.length > 0);
    const nonce = typeof b.client_nonce === "string" && UUID_RE.test(b.client_nonce) ? b.client_nonce : null;

    // 幂等：同一 (作者, 幂等键) 只接受一次发送，重试复用同一条结果。
    if (nonce) {
      const { data: existing, error: existingError } = await db
        .from("comments")
        .select("id,client_id,body,created_at,parent_id,edited_at,deleted_at,attachments,mention_ids")
        .eq("author_id", user!.id)
        .eq("client_nonce", nonce)
        .maybeSingle();
      dbError(existingError);
      if (existing) {
        return {
          id: Number(existing.client_id),
          cloudId: existing.id,
          post: Number(b.post),
          body: existing.body,
          authorId: user!.id,
          time: new Date(existing.created_at).getTime(),
          likes: 0,
          liked: false,
          attachments: attachmentsOf(existing.attachments),
          mentions: existing.mention_ids || [],
          deduplicated: true,
        };
      }
    }

    let parent: string | null = null;
    let parentAuthorId: string | null = null;
    let replyTo: string | null = null;
    let rootClientId: number | undefined;
    if (b.parent) {
      const target = await commentByClient(b.parent);
      if (target.post_id !== post!.id || target.status !== "visible" || target.deleted_at) {
        throw new ApiError(400, "回复目标无效或已删除");
      }
      replyTo = target.id;
      parentAuthorId = target.author_id;
      // 扁平两级：任何后代都挂到同一个一级主评论下，不无限缩进。
      let cursor = { id: target.id, client_id: Number(target.client_id), parent_id: null as string | null };
      const { data: chain, error: chainError } = await db.from("comments").select("id,client_id,parent_id").eq("id", target.id).maybeSingle();
      dbError(chainError);
      if (chain) cursor = { id: chain.id, client_id: Number(chain.client_id), parent_id: chain.parent_id };
      const seen = new Set<string>([cursor.id]);
      let ancestorId = cursor.parent_id;
      for (let depth = 0; ancestorId && depth < 12 && !seen.has(ancestorId); depth += 1) {
        seen.add(ancestorId);
        const { data: ancestor, error: ancestorError } = await db.from("comments").select("id,client_id,parent_id").eq("id", ancestorId).maybeSingle();
        dbError(ancestorError);
        if (!ancestor) break;
        cursor = { id: ancestor.id, client_id: Number(ancestor.client_id), parent_id: ancestor.parent_id };
        ancestorId = ancestor.parent_id;
      }
      parent = cursor.id;
      rootClientId = cursor.client_id;
    }

    const { data, error: writeError } = await db
      .from("comments")
      .insert({
        post_id: post!.id,
        author_id: user!.id,
        parent_id: parent,
        reply_to_id: replyTo,
        body,
        attachments,
        mention_ids: mentions,
        client_nonce: nonce,
      })
      .select("id,client_id,body,created_at,attachments,mention_ids")
      .single();
    dbError(writeError);
    if (!data) throw new ApiError(500, "评论未保存");

    const profileIds = [...new Set([user!.id, ...(parentAuthorId ? [parentAuthorId] : [])])];
    const { data: profiles, error: profileError } = await db.from("profiles").select("id,nickname,avatar_url").in("id", profileIds);
    dbError(profileError);
    const profilesById = new Map((profiles || []).map((item) => [item.id, item as ProfileRow]));
    const authorProfile = profilesById.get(user!.id);
    const parentProfile = parentAuthorId ? profilesById.get(parentAuthorId) : undefined;

    return {
      id: Number(data.client_id),
      cloudId: data.id,
      post: Number(b.post),
      body: data.body,
      authorId: user!.id,
      name: authorProfile?.nickname || "探索者",
      avatar: authorProfile?.avatar_url || undefined,
      parent: rootClientId,
      replyToName: parentProfile?.nickname || undefined,
      time: new Date(data.created_at).getTime(),
      likes: 0,
      liked: false,
      pinned: false,
      deleted: false,
      edited: false,
      attachments,
      mentions,
    };
  });
}
