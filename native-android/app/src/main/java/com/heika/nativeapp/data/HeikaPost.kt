package com.heika.nativeapp.data

import com.heika.nativeapp.BuildConfig
import org.json.JSONArray
import org.json.JSONObject

data class HeikaPost(
    val id: Int,
    val cloudId: String,
    val channel: String,
    val tag: String,
    val title: String,
    val body: String,
    val tags: List<String>,
    val author: String,
    val authorId: String?,
    val authorAvatar: String?,
    val date: String,
    val thumbnails: List<String>,
    val images: List<String>,
    val ratingAverage: Double?,
    val ratingCount: Int,
    val likeCount: Int,
    val contentType: String,
    val viewCount: Int,
    val saved: Boolean,
    val rawJson: String,
    val rarityTier: String = "pending",
    val resourceData: JSONObject = JSONObject(),
) {
    val thumbnail: String? get() = thumbnails.firstOrNull() ?: images.firstOrNull()
    val hasRating: Boolean get() = ratingCount > 0 && ratingAverage != null

    companion object {
        fun from(json: JSONObject): HeikaPost {
            val images = json.stringList("images")
            val thumbnails = json.stringList("thumbnailImages").ifEmpty {
                listOfNotNull(json.optString("image").takeIf(String::isNotBlank))
            }
            val clientId = sequenceOf(json.opt("clientId"), json.opt("client_id"), json.opt("id"))
                .mapNotNull { value -> when (value) {
                    is Number -> value.toDouble().takeIf { it.isFinite() && it % 1.0 == 0.0 && it in 1.0..Int.MAX_VALUE.toDouble() }?.toInt()
                    is String -> value.toIntOrNull()?.takeIf { it > 0 }
                    else -> null
                } }
                .firstOrNull() ?: throw IllegalArgumentException("Post payload is missing a positive client_id")
            return HeikaPost(
                // Detail API responses include both the UUID `id` and numeric `client_id`.
                // The presentation mapper uses numeric `id`, but the raw detail row is spread
                // after it and therefore restores the UUID. Never coerce that UUID to zero.
                id = clientId,
                cloudId = json.optString("cloudId").ifBlank {
                    val rawId = json.optString("id")
                    if (rawId.toIntOrNull() != null) json.optString("cloud_id") else rawId
                }.ifBlank { json.optString("cloud_id") },
                channel = json.optString("channel", "community"),
                tag = json.optString("tag", "生活"),
                title = json.optString("title", "无标题内容"),
                body = json.optString("body"),
                tags = json.stringList("topics"),
                author = json.optString("author", "黑卡编辑部"),
                authorId = json.optString("authorId").takeIf(String::isNotBlank),
                authorAvatar = json.optString("authorAvatar").takeIf(String::isNotBlank)?.toWebUrl(),
                date = json.optString("date"),
                thumbnails = thumbnails.map(String::toWebUrl),
                images = images.map(String::toWebUrl),
                ratingAverage = if (json.has("ratingAverage") && !json.isNull("ratingAverage")) json.optDouble("ratingAverage") else null,
                ratingCount = json.optInt("ratingCount"),
                likeCount = json.optInt("likeCount"),
                contentType = json.optString("contentType", "community_post"),
                viewCount = json.optInt("viewCount"),
                saved = json.optBoolean("saved"),
                rawJson = json.toString(),
                rarityTier = json.optString("rarityTier", "pending").takeIf { it in setOf("ordinary", "S", "SS", "SSS", "pending") } ?: "pending",
                resourceData = json.optJSONObject("resourceData") ?: json.optJSONObject("resource_data") ?: JSONObject(),
            )
        }
    }
}

data class HeikaCategory(val id: Int, val name: String, val parentId: Int? = null)

data class FeedFilter(
    val channel: String = "community",
    val category: HeikaCategory? = null,
    val topic: String? = null,
    val sort: String = "推荐",
    val contentType: String? = null,
)

data class FeedPage(
    val posts: List<HeikaPost>,
    val hasMore: Boolean,
    val nextCursorCreatedAt: String? = null,
    val nextCursorPostId: String? = null,
    val nextPage: Int? = null,
)

data class HeikaNotification(
    val id: String,
    val type: String,
    val title: String,
    val createdAt: String,
    val readAt: String?,
    val actorName: String,
    val actorId: String?,
    val actorAvatar: String?,
    val postTitle: String?,
    val postId: String?,
) {
    companion object {
        fun from(json: JSONObject): HeikaNotification {
            val actor = json.optJSONObject("actor")
            val post = json.optJSONObject("post")
            return HeikaNotification(
                id = json.optString("id"),
                type = json.optString("notification_type"),
                title = json.optString("title"),
                createdAt = json.optString("created_at"),
                readAt = json.optString("read_at").takeIf(String::isNotBlank),
                actorName = actor?.optString("nickname").orEmpty().ifBlank { "黑卡 HEIKA" },
                actorId = actor?.optString("id")?.takeIf(String::isNotBlank),
                actorAvatar = actor?.optString("avatar_url")?.takeIf(String::isNotBlank)?.toWebUrl(),
                postTitle = post?.optString("title")?.takeIf(String::isNotBlank),
                // The existing website's share/detail route accepts the numeric client id.
                postId = post?.optInt("id")?.takeIf { it > 0 }?.toString(),
            )
        }
    }
}

internal fun JSONObject.stringList(name: String): List<String> {
    val array = optJSONArray(name) ?: return emptyList()
    return buildList(array.length()) {
        for (index in 0 until array.length()) {
            val value = array.optString(index)
            if (value.isNotBlank()) add(value)
        }
    }
}

internal fun String.toWebUrl(): String = when {
    startsWith("https://", ignoreCase = true) -> this
    startsWith("http://", ignoreCase = true) -> this
    startsWith("/") -> "${BuildConfig.API_BASE_URL}$this"
    else -> this
}

internal fun JSONArray?.jsonObjects(): List<JSONObject> = this?.let { array -> buildList(array.length()) {
    for (index in 0 until array.length()) array.optJSONObject(index)?.let(::add)
} } ?: emptyList()
