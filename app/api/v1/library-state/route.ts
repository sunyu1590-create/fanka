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
import { splitPostMediaPaths } from "@/lib/media-path";
import { signPostMedia } from "@/lib/server/media";
const mediaVariants = (path: string) => {
  const match = path.match(/^(.*\/)([^/]+)\.(?:jpg|png|webp)$/i);
  return match ? [`${match[1]}${match[2]}-480.webp`, `${match[1]}${match[2]}-960.webp`] : [];
};
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
    const [profile, details, prefs, bookmarks, interactions, interests, own, revisions, flipState] =
      await Promise.all([
        db
          .from("profiles")
          .select("nickname,bio,avatar_url,role,membership_tier,show_bookmarks,timezone")
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
        db.rpc("get_daily_flip_state"),
      ]);
    for (const r of [profile, details, prefs, bookmarks, interactions, interests, own, revisions, flipState])
      dbError(r.error);
    const ownPosts = await presentMany(db, own.data as unknown as LibraryRow[]);
    const revisionRows = (revisions.data || []) as { post_id: string; payload: Record<string, unknown>; status: "pending" | "approved" | "rejected"; review_note: string | null }[];
    const revisionPaths = [...new Set(revisionRows.flatMap((revision) => Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.filter((path): path is string => typeof path === "string") : []))];
    const revisionSigned = revisionPaths.length ? await signPostMedia(db, revisionPaths, 3600) : { data: [], error: null };
    dbError(revisionSigned.error);
    const revisionUrls = new Map((revisionSigned.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
    const revisionsByPost = new Map(revisionRows.map((revision) => [revision.post_id, {
      status: revision.status,
      reviewNote: revision.review_note,
      payload: {
        ...revision.payload,
        images: [
          ...(typeof revision.payload.coverUrl === "string" ? [revision.payload.coverUrl] : []),
          ...(Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.flatMap((path) => typeof path === "string" && !/\.(?:mp4|webm)$/i.test(path) && revisionUrls.has(path) ? [revisionUrls.get(path)!] : []) : []),
        ],
        videos: Array.isArray(revision.payload.mediaPaths) ? revision.payload.mediaPaths.flatMap((path) => typeof path === "string" && /\.(?:mp4|webm)$/i.test(path) && revisionUrls.has(path) ? [revisionUrls.get(path)!] : []) : [],
      },
    }]));
    const mediaPathsByPostId = new Map((own.data || [])
      .map((row) => [row.id, ((row as unknown as LibraryRow).post_media || [])
        .slice().sort((a, b) => a.sort_order - b.sort_order).map((media) => media.storage_path)]));
    return {
      profile: profile.data,
      profileDetails: details.data,
      prefs: prefs.data,
      bookmarks: bookmarks.data,
      interactions: interactions.data,
      interests: interests.data,
      dailyFlipState: flipState.data,
      own: ownPosts.map((post) => ({
        ...post,
        ...(post.cloudId ? { mediaPaths: mediaPathsByPostId.get(post.cloudId) || [] } : {}),
        pendingRevision: post.cloudId ? revisionsByPost.get(post.cloudId) : undefined,
      })),
    };
  });
}
export async function POST(req: NextRequest) {
  return respond(async () => {
    const { db, user } = await context(req);
    const b = await jsonBody(req);
    const action = b.action;
    if (action === "flip" || action === "open") {
      const clientId = Number(b.id);
      if (!Number.isSafeInteger(clientId) || clientId < 1) throw new ApiError(400, "卡片编号无效");
      const idempotencyKey = action === "flip"
        ? textField(b.idempotencyKey, "翻卡请求编号", 1, 120)
        : `legacy:${clientId}`;
      const { data: post, error: postError } = await db
        .from("posts")
        .select(libraryFields)
        .eq("client_id", clientId)
        .eq("channel", "community")
        .eq("status", "published")
        .maybeSingle();
      dbError(postError);
      if (!post) throw new ApiError(404, "卡片内容不存在或已不可用");
      const row = post as unknown as LibraryRow;
      const { data: stats, error: statsError } = await db
        .from("post_rating_stats")
        .select("rating_count,rating_sum")
        .eq("post_id", row.id)
        .maybeSingle();
      dbError(statsError);
      const ratingCount = stats?.rating_count || 0;
      const rarityTier = cardRarityTier(ratingCount ? stats!.rating_sum / ratingCount : 0, ratingCount);
      const confirmed = await db.rpc("confirm_daily_flip", {
        p_post_id: row.id,
        p_idempotency_key: idempotencyKey,
      });
      if (confirmed.error?.message.includes("daily_flip_limit_reached")) throw new ApiError(409, "今天的翻卡次数已用完");
      if (confirmed.error?.message.includes("daily_card_unavailable")) throw new ApiError(404, "卡片内容已不可用");
      if (confirmed.error?.message.includes("idempotency_key_reused")) throw new ApiError(409, "翻卡请求编号已被使用，请重新打开卡片");
      dbError(confirmed.error);
      let experience: unknown = null;
      if (row.author_id !== user!.id) {
        const awarded = await db.rpc("record_experience_event", { p_event_type: "flip", p_post_id: row.id });
        // The flip itself is already durable. If experience sync fails, retrying
        // this same idempotent request retries the event without charging again.
        if (!awarded.error) experience = awarded.data;
      }
      const presented = (await presentMany(db, [row]))[0];
      const { data: likes, error: likesError } = await db.from("post_like_stats").select("like_count").eq("post_id", row.id).maybeSingle();
      dbError(likesError);
      return {
        post: { ...presented, rarityTier, ratingAverage: ratingCount ? stats!.rating_sum / ratingCount : 0, ratingCount, likeCount: likes?.like_count || 0 },
        flipState: confirmed.data,
        experience,
      };
    }
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
      const clientId = b.id === undefined || b.id === null ? null : Number(b.id);
      if (clientId !== null && (!Number.isSafeInteger(clientId) || clientId < 1)) throw new ApiError(400, "草稿编号无效");
      const seriesId = typeof b.seriesId === "string" && b.seriesId ? b.seriesId : null;
      if (seriesId) {
        const owned = await db.from("post_series").select("id").eq("id", seriesId).eq("creator_id", user!.id).maybeSingle();
        dbError(owned.error);
        if (!owned.data) throw new ApiError(400, "请选择自己的作品系列");
      }
      let existingQuery = db.from("posts").select("id,status").eq("author_id", user!.id).eq("is_demo", false);
      if (clientId !== null) existingQuery = existingQuery.eq("client_id", clientId).in("status", ["draft", "pending_review"]);
      else existingQuery = existingQuery.eq("status", "draft").order("updated_at", { ascending: false }).limit(1);
      const { data: existing, error: existingError } = await existingQuery.maybeSingle();
      dbError(existingError);
      if (clientId !== null && !existing) throw new ApiError(404, "草稿不存在或已不能编辑");
      const values: Record<string, unknown> = { author_id: user!.id, tag_id: tag!.id, title, body, series_id: seriesId, status: existing?.status || "draft", updated_at: new Date().toISOString() };
      if (typeof b.coverUrl === "string") {
        try { const url = new URL(b.coverUrl); values.image_url = ["https:", "http:"].includes(url.protocol) ? url.toString() : null; }
        catch { throw new ApiError(400, "封面图片地址无效"); }
      }
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
      if (Array.isArray(b.mediaPaths)) {
        const mediaPaths = [...new Set(b.mediaPaths.filter((path): path is string => typeof path === "string"))];
        const splitMedia = splitPostMediaPaths(mediaPaths);
        if (splitMedia.videos.length || splitMedia.images.length > 9 || mediaPaths.some((path) => !path.startsWith(`${user!.id}/`) || path.length > 300 || path.includes(".."))) throw new ApiError(400, "草稿图片无效；最多添加 9 张图片");
        if (mediaPaths.length) {
          const storedMedia = await signPostMedia(db, mediaPaths, 60);
          dbError(storedMedia.error);
          if ((storedMedia.data || []).length !== mediaPaths.length || storedMedia.data?.some((item) => !item.signedUrl)) throw new ApiError(400, "有图片尚未同步完成，请重新上传后再保存");
        }
        const previousMedia = await db.from("post_media").select("storage_path,thumbnail_path,retina_thumbnail_path").eq("post_id", postId);
        dbError(previousMedia.error);
        const previousByPath = new Map((previousMedia.data || []).map((item) => [item.storage_path, item]));
        const { error: clearMedia } = await db.from("post_media").delete().eq("post_id", postId);
        dbError(clearMedia);
        if (mediaPaths.length) {
          const { error: insertMedia } = await db.from("post_media").insert(mediaPaths.map((storage_path, sort_order) => {
            const previous = previousByPath.get(storage_path);
            return { post_id: postId, storage_path, sort_order, thumbnail_path: previous?.thumbnail_path || null, retina_thumbnail_path: previous?.retina_thumbnail_path || null };
          }));
          dbError(insertMedia);
        }
      }
      const refreshed = await db.from("posts").select(libraryFields).eq("id", postId).single();
      dbError(refreshed.error);
      return (await presentMany(db, [refreshed.data as unknown as LibraryRow]))[0];
    }
    if (action === "publish") {
      const publishMediaPaths = Array.isArray(b.mediaPaths) ? [...new Set(b.mediaPaths.filter((path): path is string => typeof path === "string"))] : [];
      const publishMedia = splitPostMediaPaths(publishMediaPaths);
      if (publishMedia.videos.length && process.env.NEXT_PUBLIC_VIDEO_UPLOAD_BETA !== "1") throw new ApiError(404, "视频上传 Beta 暂未开放");
      if (publishMedia.images.length > 9 || publishMedia.videos.length > 1 || (publishMedia.videos.length && publishMedia.images.length) || publishMediaPaths.some((path) => !path.startsWith(`${user!.id}/`) || path.length > 300 || path.includes(".."))) {
        throw new ApiError(400, "投稿媒体无效；最多添加 9 张图片，或单独 1 个视频");
      }
      if (publishMediaPaths.length) {
        const uploaded = await signPostMedia(db, publishMediaPaths, 60);
        if (uploaded.error) dbError(uploaded.error);
        if ((uploaded.data || []).length !== publishMediaPaths.length || uploaded.data?.some((item) => !item.signedUrl)) {
          throw new ApiError(409, "图片尚未上传完成，请重试");
        }
      }
      const { data: tag, error: tagError } = await db
        .from("interest_tags")
        .select("id")
        .eq("name", String(b.tag))
        .single();
      dbError(tagError);
      const clientId = b.id === undefined || b.id === null || b.id === "" ? null : Number(b.id);
      if (clientId !== null && (!Number.isSafeInteger(clientId) || clientId < 1)) throw new ApiError(400, "草稿编号无效");
      const existingPost = clientId !== null
        ? await db.from("posts").select("id,status").eq("client_id", clientId).eq("author_id", user!.id).single()
        : null;
      if (existingPost) {
        dbError(existingPost.error);
      }
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
        const splitMedia = splitPostMediaPaths(mediaPaths);
        if (splitMedia.videos.length && process.env.NEXT_PUBLIC_VIDEO_UPLOAD_BETA !== "1") throw new ApiError(404, "视频上传 Beta 暂未开放");
        if (splitMedia.images.length > 9 || splitMedia.videos.length > 1 || (splitMedia.videos.length && splitMedia.images.length) || mediaPaths.some((path) => !path.startsWith(`${user!.id}/`) || path.length > 300 || path.includes(".."))) throw new ApiError(400, "投稿媒体无效；最多 9 张图片，或单独 1 个视频");
        if (mediaPaths.length) {
          const storedMedia = await signPostMedia(db, mediaPaths, 60);
          dbError(storedMedia.error);
          if ((storedMedia.data || []).length !== mediaPaths.length || storedMedia.data?.some((item) => !item.signedUrl)) throw new ApiError(400, "有媒体尚未同步完成，请重新上传后再提交");
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
        const signed = mediaPaths.length ? await signPostMedia(db, mediaPaths, 3600) : { data: [], error: null };
        dbError(signed.error);
        const signedByPath = new Map((signed.data || []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
        return { ...presented, pendingRevision: { status: revision.data.status, reviewNote: revision.data.review_note, payload: { ...payload, images: [...(coverUrl ? [coverUrl] : []), ...mediaPaths.flatMap((path) => !/\.(?:mp4|webm)$/i.test(path) && signedByPath.has(path) ? [signedByPath.get(path)!] : [])], videos: mediaPaths.flatMap((path) => /\.(?:mp4|webm)$/i.test(path) && signedByPath.has(path) ? [signedByPath.get(path)!] : []) } } };
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
      const { data, error } = clientId !== null
        ? await q
            .update(values)
            .eq("client_id", clientId)
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
        const splitMedia = splitPostMediaPaths(mediaPaths);
        if (splitMedia.videos.length && process.env.NEXT_PUBLIC_VIDEO_UPLOAD_BETA !== "1") throw new ApiError(404, "视频上传 Beta 暂未开放");
        if (splitMedia.images.length > 9 || splitMedia.videos.length > 1 || (splitMedia.videos.length && splitMedia.images.length) || mediaPaths.some((path) => !path.startsWith(`${user!.id}/`) || path.length > 300 || path.includes("..")))
          throw new ApiError(400, "投稿媒体无效；最多 9 张图片，或单独 1 个视频");
        const previousMedia = await db.from("post_media").select("storage_path,thumbnail_path,retina_thumbnail_path").eq("post_id", postId);
        dbError(previousMedia.error);
        const previousByPath = new Map((previousMedia.data || []).map((item) => [item.storage_path, item]));
        const { error: clearMedia } = await db.from("post_media").delete().eq("post_id", postId);
        dbError(clearMedia);
        if (mediaPaths.length) {
          const { error: insertMedia } = await db.from("post_media").insert(mediaPaths.map((storage_path, sort_order) => {
            const previous = previousByPath.get(storage_path);
            return {
              post_id: postId,
              storage_path,
              sort_order,
              ...(!/\.(?:mp4|webm)$/i.test(storage_path) ? {
                thumbnail_path: previous?.thumbnail_path || null,
                retina_thumbnail_path: previous?.retina_thumbnail_path || null,
              } : {}),
            };
          }));
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
      const media = await db.from("post_media").select("storage_path,thumbnail_path,retina_thumbnail_path").eq("post_id", post!.id);
      dbError(media.error);
      const revision = await db.from("post_revisions").select("payload").eq("post_id", post!.id).maybeSingle();
      dbError(revision.error);
      const revisionPaths: string[] = Array.isArray(revision.data?.payload?.mediaPaths) ? revision.data.payload.mediaPaths.filter((path: unknown): path is string => typeof path === "string" && path.startsWith(`${user!.id}/`)) : [];
      const paths = [...new Set([
        ...(media.data || []).flatMap((item) => [item.storage_path, item.thumbnail_path, item.retina_thumbnail_path].filter((path): path is string => Boolean(path))),
        ...revisionPaths.flatMap((path) => [path, ...mediaVariants(path)]),
      ])];
      const grouped = new Map<string, string[]>();
      for (const path of paths) {
        const bucket = /\.(?:mp4|webm)$/i.test(path) ? "post-videos" : "post-covers";
        grouped.set(bucket, [...(grouped.get(bucket) || []), path]);
      }
      const removed = await Promise.all([...grouped].map(([bucket, bucketPaths]) => db.storage.from(bucket).remove(bucketPaths)));
      dbError(removed.find((result) => result.error)?.error ?? null);
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
    if (action === "view") {
      const { data: viewCount, error: viewError } = await db.rpc("record_post_view", { p_post_id: post!.id });
      dbError(viewError);
      return { saved: true, viewCount: Number(viewCount) || 0 };
    }
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
