package com.heika.nativeapp.data

import org.json.JSONObject

/** 合集内的一章（对应 posts 表的一行，不复制正文，只保留目录所需字段）。 */
data class HeikaChapter(
    val id: String,
    val clientId: String,
    val title: String,
    val excerpt: String,
    val image: String?,
    val status: String,
    val chapter: Int,
    val date: String,
) {
    val published: Boolean get() = status == "published"
    val statusLabel: String
        get() = when (status) {
            "draft" -> "草稿"
            "pending_review" -> "待审核"
            "hidden" -> "已下架"
            else -> ""
        }
}

/**
 * 合集（文学连载 / 教程 / 资源合集）。
 * 三类共用同一数据实体，用 [kind] 区分，章节顺序统一走 posts.series_order。
 */
data class HeikaCollection(
    val id: String,
    val title: String,
    val description: String,
    val coverUrl: String?,
    val kind: String,
    val channel: String,
    val categoryId: Int?,
    val status: String,
    val reviewStatus: String,
    val reviewNote: String?,
    val isOwner: Boolean,
    val creatorId: String,
    val creatorName: String,
    val creatorAvatar: String?,
    val chapters: List<HeikaChapter>,
    val publishedCount: Int,
    val followCount: Int,
    val following: Boolean,
    val notify: Boolean,
    val progressPostId: String?,
    val updatedAt: String,
) {
    val kindLabel: String
        get() = when (kind) {
            "tutorial" -> "教程"
            "resource" -> "资源"
            else -> "连载"
        }
    val statusLabel: String get() = if (status == "completed") "已完结" else "连载中"
    val awaitingReview: Boolean get() = reviewStatus != "approved"

    /** 上次读到的章节下标；没有进度时返回 -1。 */
    val progressIndex: Int get() = chapters.indexOfFirst { it.id == progressPostId }

    /** 「继续阅读」目标：优先上次章节，其次第一章已发布章节。 */
    val resumeChapter: HeikaChapter?
        get() = chapters.getOrNull(progressIndex) ?: chapters.firstOrNull { it.published }

    fun chapterAt(index: Int): HeikaChapter? = chapters.getOrNull(index)

    companion object {
        fun from(json: JSONObject): HeikaCollection {
            val creator = json.optJSONObject("creator")
            return HeikaCollection(
                id = json.optString("id"),
                title = json.optString("title"),
                description = json.optString("description"),
                coverUrl = json.optString("coverUrl").takeIf(String::isNotBlank)?.toWebUrl(),
                kind = json.optString("kind", "serial"),
                channel = json.optString("channel", "community"),
                categoryId = json.optInt("categoryId").takeIf { it > 0 },
                status = json.optString("status", "ongoing"),
                reviewStatus = json.optString("reviewStatus", "approved"),
                reviewNote = json.optString("reviewNote").takeIf(String::isNotBlank),
                isOwner = json.optBoolean("isOwner"),
                creatorId = json.optString("creatorId"),
                creatorName = creator?.optString("nickname").orEmpty().ifBlank { "黑卡作者" },
                creatorAvatar = creator?.optString("avatarUrl")?.takeIf(String::isNotBlank)?.toWebUrl(),
                chapters = json.optJSONArray("chapters").jsonObjects().map { row ->
                    HeikaChapter(
                        id = row.optString("id"),
                        clientId = runCatching {
                            PostIdMapping.clientId(row.opt("clientId"), row.opt("client_id"), row.opt("id"))
                        }.getOrDefault(0).toString(),
                        title = row.optString("title", "未命名章节"),
                        excerpt = row.optString("excerpt"),
                        image = row.optString("image").takeIf(String::isNotBlank)?.toWebUrl(),
                        status = row.optString("status", "published"),
                        chapter = row.optInt("chapter"),
                        date = row.optString("date"),
                    )
                },
                publishedCount = json.optInt("publishedCount"),
                followCount = json.optInt("followCount"),
                following = json.optBoolean("following"),
                notify = !json.has("notify") || json.optBoolean("notify", true),
                progressPostId = json.optString("progressPostId").takeIf(String::isNotBlank),
                updatedAt = json.optString("updatedAt"),
            )
        }

        /** 作者主页/搜索结果里的合集卡片：没有章节明细。 */
        fun summary(json: JSONObject): HeikaCollection = from(json)
    }
}
