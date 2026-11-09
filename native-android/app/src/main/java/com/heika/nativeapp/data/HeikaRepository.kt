package com.heika.nativeapp.data

import com.heika.nativeapp.BuildConfig
import com.heika.nativeapp.auth.AuthRepository
import com.heika.nativeapp.db.DailyStateEntity
import com.heika.nativeapp.db.FeedCache
import com.heika.nativeapp.db.HeikaCacheDao
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
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
            val cached = cache.get(cacheKey)?.let(::parsePosts).orEmpty()
            if (cached.isEmpty()) throw error
            FeedPage(cached, hasMore = false)
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
        }
        try {
            val payload = request(query, includeSession = true) as? JSONObject ?: JSONObject()
            val posts = payload.optJSONArray("items").jsonObjects().map(HeikaPost::from)
            val total = payload.optInt("total")
            if (page == 1) cache.put(cacheKey, JSONArray(posts.map { JSONObject(it.rawJson) }).toString())
            FeedPage(posts, page * 24 < total, nextPage = page + 1)
        } catch (error: Exception) {
            if (page != 1) throw error
            val cached = cache.get(cacheKey)?.let(::parsePosts).orEmpty()
            if (cached.isEmpty()) throw error
            FeedPage(cached, hasMore = false)
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
        HeikaPost.from(json)
    }

    suspend fun postDetailByKey(key: String): HeikaPost = withContext(Dispatchers.IO) {
        val id = key.removePrefix("client-").toIntOrNull() ?: 0
        val value = fetchPostDetail(key, id) as? JSONObject ?: throw IOException("内容暂不可用")
        HeikaPost.from(value)
    }

    private suspend fun fetchPostDetail(cloudId: String, clientId: Int): Any? = if (isUuid(cloudId)) {
        request("/api/v1/posts/${encode(cloudId)}", includeSession = true)
    } else {
        require(clientId > 0) { "内容编号无效" }
        request("/api/demo/cards", method = "POST", body = JSONObject().put("id", clientId).toString())
    }

    suspend fun comments(postId: String, page: Int = 1): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/posts/${encode(postId)}/comments?page=${page.coerceAtLeast(1)}&limit=30", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun addComment(postId: String, body: String, parentId: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("body", body)
        parentId?.let { payload.put("parent_id", it) }
        request("/api/v1/posts/${encode(postId)}/comments", method = "POST", body = payload.toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun reportPost(postId: String, reason: String, note: String): JSONObject = withContext(Dispatchers.IO) {
        request(
            "/api/v1/reports",
            method = "POST",
            body = JSONObject().put("post_id", postId).put("reason", reason).put("note", note.take(300)).toString(),
            authenticated = true,
        ) as? JSONObject ?: JSONObject()
    }

    suspend fun setPostInteraction(id: Int, action: String, value: Boolean): JSONObject = withContext(Dispatchers.IO) {
        require(action == "like" || action == "bookmark")
        request("/api/v1/library-state", method = "POST", body = JSONObject().put("action", action).put("id", id).put("value", value).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun ratePost(id: Int, rating: Int): JSONObject = withContext(Dispatchers.IO) {
        require(rating in 1..5)
        request("/api/v1/posts/$id/rating", method = "POST", body = JSONObject().put("rating", rating).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun interactionState(id: Int): JSONObject = withContext(Dispatchers.IO) {
        val value = request("/api/v1/me/interactions?ids=$id", includeSession = true) as? JSONObject ?: JSONObject()
        value.optJSONObject(id.toString()) ?: JSONObject()
    }

    suspend fun ratingState(id: Int): JSONObject = withContext(Dispatchers.IO) {
        val value = request("/api/v1/ratings?ids=$id", includeSession = true) as? JSONObject ?: JSONObject()
        value.optJSONObject(id.toString()) ?: JSONObject()
    }

    suspend fun toggleCreatorFollow(creatorId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/creator-follows", method = "POST", body = JSONObject().put("creatorId", creatorId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun myProfile(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun updateMyProfile(nickname: String, bio: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/me", method = "PATCH", body = JSONObject().put("nickname", nickname).put("bio", bio).toString(), authenticated = true) as? JSONObject ?: JSONObject()
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

    suspend fun search(query: String, kind: String = "content"): JSONObject = withContext(Dispatchers.IO) {
        require(kind == "content" || kind == "people")
        request("/api/v1/search?q=${encode(query.take(60))}&kind=$kind&page=1&limit=24", includeSession = true) as? JSONObject ?: JSONObject()
    }

    suspend fun inbox(): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/messages", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun conversation(id: String, before: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val cursor = before?.let { "&before=${encode(it)}" }.orEmpty()
        request("/api/v1/messages?conversation=${encode(id)}$cursor", authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun searchPeople(query: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/messages", method = "POST", body = JSONObject().put("action", "search").put("query", query).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun openConversation(peerId: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/messages", method = "POST", body = JSONObject().put("action", "open").put("peer", peerId).toString(), authenticated = true) as? JSONObject ?: JSONObject()
    }

    suspend fun sendMessage(conversationId: String, content: String, nonce: String): JSONObject = withContext(Dispatchers.IO) {
        request("/api/v1/messages", method = "POST", body = JSONObject().put("action", "send").put("conversation", conversationId).put("content", content).put("nonce", nonce).toString(), authenticated = true) as? JSONObject ?: JSONObject()
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

    suspend fun uploadImage(postId: String, uploadId: String, fileName: String, mimeType: String, bytes: ByteArray, sortOrder: Int): JSONObject = withContext(Dispatchers.IO) {
        require(bytes.size in 1..(4 * 1024 * 1024)) { "单张图片须小于 4 MB" }
        val requestBody = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .addFormDataPart("post_id", postId)
            .addFormDataPart("upload_id", uploadId)
            .addFormDataPart("sort_order", sortOrder.toString())
            .build()
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val response = api.post("${BuildConfig.API_BASE_URL}/api/v1/media", "Bearer $token", requestBody)
        val content = (if (response.isSuccessful) response.body() else response.errorBody())?.use { it.string() }.orEmpty()
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue() as? JSONObject ?: JSONObject()
        if (!response.isSuccessful || root.has("error")) throw IOException(root.optString("error").ifBlank { "图片上传失败（${response.code()}）" })
        (root.opt("data") as? JSONObject) ?: root
    }

    suspend fun deleteUploadedImage(postId: String, path: String) = withContext(Dispatchers.IO) {
        val token = auth.currentToken() ?: throw IOException("请先登录后继续")
        val fileName = path.substringAfterLast('/')
        val uploadId = fileName.substringBeforeLast('.')
        val extension = fileName.substringAfterLast('.', "")
        val mime = when (extension.lowercase()) { "jpg", "jpeg" -> "image/jpeg"; "png" -> "image/png"; "webp" -> "image/webp"; else -> throw IOException("图片路径无效") }
        val body = JSONObject().put("upload_id", uploadId).put("file_type", mime).put("post_id", postId).toString().toRequestBody(JSON)
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

    private suspend fun feedCacheKey(filter: FeedFilter): String = listOf(
        filter.channel,
        filter.category?.id?.toString().orEmpty(),
        filter.topic.orEmpty(),
        filter.sort,
        filter.contentType.orEmpty(),
        // Signed-in recommendations, following feeds, and saved-state fields differ per user.
        auth.current()?.userId ?: "public",
    ).joinToString(":")

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
        val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue()
        if (!result.isSuccessful) {
            val message = (root as? JSONObject)?.optString("error").orEmpty()
            throw IOException(message.ifBlank { "请求失败（${result.code()}）" })
        }
        if (root is JSONObject && root.has("error") && !root.isNull("error")) throw IOException(root.optString("error"))
        return if (root is JSONObject && root.has("data")) root.opt("data") else root
    }

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
