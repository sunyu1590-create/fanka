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
            response.close()
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
        return response.use { result ->
            val content = (if (result.isSuccessful) result.body() else result.errorBody())?.use { it.string() }.orEmpty()
            val root = if (content.isBlank()) JSONObject() else JSONTokener(content).nextValue()
            if (!result.isSuccessful) {
                val message = (root as? JSONObject)?.optString("error").orEmpty()
                throw IOException(message.ifBlank { "请求失败（${result.code()}）" })
            }
            if (root is JSONObject && root.has("error") && !root.isNull("error")) throw IOException(root.optString("error"))
            if (root is JSONObject && root.has("data")) root.opt("data") else root
        }
    }

    private suspend fun send(url: String, method: String, body: String?, token: String?): Response<ResponseBody> {
        val authorization = token?.let { "Bearer $it" }
        val jsonBody = body?.toRequestBody(JSON)
        return when (method) {
            "POST" -> api.post(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            "PATCH" -> api.patch(url, authorization, jsonBody ?: "{}".toRequestBody(JSON))
            else -> api.get(url, authorization)
        }
    }

    private fun parsePosts(source: String): List<HeikaPost> = runCatching {
        JSONArray(source).jsonObjects().map(HeikaPost::from)
    }.getOrDefault(emptyList())

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())

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
