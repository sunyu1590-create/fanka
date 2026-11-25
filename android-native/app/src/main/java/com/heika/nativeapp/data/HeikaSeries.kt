package com.heika.nativeapp.data

import org.json.JSONArray
import org.json.JSONObject

/** 合集卡片：频道、精选、书架、推荐、搜索结果共用同一结构。 */
data class HeikaSeriesCard(
    val id: String,
    val title: String,
    val description: String,
    val coverUrl: String?,
    val kind: String,
    val channel: String,
    val categoryName: String?,
    val status: String,
    val updatedAt: String,
    val createdAt: String,
    val authorId: String?,
    val authorName: String,
    val authorAvatar: String?,
    val chapters: Int,
    val followCount: Int,
    val hot: Double,
    val rank: Int = 0,
    val reason: String? = null,
    val readCount: Int = 0,
    val progressPercent: Int = 0,
    val lastPostId: String? = null,
) {
    val kindLabel: String
        get() = when (kind) {
            "tutorial" -> "教程"
            "resource" -> "资源"
            else -> "连载"
        }
    val ongoing: Boolean get() = status != "completed"

    companion object {
        fun from(json: JSONObject): HeikaSeriesCard {
            val author = json.optJSONObject("author")
            val progress = json.optJSONObject("progress")
            return HeikaSeriesCard(
                id = json.optString("id"),
                title = json.optString("title"),
                description = json.optString("description"),
                coverUrl = json.optString("coverUrl").takeIf(String::isNotBlank)?.toWebUrl(),
                kind = json.optString("kind", "serial"),
                channel = json.optString("channel", "community"),
                categoryName = json.optString("categoryName").takeIf(String::isNotBlank),
                status = json.optString("status", "ongoing"),
                updatedAt = json.optString("updatedAt"),
                createdAt = json.optString("createdAt"),
                authorId = author?.optString("id")?.takeIf(String::isNotBlank),
                authorName = author?.optString("nickname").orEmpty().ifBlank { "黑卡作者" },
                authorAvatar = author?.optString("avatarUrl")?.takeIf(String::isNotBlank)?.toWebUrl(),
                chapters = json.optInt("chapters"),
                followCount = json.optInt("followCount"),
                hot = json.optDouble("hot", 0.0),
                rank = json.optInt("rank"),
                reason = json.optString("reason").takeIf(String::isNotBlank),
                readCount = progress?.optInt("read") ?: 0,
                progressPercent = progress?.optInt("percent") ?: 0,
                lastPostId = progress?.optString("lastPostId")?.takeIf(String::isNotBlank),
            )
        }

        fun list(array: JSONArray?): List<HeikaSeriesCard> =
            (0 until (array?.length() ?: 0)).mapNotNull { index ->
                array?.optJSONObject(index)?.let(::from)
            }
    }
}

/** 合集频道首页数据：各分区按真实数量自适应，前端不补假数据。 */
data class HeikaSeriesDiscover(
    val featured: List<HeikaSeriesCard> = emptyList(),
    val featuredSource: String? = null,
    val trending: List<HeikaSeriesCard> = emptyList(),
    val continueReading: List<HeikaSeriesCard> = emptyList(),
    val updated: List<HeikaSeriesCard> = emptyList(),
    val recommended: List<HeikaSeriesCard> = emptyList(),
    val recommendedColdStart: Boolean = true,
    val all: List<HeikaSeriesCard> = emptyList(),
    val categories: List<Pair<Int, String>> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val hasMore: Boolean = false,
) {
    companion object {
        fun from(json: JSONObject): HeikaSeriesDiscover {
            val counts = json.optJSONObject("counts")
            val categories = json.optJSONArray("categories")
            return HeikaSeriesDiscover(
                featured = HeikaSeriesCard.list(json.optJSONArray("featured")),
                featuredSource = json.optString("featuredSource").takeIf(String::isNotBlank),
                trending = HeikaSeriesCard.list(json.optJSONArray("trending")),
                continueReading = HeikaSeriesCard.list(json.optJSONArray("continueReading")),
                updated = HeikaSeriesCard.list(json.optJSONArray("updated")),
                recommended = HeikaSeriesCard.list(json.optJSONArray("recommended")),
                recommendedColdStart = json.optJSONObject("recommendedMeta")?.optBoolean("coldStart") ?: true,
                all = HeikaSeriesCard.list(json.optJSONArray("all")),
                categories = (0 until (categories?.length() ?: 0)).mapNotNull { index ->
                    categories?.optJSONObject(index)?.let { row -> row.optInt("id") to row.optString("name") }
                },
                total = counts?.optInt("total") ?: json.optInt("total"),
                page = json.optInt("page", 1),
                hasMore = json.optBoolean("hasMore"),
            )
        }
    }
}

/** 榜单条目：作品与合集同结构，`type` 区分。 */
data class HeikaRankItem(
    val type: String,
    val id: String,
    val title: String,
    val subtitle: String,
    val cover: String?,
    val tag: String?,
    val author: String?,
    val score: Double,
    val rank: Int,
    val clientId: Int? = null,
)

/** 关联内容里的一张作品卡（与合集卡不同，只有展示所需字段）。 */
data class HeikaRelatedPost(
    val id: String,
    val title: String,
    val cover: String?,
    val channel: String,
    val contentType: String,
    val tag: String?,
    val author: String?,
    val date: String,
)

/** 正文后的关联内容：所属合集、同主题、作者其他、AI 资源、话题。 */
data class HeikaRelated(
    val series: HeikaRelatedSeries? = null,
    val sameTag: List<HeikaRelatedPost> = emptyList(),
    val authorPosts: List<HeikaRelatedPost> = emptyList(),
    val aiResources: List<HeikaRelatedPost> = emptyList(),
    val topics: List<Pair<Int, String>> = emptyList(),
)

data class HeikaRelatedSeries(
    val id: String,
    val title: String,
    val chapters: Int,
    val position: Int,
    val prevId: String?,
    val nextId: String?,
    val prevTitle: String? = null,
    val nextTitle: String? = null,
)

/** 搜索建议：联想词 + 可选的纠错提示。 */
data class HeikaSuggestions(
    val query: String,
    val items: List<String> = emptyList(),
    val corrected: String? = null,
)

/** 关联内容解析：服务端已按真实关联度排好序，这里只做结构映射。 */
fun relatedFrom(json: JSONObject): HeikaRelated {
    fun posts(array: JSONArray?): List<HeikaRelatedPost> = (0 until (array?.length() ?: 0)).mapNotNull { index ->
        array?.optJSONObject(index)?.let { row ->
            HeikaRelatedPost(
                id = row.optString("id"),
                title = row.optString("title"),
                cover = row.optString("cover").takeIf(String::isNotBlank)?.toWebUrl(),
                channel = row.optString("channel", "community"),
                contentType = row.optString("contentType"),
                tag = row.optString("tag").takeIf(String::isNotBlank),
                author = row.optString("author").takeIf(String::isNotBlank),
                date = row.optString("date"),
            )
        }
    }
    val seriesRow = json.optJSONObject("series")
    val topics = json.optJSONArray("topics")
    return HeikaRelated(
        series = seriesRow?.let { row ->
            HeikaRelatedSeries(
                id = row.optString("id"),
                title = row.optString("title"),
                chapters = row.optInt("chapters"),
                position = row.optInt("position"),
                prevId = row.optJSONObject("prev")?.optString("id"),
                nextId = row.optJSONObject("next")?.optString("id"),
                prevTitle = row.optJSONObject("prev")?.optString("title"),
                nextTitle = row.optJSONObject("next")?.optString("title"),
            )
        },
        sameTag = posts(json.optJSONArray("sameTag")),
        authorPosts = posts(json.optJSONArray("authorPosts")),
        aiResources = posts(json.optJSONArray("aiResources")),
        topics = (0 until (topics?.length() ?: 0)).mapNotNull { index ->
            topics?.optJSONObject(index)?.let { row -> row.optInt("id") to row.optString("name") }
        },
    )
}

/** 榜单：`rankings` 是 榜单键 → 条目列表，rank 由服务端给出。 */
fun rankingsFrom(json: JSONObject): Map<String, List<HeikaRankItem>> {
    val rows = json.optJSONObject("rankings") ?: return emptyMap()
    val result = linkedMapOf<String, List<HeikaRankItem>>()
    rows.keys().forEach { key ->
        val items = rows.optJSONArray(key)
        result[key] = (0 until (items?.length() ?: 0)).mapNotNull { index ->
            items?.optJSONObject(index)?.let { row ->
                HeikaRankItem(
                    type = row.optString("type", "post"),
                    id = row.optString("id"),
                    title = row.optString("title"),
                    subtitle = row.optString("subtitle"),
                    cover = row.optString("cover").takeIf(String::isNotBlank)?.toWebUrl(),
                    tag = row.optString("tag").takeIf(String::isNotBlank),
                    author = row.optJSONObject("author")?.optString("name")?.takeIf(String::isNotBlank),
                    score = row.optDouble("s72", 0.0),
                    rank = row.optInt("rank", index + 1),
                    clientId = row.optInt("clientId").takeIf { it > 0 },
                )
            }
        }
    }
    return result
}

/** 推荐结果：`items` 是合集或作品，按类型分流。 */
fun recommendationSeriesFrom(json: JSONObject): List<HeikaSeriesCard> =
    HeikaSeriesCard.list(json.optJSONArray("items"))

fun recommendationPostsFrom(json: JSONObject): List<HeikaRelatedPost> =
    (0 until (json.optJSONArray("items")?.length() ?: 0)).mapNotNull { index ->
        json.optJSONArray("items")?.optJSONObject(index)?.let { row ->
            HeikaRelatedPost(
                id = row.optString("id"),
                title = row.optString("title"),
                cover = row.optString("cover").takeIf(String::isNotBlank)?.toWebUrl(),
                channel = row.optString("channel", "community"),
                contentType = row.optString("contentType"),
                tag = row.optString("tag").takeIf(String::isNotBlank),
                author = row.optJSONObject("author")?.optString("name")?.takeIf(String::isNotBlank),
                date = row.optString("createdAt").take(10),
            )
        }
    }
