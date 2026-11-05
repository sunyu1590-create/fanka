import { NextRequest } from "next/server";
import {
  context,
  dbError,
  jsonBody,
  respond,
  ApiError,
  textField,
} from "@/lib/server/api";
import { libraryFields, presentMany, type LibraryRow } from "@/lib/server/library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateTopicNames } from "@/lib/topic-validation";
import { cardRarityTier } from "@/lib/progression";
async function replacePoll(db: SupabaseClient, postId: string, value: unknown) {
  if (value === undefined) return;
  const input = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const question = typeof input?.question === "string" ? input.question.trim() : "";
  const rawOptions = Array.isArray(input?.options) ? input.options : [];
  const options = [...new Set(rawOptions.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  const existing = await db.from("post_polls").select("id,question").eq("post_id", postId).maybeSingle();
  dbError(existing.error);
  if (!question && !options.length) {
    if (existing.data) {
      const current = await db.from("post_poll_options").select("vote_count").eq("poll_id", existing.data.id);
      dbError(current.error);
      if ((current.data || []).some((option) => option.vote_count > 0)) throw new ApiError(409, "投票已经开始，暂时不能移除");
      const removed = await db.from("post_polls").delete().eq("id", existing.data.id);
      dbError(removed.error);
    }
    return;
  }
  if (!question || question.length > 180 || options.length < 2 || options.length > 4 || options.some((option) => option.length > 80))
    throw new ApiError(400, "投票需要填写问题，并设置 2–4 个不重复选项");
  const current = existing.data ? await db.from("post_poll_options").select("id,label,position,vote_count").eq("poll_id", existing.data.id).order("position") : { data: [], error: null };
  dbError(current.error);
  const currentOptions = (current.data || []).map((option) => option.label);
  const same = existing.data?.question === question && currentOptions.length === options.length && currentOptions.every((option, index) => option === options[index]);
  if (same) return;
  if ((current.data || []).some((option) => option.vote_count > 0)) throw new ApiError(409, "投票已经开始，不能再更改选项");
  let pollId = existing.data?.id;
  if (existing.data) {
    const updated = await db.from("post_polls").update({ question }).eq("id", existing.data.id).select("id").single();
    dbError(updated.error);
    if (!updated.data) throw new ApiError(404, "投票不存在");
    pollId = updated.data.id;
    const cleared = await db.from("post_poll_options").delete().eq("poll_id", pollId);
    dbError(cleared.error);
  } else {
    const created = await db.from("post_polls").insert({ post_id: postId, question }).select("id").single();
    dbError(created.error);
    if (!created.data) throw new ApiError(500, "投票创建失败");
    pollId = created.data.id;
  }
  if (!pollId) throw new ApiError(500, "投票保存失败");
  const inserted = await db.from("post_poll_options").insert(options.map((label, position) => ({ poll_id: pollId, label, position })));
  dbError(inserted.error);
}
async function ensurePollEditable(db: SupabaseClient, postId: string, value: unknown) {
  if (value === undefined) return;
  const existing = await db.from("post_polls").select("id,question").eq("post_id", postId).maybeSingle();
  dbError(existing.error);
  if (!existing.data) return;
  const { data: current, error } = await db.from("post_poll_options").select("label,vote_count").eq("poll_id", existing.data.id).order("position");
  dbError(error);
  if (!(current || []).some((option) => option.vote_count > 0)) return;
  const input = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const question = typeof input?.question === "string" ? input.question.trim() : "";
  const rawOptions = Array.isArray(input?.options) ? input.options : [];
  const options = [...new Set(rawOptions.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  const same = question === existing.data.question && options.length === current?.length && options.every((option, index) => option === current?.[index]?.label);
  if (!same) throw new ApiError(409, "投票已经开始，不能再更改选项");
}
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
    const [profile, details, prefs, bookmarks, interactions, interests, own, revisions] =
      await Promise.all([
        db
          .from("profiles")
          .select("nickname,bio,avatar_url,role,membership_tier,show_bookmarks")
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
        db.from("post_revisions").select("post_id,payload,status,review_note").eq("author_id", user!.id),
      ]);
    for (const r of [profile, details, prefs, bookmarks, interactions, interests, own, revisions])
      dbError(r.error);
    const ownPosts = await presentMany(db, own.data as unknown as LibraryRow[]);
    const revisionRows = (revisions.data || []) as { post_id: string; payload: Record<string, unknown>; status: "pending" | "approved" | "rejected"; review_note: string | null }[];
    const revisionPaths = [...new Set(revisionRows.flatMap((revision) => Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.filter((path): path is string => typeof path === "string") : []))];
    const revisionSigned = revisionPaths.length ? await db.storage.from("post-covers").createSignedUrls(revisionPaths, 3600) : { data: [], error: null };
    dbError(revisionSigned.error);
    const revisionUrls = new Map((revisionSigned.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
    const revisionsByPost = new Map(revisionRows.map((revision) => [revision.post_id, {
      status: revision.status,
      reviewNote: revision.review_note,
      payload: { ...revision.payload, images: [
        ...(typeof revision.payload.coverUrl === "string" ? [revision.payload.coverUrl] : []),
        ...(Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.flatMap((path) => typeof path === "string" && revisionUrls.has(path) ? [revisionUrls.get(path)!] : []) : []),
      ] },
    }]));
    return {
      profile: profile.data,
      profileDetails: details.data,
      prefs: prefs.data,
      bookmarks: bookmarks.data,
      interactions: interactions.data,
      interests: interests.data,
      own: ownPosts.map((post) => ({ ...post, pendingRevision: post.cloudId ? revisionsByPost.get(post.cloudId) : undefined })),
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
        db.from("bookmark_collections").delete().eq("user_id", user!.id),
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
          show_bookmarks: false,
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
      const seriesId = typeof b.seriesId === "string" && b.seriesId ? b.seriesId : null;
      if (seriesId) {
        const owned = await db.from("post_series").select("id").eq("id", seriesId).eq("creator_id", user!.id).maybeSingle();
        dbError(owned.error);
        if (!owned.data) throw new ApiError(400, "请选择自己的作品系列");
      }
      const { data: existing, error: existingError } = await db.from("posts").select("id").eq("author_id", user!.id).eq("status", "draft").eq("is_demo", false).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      dbError(existingError);
      const values = { author_id: user!.id, tag_id: tag!.id, title, body, series_id: seriesId, status: "draft", image_url: typeof b.coverUrl === "string" ? (() => { try { const url = new URL(b.coverUrl); return ["https:", "http:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } })() : null, updated_at: new Date().toISOString() };
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
      await replacePoll(db, postId, b.poll);
      const refreshed = await db.from("posts").select(libraryFields).eq("id", postId).single();
      dbError(refreshed.error);
      return (await presentMany(db, [refreshed.data as unknown as LibraryRow]))[0];
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
      if (existingPost?.data) await ensurePollEditable(db, existingPost.data.id, b.poll);
      const seriesId = typeof b.seriesId === "string" && b.seriesId ? b.seriesId : null;
      if (seriesId) {
        const owned = await db.from("post_series").select("id").eq("id", seriesId).eq("creator_id", user!.id).maybeSingle();
        dbError(owned.error);
        if (!owned.data) throw new ApiError(400, "请选择自己的作品系列");
      }
      if (existingPost?.data?.status === "published") {
        const title = textField(b.title, "标题", 1, 80);
        const body = textField(b.body, "正文", 1, 5000);
        const { data: officialTopics, error: topicsError } = await db.from("interest_tags").select("name").eq("active", true);
        dbError(topicsError);
        const checkedTopics = validateTopicNames(b.topics, (officialTopics || []).map((topic) => topic.name));
        if (checkedTopics.error) throw new ApiError(400, checkedTopics.error);
        const pollInput = b.poll && typeof b.poll === "object" ? b.poll as Record<string, unknown> : null;
        let poll: { question: string; options: string[] } | null = null;
        if (pollInput) {
          const question = typeof pollInput.question === "string" ? pollInput.question.trim() : "";
          const options = Array.isArray(pollInput.options) ? [...new Set(pollInput.options.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
          if (!question || question.length > 180 || options.length < 2 || options.length > 4 || options.some((item) => item.length > 80)) throw new ApiError(400, "投票需要填写问题，并设置 2–4 个不重复选项");
          poll = { question, options };
        }
        const oldMedia = await db.from("post_media").select("storage_path").eq("post_id", existingPost.data.id).order("sort_order");
        dbError(oldMedia.error);
        const mediaPaths = Array.isArray(b.mediaPaths) ? [...new Set(b.mediaPaths.filter((path): path is string => typeof path === "string"))] : (oldMedia.data || []).map((item) => item.storage_path);
        if (mediaPaths.length > 9 || mediaPaths.some((path) => !path.startsWith(`${user!.id}/`) || path.length > 300)) throw new ApiError(400, "图片无效");
        if (mediaPaths.length) {
          const storedImages = await db.storage.from("post-covers").createSignedUrls(mediaPaths, 60);
          dbError(storedImages.error);
          if ((storedImages.data || []).length !== mediaPaths.length || storedImages.data?.some((item) => !item.signedUrl)) throw new ApiError(400, "有图片尚未同步完成，请重新上传后再提交");
        }
        let coverUrl: string | null = null;
        if (typeof b.coverUrl === "string") {
          try { const url = new URL(b.coverUrl); if (["https:", "http:"].includes(url.protocol)) coverUrl = url.toString(); }
          catch { throw new ApiError(400, "封面图片地址无效"); }
        }
        const payload = { title, body, tag: String(b.tag), topics: checkedTopics.names, seriesId, poll, mediaPaths, coverUrl };
        const revision = await db.from("post_revisions").upsert({
          post_id: existingPost.data.id, author_id: user!.id, payload, status: "pending", review_note: null,
          reviewed_at: null, reviewed_by: null, updated_at: new Date().toISOString(),
        }, { onConflict: "post_id" }).select("status,review_note").single();
        dbError(revision.error);
        if (!revision.data) throw new ApiError(500, "待审核修改未能保存");
        const current = await db.from("posts").select(libraryFields).eq("id", existingPost.data.id).single();
        dbError(current.error);
        const presented = (await presentMany(db, [current.data as unknown as LibraryRow]))[0];
        const signed = mediaPaths.length ? await db.storage.from("post-covers").createSignedUrls(mediaPaths, 3600) : { data: [], error: null };
        dbError(signed.error);
        const signedByPath = new Map((signed.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
        return { ...presented, pendingRevision: { status: revision.data.status, reviewNote: revision.data.review_note, payload: { ...payload, images: [...(coverUrl ? [coverUrl] : []), ...mediaPaths.flatMap((path) => signedByPath.has(path) ? [signedByPath.get(path)!] : [])] } } };
      }
      const values = {
        author_id: user!.id,
        tag_id: tag!.id,
        title: textField(b.title, "标题", 1, 80),
        body: textField(b.body, "正文", 1, 5000),
        series_id: seriesId,
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
      await replacePoll(db, postId, b.poll);
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
      return (await presentMany(db, [refreshed.data as unknown as LibraryRow]))[0];
    }
    let postQuery = db
      .from("posts")
      .select("id,author_id")
      .eq("client_id", Number(b.id));
    if (action === "delete") postQuery = postQuery.eq("author_id", user!.id);
    else postQuery = postQuery.eq("status", "published");
    const { data: post, error } = await postQuery.single();
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
    else if (action === "open") {
      fields.opened_at = new Date().toISOString();
      const { data: stats, error: statsError } = await db
        .from("post_rating_stats")
        .select("rating_count,rating_sum")
        .eq("post_id", post!.id)
        .maybeSingle();
      dbError(statsError);
      const count = stats?.rating_count || 0;
      fields.rarity_tier = cardRarityTier(count ? (stats!.rating_sum / count) : 0, count);
    }
    else if (action === "complete")
      fields.completed_at = new Date().toISOString();
    else if (action === "like") fields.liked = !!b.value;
    else if (action === "dismiss") fields.skipped_at = new Date().toISOString();
    else throw new ApiError(400, "操作无效");
    const { error: write } = await db.from("user_interactions").upsert(fields);
    dbError(write);
    if (action === "open" && post!.author_id !== user!.id) {
      const { data: experience, error: experienceError } = await db.rpc(
        "record_experience_event",
        { p_event_type: "flip", p_post_id: post!.id },
      );
      dbError(experienceError);
      return { saved: true, experience };
    }
    return { saved: true };
  });
}
