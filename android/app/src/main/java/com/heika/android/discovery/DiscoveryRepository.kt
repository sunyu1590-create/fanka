package com.heika.android.discovery

import android.content.Context
import com.heika.android.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

internal data class DiscoveryQuery(
    val channel: DiscoveryChannel,
    val category: DiscoveryCategory?,
    val topic: DiscoveryCategory?,
    val sort: DiscoverySort,
    val contentType: String?,
    val cursor: DiscoveryCursor?,
    val page: Int,
    val userId: String?,
    val token: String?,
    val personalization: DiscoveryPersonalization,
)

internal class DiscoveryRepository(context: Context) {
    private val cache = DiscoveryCache(context.applicationContext)

    suspend fun categories(channel: DiscoveryChannel, kind: String): List<DiscoveryCategory> = withContext(Dispatchers.IO) {
        val url = endpoint("/api/v1/categories", mapOf("channel" to channel.apiValue(), "kind" to kind))
        parseArray(get(url, null).optJSONObject("data")?.optJSONArray("items"))
            .mapNotNull(DiscoveryJson::category)
    }

    suspend fun cached(key: String, channel: DiscoveryChannel) = withContext(Dispatchers.IO) {
        cache.read(key, channel)
    }

    suspend fun saveSnapshot(key: String, userId: String?, page: DiscoveryPage, items: List<DiscoveryPost>) = withContext(Dispatchers.IO) {
        cache.write(key, userId ?: "guest", page, items)
    }

    suspend fun clearUserCache(userId: String) = withContext(Dispatchers.IO) { cache.clearUser(userId) }

    fun close() = cache.close()

    suspend fun page(query: DiscoveryQuery): DiscoveryPage = withContext(Dispatchers.IO) {
        when (query.channel) {
            DiscoveryChannel.COMMUNITY -> communityPage(query)
            DiscoveryChannel.AI -> aiPage(query)
        }
    }

    suspend fun changeInteraction(post: DiscoveryPost, action: String, value: Boolean, token: String) = withContext(Dispatchers.IO) {
        require(action == "like" || action == "bookmark")
        postJson("/api/v1/library-state", token, JSONObject().put("action", action).put("id", post.id).put("value", value))
    }

    private suspend fun communityPage(query: DiscoveryQuery): DiscoveryPage {
        val collected = ArrayList<DiscoveryPost>(PAGE_SIZE)
        var cursor = query.cursor
        var page = query.page
        var hasMore = true
        var guard = 0
        do {
            val params = linkedMapOf("mode" to "discover", "limit" to PAGE_SIZE.toString())
            query.category?.let { params["tag"] = it.name }
            if (query.sort == DiscoverySort.FOLLOWING) params["following"] = "1"
            cursor?.let {
                params["cursorCreatedAt"] = it.createdAt
                params["cursorPostId"] = it.postId
            }
            val payload = get(endpoint("/api/demo/cards", params), query.token).optJSONObject("data")
                ?: throw DiscoveryNetworkException("内容格式无效")
            val rows = payload.optJSONArray("items") ?: JSONArray()
            val parsed = (0 until rows.length()).mapNotNull { index ->
                DiscoveryJson.post(rows.optJSONObject(index) ?: return@mapNotNull null, DiscoveryChannel.COMMUNITY)
            }
            val nextCursor = payload.optJSONObject("cursor")?.let {
                val createdAt = it.optString("createdAt")
                val id = it.optString("postId")
                if (createdAt.isNotBlank() && id.isNotBlank()) DiscoveryCursor(createdAt, id) else null
            }
            hasMore = payload.optBoolean("hasMore", false)
            cursor = nextCursor
            page += 1
            collected += if (query.topic == null) parsed else parsed.filter { query.topic.name in it.topics }
            guard++
        } while (query.topic != null && collected.size < PAGE_SIZE && hasMore && guard < MAX_TOPIC_SCAN_PAGES)

        val sorted = when (query.sort) {
            DiscoverySort.LATEST -> collected.sortedWith(compareByDescending<DiscoveryPost> { it.createdAt }.thenByDescending { it.id })
            DiscoverySort.HIGH_SCORE -> collected.sortedWith(
                compareByDescending<DiscoveryPost> { if (it.ratingCount > 0) it.ratingAverage else -1.0 }
                    .thenByDescending { it.ratingCount }.thenByDescending { it.createdAt },
            )
            DiscoverySort.FEATURED -> rankFeatured(collected, query.personalization)
            else -> collected
        }
        val withState = hydrateInteractions(sorted, query.token)
        DiscoveryPage(withState, cursor, page, hasMore)
    }

    private suspend fun aiPage(query: DiscoveryQuery): DiscoveryPage {
        val params = linkedMapOf(
            "limit" to PAGE_SIZE.toString(),
            "page" to (query.page + 1).toString(),
            "sort" to when (query.sort) {
                DiscoverySort.FEATURED -> "featured"
                DiscoverySort.HIGH_SCORE -> "popular"
                else -> "latest"
            },
        )
        query.category?.id?.takeIf(String::isNotBlank)?.let { params["category"] = it }
        query.topic?.let { params["topic"] = it.name }
        query.contentType?.let { params["type"] = it }
        val payload = get(endpoint("/api/v1/ai-space", params), query.token).optJSONObject("data")
            ?: throw DiscoveryNetworkException("AI 内容格式无效")
        val rows = payload.optJSONArray("items") ?: JSONArray()
        val items = (0 until rows.length()).mapNotNull { index ->
            DiscoveryJson.post(rows.optJSONObject(index) ?: return@mapNotNull null, DiscoveryChannel.AI)
        }
        val total = payload.optInt("total", (query.page + 1) * PAGE_SIZE)
        val nextPage = query.page + 1
        val hasMore = nextPage * PAGE_SIZE < total
        return DiscoveryPage(hydrateInteractions(items, query.token), null, nextPage, hasMore)
    }

    private suspend fun hydrateInteractions(items: List<DiscoveryPost>, token: String?): List<DiscoveryPost> {
        if (items.isEmpty() || token.isNullOrBlank()) return items
        val ids = items.map { it.id }.distinct().take(100).joinToString(",")
        val data = runCatching {
            get(endpoint("/api/v1/me/interactions", mapOf("ids" to ids)), token).optJSONObject("data")
        }.getOrNull() ?: return items
        return items.map { item ->
            val state = data.optJSONObject(item.id.toString()) ?: return@map item
            item.copy(liked = state.optBoolean("liked"), saved = state.optBoolean("saved"))
        }
    }

    private fun rankFeatured(items: List<DiscoveryPost>, personalization: DiscoveryPersonalization): List<DiscoveryPost> {
        if (items.size < 2) return items
        val interests = personalization.interests.toSet()
        val viewed = personalization.viewedIds
        val personalByCategory = items.mapNotNull { post ->
            personalization.personalRatings[post.id]?.let { post.category to it }
        }.groupBy({ it.first }, { it.second })
        val scores = items.associate { post ->
            val personalRatings = personalByCategory[post.category].orEmpty()
            val personalAverage = if (personalRatings.isEmpty()) 3.0 else (personalRatings.sum() + 6.0) / (personalRatings.size + 2.0)
            val communityAverage = if (post.ratingCount > 0) (post.ratingAverage * post.ratingCount + 15.0) / (post.ratingCount + 5.0) else 3.0
            val date = runCatching { java.time.LocalDate.parse(post.createdAt.take(10)) }.getOrNull()
            val ageDays = date?.let { java.time.temporal.ChronoUnit.DAYS.between(it, java.time.LocalDate.now()).toDouble().coerceAtLeast(0.0) }
            val freshness = ageDays?.let { (1.0 - it / 45.0).coerceIn(0.0, 1.0) * 0.2 } ?: 0.0
            val score = (if (post.category in interests) 1.0 else 0.0) +
                (personalAverage - 3.0) * 0.55 + (communityAverage - 3.0) * 0.35 + freshness -
                (if (post.id in viewed) 0.28 else 0.0)
            post.id to score
        }
        val byCategory = items.sortedWith(
            compareByDescending<DiscoveryPost> { scores[it.id] ?: 0.0 }
                .thenByDescending { it.createdAt }
                .thenBy { it.id },
        ).groupBy { it.category }.mapValues { it.value.toMutableList() }
        val categoryCounts = mutableMapOf<String, Int>()
        val ranked = ArrayList<DiscoveryPost>(items.size)
        while (ranked.size < items.size) {
            val next = byCategory.entries.asSequence()
                .filter { it.value.isNotEmpty() }
                .map { (category, queue) ->
                    val post = queue.first()
                    Triple(category, post, (scores[post.id] ?: 0.0) - (categoryCounts[category] ?: 0) * 0.18)
                }
                .sortedWith(compareByDescending<Triple<String, DiscoveryPost, Double>> { it.third }.thenBy { it.second.id })
                .firstOrNull() ?: break
            byCategory.getValue(next.first).removeAt(0)
            ranked += next.second
            categoryCounts[next.first] = (categoryCounts[next.first] ?: 0) + 1
        }
        return ranked
    }

    private fun endpoint(path: String, query: Map<String, String>): String {
        val encoded = query.entries.joinToString("&") { (key, value) -> "${encode(key)}=${encode(value)}" }
        return BuildConfig.WEB_APP_ORIGIN.trimEnd('/') + path + if (encoded.isEmpty()) "" else "?$encoded"
    }

    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun get(url: String, token: String?): JSONObject = request(url, token, null)

    private fun postJson(path: String, token: String, payload: JSONObject): JSONObject = request(
        BuildConfig.WEB_APP_ORIGIN.trimEnd('/') + path,
        token,
        payload.toString(),
    )

    private fun request(url: String, token: String?, body: String?): JSONObject {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-cache")
            if (!token.isNullOrBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use(BufferedReader::readText).orEmpty()
            if (status !in 200..299) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrDefault("")
                throw DiscoveryNetworkException(message.ifBlank { "服务暂时不可用（$status）" }, status)
            }
            return runCatching { JSONObject(text) }.getOrElse { throw DiscoveryNetworkException("服务返回的数据无法读取") }
        } catch (error: DiscoveryNetworkException) {
            throw error
        } catch (error: Exception) {
            throw DiscoveryNetworkException("连接暂时中断，请检查网络后重试", cause = error)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseArray(array: JSONArray?): List<JSONObject> = array?.let { value ->
        (0 until value.length()).mapNotNull(value::optJSONObject)
    }.orEmpty()

    companion object {
        const val PAGE_SIZE = 24
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val READ_TIMEOUT_MS = 18_000
        private const val MAX_TOPIC_SCAN_PAGES = 4
    }
}

internal class DiscoveryNetworkException(
    message: String,
    val statusCode: Int? = null,
    cause: Throwable? = null,
) : Exception(message, cause)

private fun DiscoveryChannel.apiValue() = when (this) {
    DiscoveryChannel.COMMUNITY -> "community"
    DiscoveryChannel.AI -> "ai"
}
