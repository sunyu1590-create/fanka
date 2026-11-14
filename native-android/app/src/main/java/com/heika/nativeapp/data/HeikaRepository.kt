package com.heika.nativeapp.data

import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.db.DailyStateEntity
import com.heika.nativeapp.db.FeedCache
import com.heika.nativeapp.db.HeikaCacheDao
import com.heika.nativeapp.feature.home.DailyDeckLogic
import com.heika.nativeapp.feature.exploration.ExplorationCalendarLogic
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import retrofit2.Response
import okhttp3.ResponseBody

@Singleton
class HeikaRepository @Inject constructor(
    private val api: HeikaApi,
    private val auth: AuthRepository,
    private val cache: FeedCache,
    private val cacheDao: HeikaCacheDao,
) {
    private val recommendationCache = ConcurrentHashMap<String, Pair<Long, RecommendationContext>>()

    suspend fun loadCategories(channel: String, kind: String): List<HeikaCategory> = withContext(Dispatchers.IO) {
        val data = request("/api/v1/categories?channel=$channel&kind=$kind") as? JSONObject ?: JSONObject()
        data.optJSONArray("items").jsonObjects().mapNotNull { item ->
            val id = item.optInt("id")
            val name = item.optString("name")
            if (id > 0 && name.isNotBlank()) HeikaCategory(id, name, item.optInt("parent_id").takeIf { it > 0 }) else null
        }
    }

    suspend fun loadAiResourceTypes(): List<AiResourceType> = withContext(Dispatchers.IO) {
        val data = request("/api/v1/ai-resource-types") as? JSONObject ?: JSONObject()
        data.optJSONArray("items").jsonObjects().mapNotNull { item ->
            val id = item.optString("resource_type")
            val label = item.optString("label")
            if (id.isBlank() || label.isBlank()) null else AiResourceType(
                id = id, label = label, description = item.optString("description"), publishedCount = item.optInt("published_count"),
            )
        }
    }

    suspend fun cachedFeed(filter: FeedFilter): List<HeikaPost> = withContext(Dispatchers.IO) {
        cache.get(feedCacheKey(filter))?.let(::parsePosts).orEmpty()
    }

    suspend fun recommendationContext(): RecommendationContext = withContext(Dispatchers.IO) {
        val session = auth.current() ?: return@withContext RecommendationContext()
        val cached = recommendationCache[session.userId]
        if (cached != null && System.currentTimeMillis() - cached.first < RANKING_CACHE_MS) return@withContext cached.second
        val payload = request("/api/v1/library-state", authenticated = true) as? JSONObject ?: JSONObject()
        val interests = buildSet {
            payload.optJSONArray("interests").jsonObjects().forEach { row ->
                row.optJSONObject("interest_tags")?.optString("name")?.takeIf(String::isNotBlank)?.let(::add)
            }
        }
        val viewed = mutableSetOf<Int>()
        val ratings = mutableMapOf<Int, Int>()
        payload.optJSONArray("interactions").jsonObjects().forEach { row ->
            val id = row.optJSONObject("posts")?.optInt("client_id") ?: 0
            if (id <= 0) return@forEach
            if (!row.isNull("viewed_at") && row.optString("viewed_at").isNotBlank()) viewed += id
            if (!row.isNull("rating")) row.optInt("rating").takeIf { it in 1..5 }?.let { ratings[id] = it }
        }
        RecommendationContext(interests, viewed, ratings).also {
            recommendationCache[session.userId] = System.currentTimeMillis() to it
        }
    }

    suspend fun communityPage(
        filter: FeedFilter,
        key: FeedPageKey,
        recommendation: RecommendationContext = RecommendationContext(),
    ): FeedPage = withContext(Dispatchers.IO) {
        val cacheKey = feedCacheKey(filter)
        val query = buildString {
            append("/api/demo/cards?mode=discover&limit=24")
            filter.category?.let { append("&tag=${encode(it.name)}") }
            if (filter.sort == "关注") append("&following=1")
            if (filter.sort != "关注" && filter.sort != "最新" && filter.sort != "高评分") {
                // The endpoint applies the website's existing recommendation RPC.
            }
            if (key.cursorCreatedAt != null && key.cursorPostId != null) {
                append("&cursorCreatedAt=${encode(key.cursorCreatedAt)}&cursorPostId=${encode(key.cursorPostId)}")
            }
        }
        try {
            val payload = request(query, authenticated = filter.sort == "关注", includeSession = true) as? JSONObject ?: JSONObject()
            var posts = payload.optJSONArray("items").jsonObjects().map(HeikaPost::from)
            if (filter.topic != null) posts = posts.filter { filter.topic in it.tags }
            posts = when (filter.sort) {
                "最新", "关注" -> posts
                "高评分" -> posts.sortedWith(
                    compareByDescending<HeikaPost> { if (it.hasRating) it.ratingAverage else Double.NEGATIVE_INFINITY }
                        .thenByDescending { it.ratingCount }
                        .thenByDescending { it.date }
                        .thenByDescending { it.id },
                )
                else -> RecommendationRanker.rank(posts, recommendation)
            }
            val cursor = payload.optJSONObject("cursor")
            val page = FeedPage(
                posts = posts,
                hasMore = payload.optBoolean("hasMore"),
                nextCursorCreatedAt = cursor?.optString("createdAt")?.takeIf(String::isNotBlank),
                nextCursorPostId = cursor?.optString("postId")?.takeIf(String::isNotBlank),
            )
            if (key.cursorCreatedAt == null) cache.put(cacheKey, JSONArray(posts.map { JSONObject(it.rawJson) }).toString())
            page
        } catch (error: Exception) {
            if (key.cursorCreatedAt != null) throw error
            val cachedPayload = cache.get(cacheKey) ?: throw error
            FeedPage(parsePosts(cachedPayload), hasMore = false)
        }
    }

    suspend fun aiPage(filter: FeedFilter, page: Int): FeedPage = withContext(Dispatchers.IO) {
        val cacheKey = feedCacheKey(filter)
        val query = buildString {
            append("/api/v1/ai-space?limit=24&page=$page&sort=")
            append(when (filter.sort) { "最新" -> "latest"; "热门" -> "popular"; else -> "featured" })
            filter.category?.let { append("&category=${it.id}") }
            filter.topic?.let { append("&topic=${encode(it)}") }
            filter.contentType?.let { append("&type=${encode(it)}") }
            filter.usageScenario?.let { append("&scenario=${encode(it)}") }
            filter.query?.trim()?.takeIf(String::isNotBlank)?.let { append("&q=${encode(it.take(60))}") }
        }
        try {
            val payload = try {
                request(query, includeSession = true) as? JSONObject ?: JSONObject()
            } catch (primary: Exception) {
                // Older production deployments may not yet understand the native topic filter.
                // Retry the same AI feed without that optional filter before showing an error.
                if (filter.topic.isNullOrBlank()) throw primary
                val compatible = query.replace("&topic=${encode(filter.topic)}", "")
                request(compatible, includeSession = true) as? JSONObject ?: throw primary
            }
            val posts = payload.optJSONArray("items").jsonObjects().map(HeikaPost::from)
            val total = payload.optInt("total")
            if (page == 1) cache.put(cacheKey, JSONArray(posts.map { JSONObject(it.rawJson) }).toString())
            FeedPage(posts, page * 24 < total, nextPage = page + 1)
        } catch (error: Exception) {
            if (page != 1) throw error
            val cachedPayload = cache.get(cacheKey) ?: throw error
            FeedPage(parsePosts(cachedPayload), hasMore = false)
        }
    }

    suspend fun publicCardIds(): List<Int> = withContext(Dispatchers.IO) {
        (request("/api/demo/cards") as? JSONArray).jsonObjects().mapNotNull { it.optInt("id").takeIf { id -> id > 0 } }
    }

    suspend fun revealedCards(ids: List<Int>): List<HeikaPost> = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext emptyList()
        val result = request(
            "/api/demo/cards",
            method = "POST",
            body = JSONObject().put("ids", JSONArray(ids)).toString(),
        ) as? JSONObject ?: JSONObject()
        result.optJSONArray("items").jsonObjects().map(HeikaPost::from)
    }

    suspend fun revealCard(id: Int): HeikaPost = withContext(Dispatchers.IO) {
        val result = request("/api/demo/cards", method = "POST", body = JSONObject().put("id", id).toString()) as? JSONObject
            ?: throw IOException("卡片内容暂不可用")
        HeikaPost.from(result)
    }

    suspend fun confirmDailyFlip(clientId: Int, day: String): JSONObject = withContext(Dispatchers.IO) {
        require(clientId > 0) { "卡片编号无效" }
        require(day.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { "翻卡日期无效" }
        request(
            "/api/v1/library-state",
            method = "POST",
            body = JSONObject()
                .put("action", "flip")
                .put("id", clientId)
                .put("idempotencyKey", DailyDeckLogic.flipIdempotencyKey(day, clientId))
                .toString(),
            authenticated = true,
        ) as? JSONObject ?: throw IOException("翻卡结果暂不可用，请重试")
    }

    suspend fun myLibraryState(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/library-state", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun recordOpen(clientId: Int) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", "open").put("id", clientId)
        request("/api/v1/library-state", method = "POST", body = body.toString(), authenticated = true)
    }

    suspend fun loadNotifications(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/notifications?limit=30", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun cachedNotifications(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(NativeCacheKeys.notifications(userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveNotificationsCache(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(NativeCacheKeys.notifications(userId), value.toString())
    }

    suspend fun notificationSettings(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/settings/notifications", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setCommentNotifications(enabled: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/settings/notifications",
            method = "PATCH",
            body = JSONObject().put("commentsEnabled", enabled).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun markNotification(id: String? = null, all: Boolean = false) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", if (all) "read_all" else "read")
        id?.let { body.put("id", it) }
        request("/api/v1/notifications", method = "POST", body = body.toString(), authenticated = true)
    }

    suspend fun post(cloudId: String): HeikaPost = withContext(Dispatchers.IO) {
        val value = request("/api/v1/posts/${encode(cloudId)}", authenticated = true)
        HeikaPost.from(value as? JSONObject ?: JSONObject())
    }

    suspend fun postDetail(post: HeikaPost): HeikaPost = withContext(Dispatchers.IO) {
        val value = fetchPostDetail(post.cloudId, post.id)
        val json = value as? JSONObject ?: throw IOException("内容暂不可用")
        HeikaPost.from(json).also { savePostDetail(post.cloudId.ifBlank { post.id.toString() }, it) }
    }

    suspend fun postDetailByKey(key: String): HeikaPost = withContext(Dispatchers.IO) {
        val id = key.removePrefix("client-").toIntOrNull() ?: 0
        val value = fetchPostDetail(key, id) as? JSONObject ?: throw IOException("内容暂不可用")
        HeikaPost.from(value).also { savePostDetail(key, it) }
    }

    suspend fun cachedPostDetail(key: String): HeikaPost? = withContext(Dispatchers.IO) {
        val owner = auth.current()?.userId ?: "public"
        cache.get(postDetailCacheKey(owner, key))?.let { raw -> runCatching { HeikaPost.from(JSONObject(raw)) }.getOrNull() }
    }

    private suspend fun savePostDetail(key: String, post: HeikaPost) {
        val owner = auth.current()?.userId ?: "public"
        cache.put(postDetailCacheKey(owner, key), post.rawJson)
    }

    private fun postDetailCacheKey(owner: String, key: String) = NativeCacheKeys.postDetail(owner, key)

    private suspend fun fetchPostDetail(cloudId: String, clientId: Int): Any? = if (isUuid(cloudId)) {
        request("/api/v1/posts/${encode(cloudId)}", includeSession = true)
    } else {
        require(clientId > 0) { "内容编号无效" }
        request("/api/demo/cards", method = "POST", body = JSONObject().put("id", clientId).toString())
    }

    suspend fun comments(postId: String, page: Int = 1, sort: String = "new"): JSONObject = withContext(Dispatchers.IO) {
        val safeSort = if (sort == "hot") "hot" else "new"
        request("/api/v1/posts/${encode(postId)}/comments?page=${page.coerceAtLeast(1)}&limit=30&sort=$safeSort", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun addComment(postId: String, body: String, parentId: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("body", body)
        parentId?.let { payload.put("parent_id", it) }
        request("/api/v1/posts/${encode(postId)}/comments", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setCommentLiked(commentId: String, liked: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(commentId)) { "评论编号无效" }
        if (liked) request("/api/v1/comments/${encode(commentId)}/reactions", method = "POST", body = JSONObject().put("kind", "like").toString(), authenticated = true)
        else request("/api/v1/comments/${encode(commentId)}/reactions?kind=like", method = "DELETE", authenticated = true)
        JSONObject().put("liked", liked)
    }

    suspend fun reportPost(postId: String, reason: String, note: String, commentId: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(postId) || (commentId != null && isUuid(commentId))) { "举报对象无效" }
        require(commentId == null || isUuid(commentId)) { "评论编号无效" }
        require(commentId != null || isUuid(postId)) { "内容编号无效" }
        val payload = JSONObject().put("reason", reason).put("note", note.take(300))
        if (commentId == null) payload.put("post_id", postId) else payload.put("comment_id", commentId)
        request(
            "/api/v1/reports",
            method = "POST",
            body = payload.toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun muteRecommendationAuthor(authorId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(authorId)) { "作者编号无效" }
        request("/api/v1/recommendation-feedback", method = "POST", body = JSONObject().put("action", "mute_author").put("authorId", authorId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun muteRecommendationTopic(topic: String): JSONObject = withContext(Dispatchers.IO) {
        require(topic.trim().length in 1..32)
        request("/api/v1/recommendation-feedback", method = "POST", body = JSONObject().put("action", "mute_topic").put("topic", topic.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteComment(commentId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(commentId)) { "评论编号无效" }
        request("/api/v1/comments/${encode(commentId)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deletePost(postId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(postId)) { "内容编号无效" }
        request("/api/v1/posts/${encode(postId)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminOverview(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/overview", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminReports(status: String = "open", page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        require(status in setOf("open", "resolved", "dismissed", "all"))
        request("/api/v1/admin/reports?status=$status&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminReport(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/reports/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminPosts(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/posts?page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAiQueue(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-space?status=queue&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminAi(id: String, publish: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/ai-space/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (publish) "published" else "hidden").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAppeals(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/appeals?status=open&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminAppeal(id: String, accepted: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/appeals", method = "PATCH", body = JSONObject().put("id", id).put("status", if (accepted) "accepted" else "rejected").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminUsers(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/users?limit=30", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminUserRole(id: String, role: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && role in setOf("member", "admin", "content_manager", "reviewer"))
        request("/api/v1/admin/users/${encode(id)}", method = "PATCH", body = JSONObject().put("role", role).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminUserMembership(id: String, tier: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && tier in setOf("free", "plus", "pro"))
        request("/api/v1/admin/users/${encode(id)}", method = "PATCH", body = JSONObject().put("membership_tier", tier).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminUserRestriction(id: String, active: Boolean, reason: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && reason.trim().length in 3..500)
        val restriction = if (active) JSONObject().put("active", true).put("reason", reason.trim()).put("permanent", true) else JSONObject().put("active", false)
        request("/api/v1/admin/users/${encode(id)}", method = "PATCH", body = JSONObject().put("community_restriction", restriction).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminComments(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/comments?status=all&page=${page.coerceAtLeast(1)}&limit=30", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminCommentVisible(id: String, visible: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id))
        val payload = JSONObject().put("status", if (visible) "visible" else "hidden")
        if (note.trim().length >= 3) payload.put("review_note", note.trim().take(500))
        request("/api/v1/admin/comments/${encode(id)}", method = "PATCH", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAiFeedback(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-space?status=feedback&feedbackStatus=open&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun handleAdminAiFeedback(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/ai-space/feedback/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminMessageReports(): JSONObject = withContext(Dispatchers.IO) {
        val rows = request("/api/v1/admin/message-reports", authenticated = true) as? JSONArray ?: JSONArray()
        JSONObject().put("items", rows)
    }

    suspend fun adminUserFeedback(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/user-feedback?status=open&page=${page.coerceAtLeast(1)}&limit=20", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun handleAdminUserFeedback(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.length <= 1000)
        request("/api/v1/admin/user-feedback/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAudit(page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/audit?page=${page.coerceAtLeast(1)}&limit=50", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminKeywordRules(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/moderation-rules", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun createAdminKeywordRule(keyword: String): JSONObject = withContext(Dispatchers.IO) {
        require(keyword.trim().length in 1..80)
        request("/api/v1/admin/moderation-rules", method = "POST", body = JSONObject().put("keyword", keyword.trim()).put("scopes", org.json.JSONArray(listOf("post", "comment", "message", "profile"))).put("enabled", true).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminKeywordEnabled(id: String, enabled: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id))
        request("/api/v1/admin/moderation-rules/${encode(id)}", method = "PATCH", body = JSONObject().put("enabled", enabled).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteAdminKeywordRule(id: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id))
        request("/api/v1/admin/moderation-rules/${encode(id)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminCategories(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/categories", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminAiResourceTypes(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-resource-types", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateAdminAiResourceType(resourceType: String, label: String, description: String, enabled: Boolean, sortOrder: Int): JSONObject = withContext(Dispatchers.IO) {
        require(resourceType in aiResourceTypes) { "AI 资源类型编号无效" }
        require(label.trim().length in 1..24 && description.length <= 120 && sortOrder in 0..100)
        request(
            "/api/v1/admin/ai-resource-types",
            method = "PATCH",
            body = JSONObject().put("resource_type", resourceType).put("label", label.trim()).put("description", description.trim()).put("enabled", enabled).put("sort_order", sortOrder).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun createAdminCategory(name: String): JSONObject = withContext(Dispatchers.IO) {
        require(name.trim().length in 2..32)
        request("/api/v1/admin/categories", method = "POST", body = JSONObject().put("name", name.trim()).put("channel", "community").put("kind", "category").toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setAdminCategoryActive(id: Int, active: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(id > 0)
        request("/api/v1/admin/categories/$id", method = "PATCH", body = JSONObject().put("active", active).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminTopicEvents(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/topic-events", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminTopicEvent(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        require(payload.optString("topic").isNotBlank() && payload.optString("title").length in 4..80 && payload.optString("description").length in 8..500)
        request("/api/v1/admin/topic-events", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminRecommendationSettings(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/settings", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminRecommendationSettings(values: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/settings", method = "PATCH", body = values.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminExplorationAd(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/exploration-ad", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun adminExplorationAdPosts(query: String): JSONObject = withContext(Dispatchers.IO) {
        require(query.trim().length in 2..60)
        request("/api/v1/admin/exploration-ad/posts?q=${encode(query.trim())}", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminExplorationAd(values: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/exploration-ad", method = "PATCH", body = values.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun uploadAdminExplorationAdImage(fileName: String, mimeType: String, bytes: ByteArray): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(4 * 1024 * 1024)) { "广告图片不能超过 4 MB" }
        require(mimeType in setOf("image/jpeg", "image/png", "image/webp")) { "广告图片仅支持 JPG、PNG 或 WebP" }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .build()
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/admin/exploration-ad/image", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) {
            throw IOException(root.optString("error").ifBlank { "广告图片上传失败（${response.code()}）" })
        }
        (root.opt("data") as? JSONObject) ?: root
    }

    suspend fun adminAiSettings(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-settings", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun saveAdminAiKey(key: String): JSONObject = withContext(Dispatchers.IO) {
        require(key.trim().length in 16..500)
        request("/api/v1/admin/ai-settings", method = "POST", body = JSONObject().put("key", key.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteAdminAiKey(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/admin/ai-settings", method = "POST", body = JSONObject().put("action", "delete").toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun handleAdminMessageReport(id: String, resolved: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/message-reports", method = "PATCH", body = JSONObject().put("id", id).put("status", if (resolved) "resolved" else "dismissed").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reviewAdminPost(id: String, publish: Boolean, note: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id) && note.trim().length in 3..500)
        request("/api/v1/admin/posts/${encode(id)}", method = "PATCH", body = JSONObject().put("status", if (publish) "published" else "hidden").put("review_note", note.trim()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun setPostInteraction(id: Int, action: String, value: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/library-state", method = "POST", body = PostInteractionProtocol.libraryStateBody(id, action, value), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun ratePost(id: Int, rating: Int): JSONObject = withContext(Dispatchers.IO) {
        require(rating in 1..5)
        request(PostInteractionProtocol.ratingPath(id), method = "POST", body = JSONObject().put("rating", rating).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun interactionState(id: Int): JSONObject = withContext(Dispatchers.IO) {
        val value = request("/api/v1/me/interactions?ids=$id", includeSession = true) as? JSONObject ?: JSONObject()
        value.optJSONObject(id.toString()) ?: JSONObject()
    }

    suspend fun ratingState(id: Int): JSONObject = withContext(Dispatchers.IO) {
        request(PostInteractionProtocol.ratingStatePath(id), includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun toggleCreatorFollow(creatorId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/creator-follows", method = "POST", body = JSONObject().put("creatorId", creatorId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun myProfile(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun generateRecoveryCodes(): List<String> = withContext(Dispatchers.IO) {
        val result = request("/api/v1/auth/recovery-codes", method = "POST", authenticated = true) as? JSONObject ?: JSONObject()
        result.optJSONArray("codes")?.let { array -> (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) } }
            ?.takeIf { it.isNotEmpty() } ?: throw IOException("恢复码生成失败，请重试")
    }

    suspend fun cachedMyProfile(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(NativeCacheKeys.profile(userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveMyProfileCache(userId: String, payload: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(NativeCacheKeys.profile(userId), payload.toString())
    }

    suspend fun updateMyProfile(nickname: String, bio: String, details: JSONArray): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", method = "PATCH", body = JSONObject().put("nickname", nickname).put("bio", bio).put("details", details).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateBookmarksVisibility(visible: Boolean): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", method = "PATCH", body = JSONObject().put("show_bookmarks", visible).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun accountPrivacy(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me/privacy", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateAccountPrivacy(values: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me/privacy", method = "PATCH", body = values.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun blockAccount(userId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(userId))
        request("/api/v1/me/privacy", method = "POST", body = JSONObject().put("blocked_id", userId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun unblockAccount(userId: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(userId))
        request("/api/v1/me/privacy?blocked_id=${encode(userId)}", method = "DELETE", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun deleteMyPost(clientId: Int): JSONObject = withContext(Dispatchers.IO) {
        require(clientId > 0) { "作品编号无效" }
        request(
            "/api/v1/library-state",
            method = "POST",
            body = JSONObject().put("action", "delete").put("id", clientId).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun uploadMyAvatar(fileName: String, mimeType: String, bytes: ByteArray): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(2 * 1024 * 1024)) { "头像图片不能超过 2 MB" }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .build()
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/me/avatar", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "头像上传失败（${response.code()}）" })
        (root.opt("data") as? JSONObject) ?: root
    }

    suspend fun profile(userId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/profiles/${encode(userId)}", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun creatorFollowState(userId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/creator-follows?creator=${encode(userId)}", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun myLibrary(kind: String, page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        require(kind in setOf("own", "bookmarks", "liked", "recent"))
        request("/api/v1/me/library?kind=$kind&page=${page.coerceAtLeast(1)}&limit=24", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun search(query: String, kind: String = "content", page: Int = 1, cursor: String? = null, limit: Int = 24): JSONObject = withContext(Dispatchers.IO) {
        require(kind == "content" || kind == "people")
        val cursorQuery = cursor?.takeIf { kind == "content" }?.let { "&cursor=${encode(it)}" }.orEmpty()
        request("/api/v1/search?q=${encode(query.take(60))}&kind=$kind&page=${page.coerceAtLeast(1)}&limit=${limit.coerceIn(1, 24)}$cursorQuery", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun searchAi(query: String, page: Int = 1, limit: Int = 24): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/ai-space?q=${encode(query.take(60))}&page=${page.coerceAtLeast(1)}&limit=${limit.coerceIn(1, 24)}&sort=popular", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun aiResourceVersions(postId: String): List<JSONObject> = withContext(Dispatchers.IO) {
        require(isUuid(postId)) { "AI 资源编号无效" }
        val payload = request("/api/v1/ai-space/${encode(postId)}/versions", includeSession = true) as? JSONObject ?: JSONObject()
        payload.optJSONArray("items").jsonObjects()
    }

    suspend fun cachedAiResourceVersions(postId: String): List<JSONObject>? = withContext(Dispatchers.IO) {
        val owner = auth.current()?.userId ?: "public"
        cache.get(NativeCacheKeys.aiVersions(owner, postId))?.let { raw ->
            runCatching { JSONTokener(raw).nextValue() as? JSONArray }.getOrNull()?.jsonObjects()
        }
    }

    suspend fun saveAiResourceVersions(postId: String, versions: List<JSONObject>) = withContext(Dispatchers.IO) {
        val owner = auth.current()?.userId ?: "public"
        cache.put(NativeCacheKeys.aiVersions(owner, postId), JSONArray(versions).toString())
    }

    suspend fun submitAiResourceFeedback(postId: String, kind: String, details: String): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(postId)) { "AI 资源编号无效" }
        require(kind in setOf("broken_link", "unsafe", "outdated", "other")) { "反馈类型无效" }
        require(details.trim().length in 3..1000) { "反馈说明需为 3 到 1000 字" }
        request(
            "/api/v1/ai-space/${encode(postId)}/feedback",
            method = "POST",
            body = JSONObject().put("kind", kind).put("details", details.trim()).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun mutateAiResource(
        action: String,
        id: String?,
        title: String,
        body: String,
        category: String,
        contentType: String,
        resourceData: JSONObject,
        topics: List<String>,
        mediaPaths: List<String>,
        usageScenarios: List<String>,
    ): JSONObject = withContext(Dispatchers.IO) {
        require(action == "draft" || action == "submit") { "AI 内容操作无效" }
        require(contentType in aiResourceTypes) { "AI 内容类型无效" }
        val payload = JSONObject()
            .put("action", action).put("title", title).put("body", body).put("category", category)
            .put("contentType", contentType).put("resourceData", resourceData)
            .put("usageScenarios", JSONArray(usageScenarios)).put("topics", JSONArray(topics)).put("mediaPaths", JSONArray(mediaPaths))
        id?.takeIf(String::isNotBlank)?.let {
            require(isUuid(it)) { "AI 内容编号无效" }
            payload.put("id", it)
        }
        request("/api/v1/ai-space", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject
            ?: throw IOException("AI 内容暂不可用")
    }

    suspend fun searchTopics(query: String? = null, featured: Boolean = false): JSONArray = withContext(Dispatchers.IO) {
        val params = buildList {
            query?.trim()?.takeIf(String::isNotBlank)?.let { add("q=${encode(it.take(60))}") }
            if (featured) add("featured=1")
        }.joinToString("&").takeIf(String::isNotBlank)?.let { "?$it" }.orEmpty()
        request("/api/v1/topics$params") as? JSONArray ?: JSONArray()
    }

    suspend fun inbox(): JSONObject = withContext(Dispatchers.IO) {
        val userId = auth.current()?.userId ?: throw IOException("请先登录后继续")
        val summaries = auth.dataApi(NativeMessagesApi.INBOX_PATH, NativeMessagesApi.RPC_METHOD, JSONObject()) as? JSONArray ?: JSONArray()
        val peersById = summaries.jsonObjects().map { row ->
            row.optString(if (row.optString("user_a") == userId) "user_b" else "user_a")
        }.filter(::isUuid).distinct().let { ids ->
            if (ids.isEmpty()) emptyMap() else {
                val rows = auth.dataApi("/profiles?select=id,nickname,bio,avatar_url&id=in.(${ids.joinToString(",")})") as? JSONArray
                rows.jsonObjects().associateBy { it.optString("id") }
            }
        }
        val items = JSONArray()
        for (row in summaries.jsonObjects()) {
            val peerId = row.optString(if (row.optString("user_a") == userId) "user_b" else "user_a")
            items.put(JSONObject(row.toString()).put("peer", peersById[peerId] ?: JSONObject().put("id", peerId)))
        }
        JSONObject().put("items", items)
    }

    suspend fun cachedInbox(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(NativeCacheKeys.messages(userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveInboxCache(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(NativeCacheKeys.messages(userId), value.toString())
    }

    suspend fun conversation(id: String, before: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(isUuid(id)) { "会话编号无效" }
        val rows = auth.dataApi(NativeMessagesApi.messagesQuery(id, before), NativeMessagesApi.READ_METHOD) as? JSONArray ?: JSONArray()
        val items = JSONArray()
        for (index in rows.length() - 1 downTo 0) items.put(rows.getJSONObject(index))
        JSONObject().put("items", items).put("has_more", rows.length() == 40).put("next_before", items.optJSONObject(0)?.optString("created_at"))
    }

    suspend fun markConversationRead(id: String): JSONObject = withContext(Dispatchers.IO) {
        auth.dataApi("${NativeMessagesApi.READS_PATH}${NativeMessagesApi.READ_UPSERT_QUERY}", NativeMessagesApi.UPSERT_METHOD, JSONObject().put("conversation_id", id).put("user_id", auth.current()?.userId).put("read_at", java.time.Instant.now().toString()), "resolution=merge-duplicates,return=minimal")
        JSONObject().put("read", true)
    }

    suspend fun searchPeople(query: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/search?kind=people&q=${encode(query.take(60))}&limit=20", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun openConversation(peerId: String): JSONObject = withContext(Dispatchers.IO) {
        val id = auth.dataApi(NativeMessagesApi.OPEN_PATH, NativeMessagesApi.RPC_METHOD, JSONObject().put("peer", peerId)) as? String ?: throw IOException("暂时无法发起私聊")
        JSONObject().put("conversation_id", id)
    }

    suspend fun sendMessage(conversationId: String, content: String, nonce: String): JSONObject = withContext(Dispatchers.IO) {
        auth.dataApi(NativeMessagesApi.SEND_PATH, NativeMessagesApi.RPC_METHOD, JSONObject().put("room", conversationId).put("content", content).put("nonce", nonce).put("image_path", JSONObject.NULL)) as? JSONObject ?: JSONObject()
    }

    suspend fun createOrUpdateDraft(id: Int? = null, title: String, body: String, tag: String, topics: List<String> = emptyList(), mediaPaths: List<String> = emptyList()): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("action", "draft").put("title", title).put("body", body).put("tag", tag).put("topics", JSONArray(topics)).put("mediaPaths", JSONArray(mediaPaths))
        id?.let { payload.put("id", it) }
        request("/api/v1/library-state", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun publishDraft(id: Int? = null, title: String, body: String, tag: String, topics: List<String>, mediaPaths: List<String>): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("action", "publish").put("title", title).put("body", body).put("tag", tag).put("topics", JSONArray(topics)).put("mediaPaths", JSONArray(mediaPaths))
        id?.let { payload.put("id", it) }
        request("/api/v1/library-state", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun submitFeedback(category: String, message: String): JSONObject = withContext(Dispatchers.IO) {
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("category", category)
            .addFormDataPart("message", message)
            .addFormDataPart("website", "")
            .build()
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/feedback", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "反馈提交失败（${response.code()}）" })
        root.optJSONObject("data") ?: root
    }

    suspend fun progression(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/progression", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun membershipState(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/membership", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun redeemMembership(action: String, code: String, requestId: String? = null): JSONObject = withContext(Dispatchers.IO) {
        require(action in setOf("preview", "redeem"))
        val body = JSONObject().put("action", action).put("code", code)
        if (requestId != null) body.put("requestId", requestId)
        request("/api/v1/membership/redeem", method = "POST", body = body.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun claimExperienceReward(level: Int): JSONObject = withContext(Dispatchers.IO) {
        require(level in 1..10)
        request("/api/v1/progression", method = "POST", body = JSONObject().put("level", level).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun dailyMissions(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/daily-missions", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun claimDailyMission(missionKey: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/daily-missions", method = "POST", body = JSONObject().put("missionKey", missionKey).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun explorationSnapshot(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(explorationCacheKey("center", userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveExplorationSnapshot(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(explorationCacheKey("center", userId), value.toString())
    }

    suspend fun explorationAd(): JSONObject? = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-ad", includeSession = true) as? JSONObject
    }

    suspend fun explorationCalendar(userId: String, month: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val key = explorationCacheKey("calendar-${month ?: "current"}", userId)
        val session = auth.current() ?: throw IOException("登录后查看探索日历")
        if (session.userId != userId) throw IOException("账号已切换，请重新加载探索日历")
        val profilePayload = myProfile()
        val timezone = (profilePayload.optJSONObject("profile") ?: profilePayload).optString("timezone").ifBlank { "Asia/Shanghai" }
        val zone = runCatching { java.time.ZoneId.of(timezone) }.getOrDefault(java.time.ZoneId.of("Asia/Shanghai"))
        val today = java.time.LocalDate.now(zone)
        val currentMonth = month?.let { runCatching { java.time.YearMonth.parse(it).toString() }.getOrNull() }
            ?: if (month == null) java.time.YearMonth.from(today).toString() else null
            ?: throw IOException("月份无效")
        val monthStart = java.time.YearMonth.parse(currentMonth).atDay(1)
        val monthEnd = monthStart.plusMonths(1)
        val monthOpens = mutableListOf<Triple<String, String, String>>()
        val streakDates = mutableSetOf<java.time.LocalDate>()
        var expectedStreakDate: java.time.LocalDate? = null
        var streakFinished = false
        var monthFinished = false
        var offset = 0
        while (!streakFinished || !monthFinished) {
            val page = auth.dataApi(
                "/user_interactions?select=post_id,opened_at&opened_at=not.is.null&order=opened_at.desc,post_id.asc&limit=500&offset=$offset",
            ) as? JSONArray ?: JSONArray()
            if (page.length() == 0) {
                streakFinished = true
                monthFinished = true
                break
            }
            for (row in page.jsonObjects()) {
                val stamp = row.optString("opened_at").takeIf(String::isNotBlank) ?: continue
                val date = ExplorationCalendarLogic.localDate(stamp, zone) ?: continue
                if (date >= monthStart && date < monthEnd) monthOpens += Triple(row.optString("post_id"), stamp, date.toString())
                if (!streakFinished) {
                    if (expectedStreakDate == null) expectedStreakDate = if (date == today) today else today.minusDays(1)
                    val expected = expectedStreakDate!!
                    when {
                        date > expected -> Unit // duplicate opens for a day already counted, or today's open before yesterday's.
                        date == expected -> {
                            streakDates += date
                            expectedStreakDate = date.minusDays(1)
                        }
                        else -> streakFinished = true
                    }
                }
            }
            offset += page.length()
            val oldestDate = page.optJSONObject(page.length() - 1)?.optString("opened_at")?.let { ExplorationCalendarLogic.localDate(it, zone) }
            if (oldestDate == null || oldestDate < monthStart) monthFinished = true
            if (page.length() < 500) {
                streakFinished = true
                monthFinished = true
            }
        }
        val counts = linkedMapOf<String, Int>()
        monthOpens.forEach { (_, _, date) -> counts[date] = (counts[date] ?: 0) + 1 }
        val postIds = monthOpens.map { it.first }.filter(::isUuid).distinct()
        val postsById = coroutineScope {
            val semaphore = Semaphore(6)
            postIds.map { postId -> async {
                postId to semaphore.withPermit {
                    runCatching { request("/api/v1/posts/${encode(postId)}", includeSession = true) as? JSONObject }.getOrNull()
                }
            } }.awaitAll().toMap()
        }
        val records = JSONArray()
        for ((postId, stamp, date) in monthOpens) {
            val post = postsById[postId] ?: continue
            records.put(JSONObject().put("date", date).put("openedAt", stamp).put("post", post))
        }
        val days = JSONArray(); counts.forEach { (date, count) -> days.put(JSONObject().put("date", date).put("count", count)) }
        val result = JSONObject().put("month", currentMonth).put("timeZone", zone.id).put("today", today.toString())
            .put("streak", ExplorationCalendarLogic.streak(streakDates, today)).put("total", monthOpens.size).put("days", days).put("records", records)
        cache.put(key, result.toString())
        result
    }

    suspend fun cachedExplorationCalendar(userId: String, month: String? = null): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(explorationCacheKey("calendar-${month ?: "current"}", userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun explorationRoom(userId: String, code: String): JSONObject = withContext(Dispatchers.IO) {
        val key = explorationCacheKey("co-explore-${code.uppercase()}", userId)
        cache.get(key)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
    }

    suspend fun saveExplorationRoom(userId: String, code: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(explorationCacheKey("co-explore-${code.uppercase()}", userId), value.toString())
    }

    suspend fun createCoExploreRoom(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/co-explore", method = "POST", body = JSONObject().put("action", "create").toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun joinCoExploreRoom(code: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/co-explore", method = "POST", body = JSONObject().put("action", "join").put("code", code.uppercase()).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun coExploreRoom(code: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/co-explore?code=${encode(code.uppercase())}", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun pickCoExplorePost(code: String, postId: String, note: String): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/co-explore",
            method = "POST",
            body = JSONObject().put("action", "pick").put("code", code.uppercase()).put("postId", postId).put("note", note.take(180)).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun explorationChains(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-chains", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun cachedExplorationChains(userId: String): JSONObject? = withContext(Dispatchers.IO) {
        cache.get(explorationCacheKey("chains", userId))?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveExplorationChains(userId: String, value: JSONObject) = withContext(Dispatchers.IO) {
        cache.put(explorationCacheKey("chains", userId), value.toString())
    }

    suspend fun createExplorationChain(postId: String, title: String, prompt: String, content: String): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/exploration-chains",
            method = "POST",
            body = JSONObject().put("action", "create").put("postId", postId).put("title", title).put("prompt", prompt).put("content", content).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun contributeExplorationChain(chainId: String, content: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-chains", method = "POST", body = JSONObject().put("action", "contribute").put("chainId", chainId).put("content", content).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun closeExplorationChain(chainId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/exploration-chains", method = "POST", body = JSONObject().put("action", "close").put("chainId", chainId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun explorationCandidates(): List<HeikaPost> = withContext(Dispatchers.IO) {
        val payload = request("/api/demo/cards?mode=discover&limit=24", includeSession = true) as? JSONObject ?: JSONObject()
        payload.optJSONArray("items").jsonObjects().map(HeikaPost::from).filter { it.cloudId.isNotBlank() && it.id > 0 }
    }

    suspend fun uploadImage(postId: String?, uploadId: String, fileName: String, mimeType: String, bytes: ByteArray, sortOrder: Int, revisionMode: Boolean = false): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(4 * 1024 * 1024)) { "单张图片须小于 4 MB" }
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .addFormDataPart("upload_id", uploadId)
            .addFormDataPart("sort_order", sortOrder.toString())
        if (revisionMode) {
            builder.addFormDataPart("revision_post_id", postId?.takeIf(String::isNotBlank) ?: throw IOException("内容编号无效"))
        } else if (postId.isNullOrBlank()) {
            builder.addFormDataPart("staging", "1")
        } else builder.addFormDataPart("post_id", postId)
        val requestBody = builder.build()
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/media", "Bearer $token", requestBody)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "图片上传失败（${response.code()}）" })
        (root.opt("data") as? JSONObject) ?: root
    }

    suspend fun deleteUploadedImage(postId: String?, path: String) = withContext(Dispatchers.IO) {
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val fileName = path.substringAfterLast('/')
        val uploadId = fileName.substringBeforeLast('.')
        val extension = fileName.substringAfterLast('.', "")
        val mime = when (extension.lowercase()) { "jpg", "jpeg" -> "image/jpeg"; "png" -> "image/png"; "webp" -> "image/webp"; else -> throw IOException("图片路径无效") }
        val payload = JSONObject().put("upload_id", uploadId).put("file_type", mime)
        postId?.takeIf(String::isNotBlank)?.let { payload.put("post_id", it) }
        val body = payload.toString().toRequestBody(JSON)
        val response = api.delete("${BuildConfig.API_BASE_URL}/api/v1/media", "Bearer $token", body)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val json = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || json.has("error")) throw IOException(json.optString("error").ifBlank { "图片清理失败" })
    }

    suspend fun dailyState(userId: String, day: String): DailyStateEntity? = cacheDao.daily(userId, day)

    suspend fun saveDailyState(value: DailyStateEntity) = cacheDao.putDaily(value)

    suspend fun clearUserCache(userId: String) {
        cacheDao.clearDailyForUser(userId)
        cacheDao.clearFeedForUser(userId)
        recommendationCache.remove(userId)
    }

    suspend fun localPublishSnapshot(userId: String, channel: String = "community"): JSONObject? = withContext(Dispatchers.IO) {
        if (!userId.matches(Regex("[0-9a-fA-F-]{36}"))) return@withContext null
        cacheDao.publishSnapshot(publishSnapshotKey(userId, channel))?.payload?.let { runCatching { JSONObject(it) }.getOrNull() }
    }

    suspend fun saveLocalPublishSnapshot(userId: String, payload: JSONObject, channel: String = "community") = withContext(Dispatchers.IO) {
        if (!userId.matches(Regex("[0-9a-fA-F-]{36}"))) return@withContext
        cacheDao.putPublishSnapshot(com.heika.nativeapp.db.FeedCacheEntity(publishSnapshotKey(userId, channel), payload.toString(), System.currentTimeMillis()))
    }

    suspend fun clearLocalPublishSnapshot(userId: String, channel: String = "community") = withContext(Dispatchers.IO) {
        if (!userId.matches(Regex("[0-9a-fA-F-]{36}"))) return@withContext
        cacheDao.clearPublishSnapshot(publishSnapshotKey(userId, channel))
    }

    private fun publishSnapshotKey(userId: String, channel: String) = if (channel == "ai") "native-publish:ai:$userId" else "native-publish:$userId"

    private suspend fun feedCacheKey(filter: FeedFilter): String = listOf(
        filter.channel,
        filter.category?.id?.toString().orEmpty(),
        filter.topic.orEmpty(),
        filter.sort,
        filter.contentType.orEmpty(),
        filter.usageScenario.orEmpty(),
        filter.query.orEmpty(),
        // Signed-in recommendations, following feeds, and saved-state fields differ per user.
        auth.current()?.userId ?: "public",
    ).joinToString(":")

    private fun explorationCacheKey(section: String, userId: String): String = NativeCacheKeys.exploration(section, userId)

    private suspend fun request(
        path: String,
        method: String = "GET",
        body: String? = null,
        authenticated: Boolean = false,
        includeSession: Boolean = authenticated,
    ): Any? {
        require(path.startsWith('/') && !path.startsWith("//")) { "请求地址无效" }
        val url = BuildConfig.API_BASE_URL + path
        var token = if (includeSession) auth.currentToken() else null
        if (authenticated && token == null) throw IOException("请先登录后继续")
        var response = send(url, method, body, token)
        if (response.code() == 401 && token != null) {
            response.body()?.close()
            response.errorBody()?.close()
            val refreshed = auth.retryAfterUnauthorized()
            if (refreshed != null) {
                token = refreshed
                response = send(url, method, body, token)
            } else if (authenticated) {
                throw IOException("登录状态已失效，请重新登录")
            } else {
                response = send(url, method, body, null)
            }
        }
        val result = response
        val content = (if (result.isSuccessful) result.body() else result.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else runCatching { JSONTokener(content).nextValue() }.getOrElse { JSONObject() }
        if (!result.isSuccessful) {
            val errorBody = root as? JSONObject ?: JSONObject()
            val message = sequenceOf("error", "message", "details")
                .map { errorBody.optString(it) }
                .firstOrNull { it.isNotBlank() }
            val endpoint = path.substringBefore('?')
            val diagnostic = buildString {
                append("HEIKA API ").append(method).append(' ').append(endpoint)
                append(" 返回 HTTP ").append(result.code())
                message?.let { append("：").append(it) }
            }
            throw IOException(diagnostic)
        }
        if (root is JSONObject && root.has("error") && !root.isNull("error")) throw IOException(root.optString("error"))
        return if (root is JSONObject && root.has("data")) root.opt("data") else root
    }

    private val aiResourceTypes = setOf("knowledge_article", "agent", "skill", "prompt", "ai_tool", "tutorial")

    private suspend fun send(url: String, method: String, body: String?, token: String?): Response<ResponseBody> {
        val authorization = token?.let { "Bearer $it" }
        val jsonBody = body?.toRequestBody(JSON)
        return when (method) {
            "POST" -> api.post(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            "PATCH" -> api.patch(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            "DELETE" -> api.delete(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            else -> api.get(url, authorization)
        }
    }

    private fun parsePosts(source: String): List<HeikaPost> = runCatching {
        JSONArray(source).jsonObjects().map(HeikaPost::from)
    }.getOrDefault(emptyList())

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun isUuid(value: String): Boolean = value.matches(Regex("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))

    private companion object {
        const val RANKING_CACHE_MS = 5L * 60 * 1000
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}

data class FeedPageKey(
    val cursorCreatedAt: String? = null,
    val cursorPostId: String? = null,
    val page: Int = 1,
)
