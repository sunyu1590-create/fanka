import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  textField,
  ApiError,
} from "@/lib/server/api";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req, false);
    const clientId = Number(req.nextUrl.searchParams.get("id"));
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
    const limit = Math.max(1, Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 40));
    if (!Number.isSafeInteger(clientId) || clientId < 1) throw new ApiError(400, "内容编号无效");
    const { data: post, error } = await db
      .from("posts")
      .select("id")
      .eq("client_id", Number(req.nextUrl.searchParams.get("id")))
      .single();
    dbError(error);
    const { data, error: read, count } = await db
      .from("comments")
      .select("id,client_id,body,author_id,created_at,parent_id,comment_reactions(user_id)", { count: "exact" })
      .eq("post_id", post!.id)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    dbError(read);
    const rows = data || [];
    const authorIds = [...new Set(rows.map((row) => row.author_id))];
    const parentRows = new Map<string, { id: string; client_id: number; author_id: string; parent_id: string | null }>();
    let pendingParentIds = [...new Set(rows.flatMap((row) => row.parent_id ? [row.parent_id] : []))];
    for (let depth = 0; pendingParentIds.length && depth < 12; depth += 1) {
      const missingIds = pendingParentIds.filter((id) => !parentRows.has(id));
      if (!missingIds.length) break;
      const { data: parentRowsAtDepth, error: parentsError } = await db
        .from("comments")
        .select("id,client_id,author_id,parent_id")
        .in("id", missingIds);
      dbError(parentsError);
      for (const parent of parentRowsAtDepth || []) parentRows.set(parent.id, parent);
      pendingParentIds = (parentRowsAtDepth || []).flatMap((parent) => parent.parent_id ? [parent.parent_id] : []);
    }
    const profileIds = [...new Set([...authorIds, ...[...parentRows.values()].map((parent) => parent.author_id)])];
    const profilesResult = profileIds.length
      ? await db.from("profiles").select("id,nickname,avatar_url").in("id", profileIds)
      : { data: [], error: null };
    dbError(profilesResult.error);
    const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
    return {
      items: rows.map((c) => {
        const directParent = c.parent_id ? parentRows.get(c.parent_id) : undefined;
        let rootParent = directParent;
        const seenParents = new Set<string>();
        while (rootParent?.parent_id && !seenParents.has(rootParent.id)) {
          seenParents.add(rootParent.id);
          const nextParent = parentRows.get(rootParent.parent_id);
          if (!nextParent) break;
          rootParent = nextParent;
        }
        return {
          id: Number(c.client_id),
          cloudId: c.id,
          post: clientId,
          body: c.body,
          authorId: c.author_id,
          name: profiles.get(c.author_id)?.nickname?.trim() || "探索者",
          avatar: profiles.get(c.author_id)?.avatar_url || undefined,
          parent: c.parent_id ? Number(rootParent?.client_id || directParent?.client_id) : undefined,
          replyToName: directParent ? profiles.get(directParent.author_id)?.nickname?.trim() || "探索者" : undefined,
          time: new Date(c.created_at).getTime(),
          likes: c.comment_reactions.length,
          liked: !!user && c.comment_reactions.some((r: { user_id: string }) => r.user_id === user.id),
        };
      }),
      total: count || 0,
      offset,
      limit,
    };
  });
}
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const b = await jsonBody(req);
    const { data: post, error } = await db
      .from("posts")
      .select("id")
      .eq("client_id", Number(b.post))
      .single();
    dbError(error);
    if (b.action === "delete") {
      const { error } = await db
        .from("comments")
        .delete()
        .eq("client_id", Number(b.id))
        .eq("author_id", user!.id);
      dbError(error);
      return { removed: true };
    }
    if (b.action === "like") {
      const { data: comment, error } = await db
        .from("comments")
        .select("id")
        .eq("client_id", Number(b.id))
        .single();
      dbError(error);
      const values = {
        comment_id: comment!.id,
        user_id: user!.id,
        kind: "like",
      };
      const result = b.value
        ? await db.from("comment_reactions").upsert(values)
        : await db.from("comment_reactions").delete().match(values);
      dbError(result.error);
      return { saved: true };
    }
    let parent: string | null = null;
    let parentAuthorId: string | null = null;
    let parentRootClientId: number | undefined;
    if (b.parent) {
      const { data, error } = await db
        .from("comments")
        .select("id,client_id,author_id,parent_id")
        .eq("client_id", Number(b.parent))
        .eq("post_id", post!.id)
        .single();
      dbError(error);
      parent = data!.id;
      parentAuthorId = data!.author_id;
      let root = data!;
      let ancestorId = root.parent_id as string | null;
      const seen = new Set<string>([root.id]);
      for (let depth = 0; ancestorId && depth < 12 && !seen.has(ancestorId); depth += 1) {
        seen.add(ancestorId);
        const { data: ancestor, error: ancestorError } = await db
          .from("comments")
          .select("id,client_id,parent_id")
          .eq("id", ancestorId)
          .eq("post_id", post!.id)
          .maybeSingle();
        dbError(ancestorError);
        if (!ancestor) break;
        root = { ...root, id: ancestor.id, client_id: ancestor.client_id, parent_id: ancestor.parent_id };
        ancestorId = ancestor.parent_id;
      }
      parentRootClientId = Number(root.client_id);
    }
    const { data, error: write } = await db
      .from("comments")
      .insert({
        post_id: post!.id,
        author_id: user!.id,
        parent_id: parent,
        body: textField(b.body, "评论", 1, 1000),
      })
      .select("id,client_id,body,created_at")
      .single();
    dbError(write);
    if (!data) throw new ApiError(500, "评论未保存");
    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id,nickname,avatar_url")
      .in("id", [...new Set([user!.id, ...(parentAuthorId ? [parentAuthorId] : [])])]);
    dbError(profilesError);
    const profilesById = new Map((profiles || []).map((item) => [item.id, item]));
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
      parent: b.parent ? parentRootClientId || Number(b.parent) : undefined,
      replyToName: parentProfile?.nickname || undefined,
      time: new Date(data.created_at).getTime(),
      likes: 0,
    };
  });
}
