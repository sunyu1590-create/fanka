import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  ApiError,
  textField,
} from "@/lib/server/api";
import { libraryFields, present, type LibraryRow } from "@/lib/server/library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateTopicNames } from "@/lib/topic-validation";
async function replaceTopics(db: SupabaseClient, postId: string, value: unknown) {
  const { data: official, error: catalogError } = await db.from("interest_tags").select("name").eq("active", true);
  dbError(catalogError);
  const checked = validateTopicNames(value, (official || []).map((topic) => topic.name));
  if (checked.error) throw new ApiError(400, checked.error);
  const { data: topics, error } = checked.names.length
    ? await db.from("interest_tags").select("id,name").in("name", checked.names).eq("active", true)
    : { data: [], error: null };
  dbError(error);
  if ((topics || []).length !== checked.names.length) throw new ApiError(400, "话题无效");
  const result = await db.rpc("replace_post_topics", { p_post_id: postId, p_topic_ids: (topics || []).map((topic) => topic.id) });
  dbError(result.error);
}
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const [profile, details, prefs, bookmarks, interactions, interests, own] =
      await Promise.all([
        db
          .from("profiles")
          .select("nickname,bio,avatar_url,role")
          .eq("id", user!.id)
          .single(),
        db.from("profile_attributes").select("attribute,value,is_public").eq("user_id", user!.id),
        db
          .from("browsing_preferences")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle(),
        db.from("bookmarks").select("posts(client_id)").eq("user_id", user!.id),
        db
          .from("user_interactions")
          .select("*,posts(client_id)")
          .eq("user_id", user!.id),
        db
          .from("user_interests")
          .select("interest_tags(name)")
          .eq("user_id", user!.id),
        db.from("posts").select(libraryFields).eq("author_id", user!.id),
      ]);
    for (const r of [profile, details, prefs, bookmarks, interactions, interests, own])
      dbError(r.error);
    return {
      profile: profile.data,
      profileDetails: details.data,
      prefs: prefs.data,
      bookmarks: bookmarks.data,
      interactions: interactions.data,
      interests: interests.data,
      own: (own.data as unknown as LibraryRow[]).map(present),
    };
  });
}
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const b = await jsonBody(req);
    const action = b.action;
    if (action === "reset") {
      const results = await Promise.all([
        db.from("user_interests").delete().eq("user_id", user!.id),
        db.from("bookmarks").delete().eq("user_id", user!.id),
        db.from("user_interactions").delete().eq("user_id", user!.id),
        db.from("comment_reactions").delete().eq("user_id", user!.id),
        db.from("user_blocks").delete().eq("owner_id", user!.id),
        db.from("dm_reads").delete().eq("user_id", user!.id),
        db.from("browsing_preferences").delete().eq("user_id", user!.id),
        db.from("profile_attributes").delete().eq("user_id", user!.id),
      ]);
      for (const result of results) dbError(result.error);
      const { error } = await db
        .from("profiles")
        .update({
          nickname: "探索者",
          bio: "收藏那些值得再读的瞬间",
          avatar_url: null,
        })
        .eq("id", user!.id);
      dbError(error);
      return { reset: true };
    }
    if (action === "preferences") {
      const mode = b.homeMode,
        reading = b.readingMode;
      const count = Number(b.dailyCount);
      if (
        !["waterfall", "blackcard"].includes(String(mode)) ||
        !["standard", "focus", "night"].includes(String(reading)) ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 30
      )
        throw new ApiError(400, "偏好无效");
      const { error } = await db
        .from("browsing_preferences")
        .upsert({
          user_id: user!.id,
          home_mode: mode,
          daily_count: count,
          reading_mode: reading,
          notifications: b.notifications,
        });
      dbError(error);
      if (Array.isArray(b.interests)) {
        const { data: tags, error } = await db
          .from("interest_tags")
          .select("id")
          .in("name", b.interests);
        dbError(error);
        const { error: remove } = await db
          .from("user_interests")
          .delete()
          .eq("user_id", user!.id);
        dbError(remove);
        if (tags!.length) {
          const { error } = await db
            .from("user_interests")
            .insert(tags!.map((t) => ({ user_id: user!.id, tag_id: t.id })));
          dbError(error);
        }
      }
      return { saved: true };
    }
    if (action === "draft") {
      const title = typeof b.title === "string" ? b.title.trim() : "";
      const body = typeof b.body === "string" ? b.body.trim() : "";
      if (title.length > 80 || body.length > 5000) throw new ApiError(400, "标题或正文超过长度限制");
      const { data: tag, error: tagError } = await db.from("interest_tags").select("id").eq("name", String(b.tag || "生活")).single();
      dbError(tagError);
      const { data: existing, error: existingError } = await db.from("posts").select("id").eq("author_id", user!.id).eq("status", "draft").eq("is_demo", false).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      dbError(existingError);
      const values = { author_id: user!.id, tag_id: tag!.id, title, body, status: "draft", image_url: typeof b.coverUrl === "string" ? (() => { try { const url = new URL(b.coverUrl); return ["https:", "http:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } })() : null, updated_at: new Date().toISOString() };
      let result = existing
        ? await db.from("posts").update(values).eq("id", existing.id).eq("author_id", user!.id).select(libraryFields).single()
        : await db.from("posts").insert(values).select(libraryFields).single();
      if (result.error?.code === "23505") {
        const racedDraft = await db.from("posts").select("id").eq("author_id", user!.id).eq("status", "draft").eq("is_demo", false).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        dbError(racedDraft.error);
        if (racedDraft.data) result = await db.from("posts").update(values).eq("id", racedDraft.data.id).eq("author_id", user!.id).select(libraryFields).single();
      }
      dbError(result.error);
      const postId = (result.data as { id: string }).id;
      if (Array.isArray(b.topics)) await replaceTopics(db, postId, b.topics);
      const refreshed = await db.from("posts").select(libraryFields).eq("id", postId).single();
      dbError(refreshed.error);
      return present(refreshed.data as unknown as LibraryRow);
    }
    if (action === "publish") {
      const { data: tag, error: tagError } = await db
        .from("interest_tags")
        .select("id")
        .eq("name", String(b.tag))
        .single();
      dbError(tagError);
      const existingPost = b.id ? await db.from("posts").select("id,status").eq("client_id", Number(b.id)).eq("author_id", user!.id).single() : null;
      if (existingPost) dbError(existingPost.error);
      const values = {
        author_id: user!.id,
        tag_id: tag!.id,
        title: textField(b.title, "标题", 1, 80),
        body: textField(b.body, "正文", 1, 5000),
        status: existingPost?.data?.status === "draft" ? "draft" : "pending_review",
        image_url: typeof b.coverUrl === "string" ? (() => { try { const url = new URL(b.coverUrl); return ["https:", "http:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } })() : null,
      };
      const q = db.from("posts");
      const { data, error } = b.id
        ? await q
            .update(values)
            .eq("client_id", Number(b.id))
            .eq("author_id", user!.id)
            .select(libraryFields)
            .single()
        : await q.insert(values).select(libraryFields).single();
      dbError(error);
      const postId = (data as { id: string }).id;
      if (Array.isArray(b.topics)) await replaceTopics(db, postId, b.topics);
      if (Array.isArray(b.mediaPaths)) {
        const mediaPaths = [...new Set(b.mediaPaths.filter((path): path is string => typeof path === "string"))];
        if (mediaPaths.length > 9 || mediaPaths.some((path) => !path.startsWith(`${user!.id}/`) || path.length > 300))
          throw new ApiError(400, "图片无效");
        const { error: clearMedia } = await db.from("post_media").delete().eq("post_id", postId);
        dbError(clearMedia);
        if (mediaPaths.length) {
          const { error: insertMedia } = await db.from("post_media").insert(mediaPaths.map((storage_path, sort_order) => ({ post_id: postId, storage_path, sort_order })));
          dbError(insertMedia);
        }
      }
      const { error: publishError } = await db.from("posts").update({ status: "pending_review", updated_at: new Date().toISOString() }).eq("id", postId).eq("author_id", user!.id);
      dbError(publishError);
      const refreshed = await db.from("posts").select(libraryFields).eq("id", postId).single();
      dbError(refreshed.error);
      return present(refreshed.data as unknown as LibraryRow);
    }
    const { data: post, error } = await db
      .from("posts")
      .select("id")
      .eq("client_id", Number(b.id))
      .eq("author_id", user!.id)
      .single();
    dbError(error);
    if (action === "delete") {
      const media = await db.from("post_media").select("storage_path").eq("post_id", post!.id);
      dbError(media.error);
      if (media.data?.length) {
        const { error: storageError } = await db.storage.from("post-covers").remove(media.data.map((item) => item.storage_path));
        dbError(storageError);
      }
      const { error } = await db
        .from("posts")
        .delete()
        .eq("id", post!.id)
        .eq("author_id", user!.id);
      dbError(error);
      return { removed: true };
    }
    if (action === "bookmark") {
      const result = b.value
        ? await db
            .from("bookmarks")
            .upsert({ user_id: user!.id, post_id: post!.id })
        : await db
            .from("bookmarks")
            .delete()
            .eq("user_id", user!.id)
            .eq("post_id", post!.id);
      dbError(result.error);
      return { saved: !!b.value };
    }
    const fields: Record<string, unknown> = {
      user_id: user!.id,
      post_id: post!.id,
    };
    if (action === "view") fields.viewed_at = new Date().toISOString();
    else if (action === "open") fields.opened_at = new Date().toISOString();
    else if (action === "complete")
      fields.completed_at = new Date().toISOString();
    else if (action === "like") fields.liked = !!b.value;
    else if (action === "dismiss") fields.skipped_at = new Date().toISOString();
    else throw new ApiError(400, "操作无效");
    const { error: write } = await db.from("user_interactions").upsert(fields);
    dbError(write);
    return { saved: true };
  });
}
