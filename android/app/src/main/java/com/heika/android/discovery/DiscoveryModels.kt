package com.heika.android.discovery

import org.json.JSONArray
import org.json.JSONObject
import com.heika.android.BuildConfig

internal enum class DiscoveryChannel { COMMUNITY, AI }
internal enum class DiscoverySort(val label: String, val apiValue: String) {
    FEATURED("推荐", "featured"), LATEST("最新", "latest"), HIGH_SCORE("高评分", "popular"), FOLLOWING("关注", "following");

    companion object {
        fun community(value: String) = when (value) {
            "最新" -> LATEST
            "高评分" -> HIGH_SCORE
            "关注" -> FOLLOWING
            else -> FEATURED
        }

        fun ai(value: String) = when (value) {
            "最新" -> LATEST
            "热门" -> HIGH_SCORE
            else -> FEATURED
        }
    }
}

internal data class DiscoveryCategory(val id: String, val name: String, val kind: String)

internal data class DiscoveryPersonalization(
    val interests: List<String> = emptyList(),
    val viewedIds: Set<Long> = emptySet(),
    val personalRatings: Map<Long, Int> = emptyMap(),
)

internal data class DiscoveryPost(
    val id: Long,
    val cloudId: String,
    val title: String,
    val body: String,
    val category: String,
    val topics: List<String>,
    val imageUrl: String?,
    val author: String,
    val authorId: String?,
    val authorAvatar: String?,
    val likeCount: Int,
    val ratingAverage: Double,
    val ratingCount: Int,
    val createdAt: String,
    val contentType: String,
    val liked: Boolean = false,
    val saved: Boolean = false,
) {
    val stableKey: String get() = cloudId.ifBlank { "${id}:$contentType" }
}

internal data class DiscoveryCursor(val createdAt: String, val postId: String)

internal data class DiscoveryFeedState(
    val channel: DiscoveryChannel,
    val categories: List<DiscoveryCategory> = emptyList(),
    val tags: List<DiscoveryCategory> = emptyList(),
    val selectedCategory: String = "全部",
    val selectedTopic: String? = null,
    val selectedContentType: String? = null,
    val sort: DiscoverySort = DiscoverySort.FEATURED,
    val items: List<DiscoveryPost> = emptyList(),
    val cursor: DiscoveryCursor? = null,
    val page: Int = 0,
    val hasMore: Boolean = true,
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
)

internal data class DiscoveryPage(
    val items: List<DiscoveryPost>,
    val cursor: DiscoveryCursor?,
    val page: Int,
    val hasMore: Boolean,
)

internal object DiscoveryJson {
    fun category(json: JSONObject): DiscoveryCategory? {
        val name = json.optString("name").trim()
        if (name.isEmpty()) return null
        return DiscoveryCategory(json.optString("id"), name, json.optString("kind"))
    }

    fun post(json: JSONObject, channel: DiscoveryChannel): DiscoveryPost? {
        val id = json.optLong("id", -1L)
        if (id < 1L) return null
        val images = json.optJSONArray("thumbnailImages") ?: json.optJSONArray("images")
        val image = normalizeImage(images?.optString(0)?.takeIf { it.isNotBlank() })
            ?: normalizeImage(json.optString("image").takeIf { it.isNotBlank() })
        val topics = json.optJSONArray("topics").asStringList()
        return DiscoveryPost(
            id = id,
            cloudId = json.optString("cloudId"),
            title = json.optString("title").trim().ifBlank { "未命名内容" },
            body = json.optString("body").trim(),
            category = json.optString("tag").trim().ifBlank { "生活" },
            topics = topics,
            imageUrl = image,
            author = json.optString("author").trim().ifBlank { "黑卡编辑部" },
            authorId = json.optString("authorId").takeIf { it.isNotBlank() },
            authorAvatar = normalizeImage(json.optString("authorAvatar").takeIf { it.isNotBlank() }),
            likeCount = json.optInt("likeCount", 0).coerceAtLeast(0),
            ratingAverage = json.optDouble("ratingAverage", 0.0).coerceIn(0.0, 5.0),
            ratingCount = json.optInt("ratingCount", 0).coerceAtLeast(0),
            createdAt = json.optString("date").ifBlank { json.optString("created_at") },
            contentType = json.optString("contentType").ifBlank {
                if (channel == DiscoveryChannel.AI) "knowledge_article" else "community_post"
            },
            liked = json.optBoolean("liked", false),
            saved = json.optBoolean("saved", false),
        )
    }

    fun encodePosts(items: List<DiscoveryPost>): String = JSONArray().apply {
        items.forEach { post ->
            put(JSONObject()
                .put("id", post.id).put("cloudId", post.cloudId)
                .put("title", post.title).put("body", post.body).put("category", post.category)
                .put("topics", JSONArray(post.topics)).put("imageUrl", post.imageUrl)
                .put("author", post.author).put("authorId", post.authorId).put("authorAvatar", post.authorAvatar)
                .put("likeCount", post.likeCount).put("ratingAverage", post.ratingAverage)
                .put("ratingCount", post.ratingCount).put("createdAt", post.createdAt)
                .put("contentType", post.contentType).put("liked", post.liked).put("saved", post.saved))
        }
    }.toString()

    fun decodePosts(raw: String, channel: DiscoveryChannel): List<DiscoveryPost> {
        val array = JSONArray(raw)
        return (0 until array.length()).mapNotNull { index ->
            val row = array.optJSONObject(index) ?: return@mapNotNull null
            val id = row.optLong("id", -1L)
            if (id < 1) return@mapNotNull null
            DiscoveryPost(
                id, row.optString("cloudId"), row.optString("title"), row.optString("body"),
                row.optString("category"), row.optJSONArray("topics").asStringList(),
                normalizeImage(row.optString("imageUrl").takeIf(String::isNotBlank)),
                row.optString("author"), row.optString("authorId").takeIf(String::isNotBlank),
                normalizeImage(row.optString("authorAvatar").takeIf(String::isNotBlank)),
                row.optInt("likeCount"), row.optDouble("ratingAverage"), row.optInt("ratingCount"),
                row.optString("createdAt"), row.optString("contentType"), row.optBoolean("liked"), row.optBoolean("saved"),
            )
        }
    }

    fun normalizeImage(source: String?): String? {
        if (source.isNullOrBlank()) return null
        val parsed = runCatching { android.net.Uri.parse(source) }.getOrNull() ?: return null
        val host = parsed.host.orEmpty().lowercase()
        if (host == "images.unsplash.com") {
            return parsed.buildUpon().clearQuery()
                .appendQueryParameter("auto", "format")
                .appendQueryParameter("w", "640").appendQueryParameter("q", "76").build().toString()
        }
        if (parsed.path == "/api/v1/media" && parsed.getQueryParameter("path") != null) {
            return stableMediaUrl(parsed.getQueryParameter("path").orEmpty())
        }
        if (host.isNotEmpty() && parsed.path?.contains("/storage/v1/object/sign/post-covers/") == true) {
            val pathPart = parsed.path.orEmpty().substringAfter("/storage/v1/object/sign/post-covers/")
            val decoded = runCatching { java.net.URLDecoder.decode(pathPart, Charsets.UTF_8.name()) }.getOrDefault(pathPart)
            return stableMediaUrl(decoded)
        }
        if (parsed.scheme.isNullOrBlank() && parsed.path?.startsWith("/") == true) {
            return android.net.Uri.parse(BuildConfig.WEB_APP_ORIGIN).buildUpon()
                .appendEncodedPath(parsed.encodedPath?.trimStart('/').orEmpty())
                .encodedQuery(parsed.encodedQuery)
                .build().toString()
        }
        return source.takeIf { parsed.scheme == "https" }
    }

    private fun stableMediaUrl(path: String): String {
        val builder = android.net.Uri.parse(BuildConfig.WEB_APP_ORIGIN).buildUpon()
            .appendPath("api").appendPath("v1").appendPath("media")
            .appendQueryParameter("path", path)
            .appendQueryParameter("redirect", "1")
        if (!path.endsWith("-480.webp", true) && !path.endsWith("-960.webp", true)) {
            builder.appendQueryParameter("variant", "feed")
        }
        return builder.build().toString()
    }

    private fun JSONArray?.asStringList(): List<String> {
        if (this == null) return emptyList()
        return (0 until length()).mapNotNull { optString(it).takeIf(String::isNotBlank) }
    }
}
