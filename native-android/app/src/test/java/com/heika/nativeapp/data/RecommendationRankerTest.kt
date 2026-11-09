package com.heika.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RecommendationRankerTest {
    @Test
    fun recommendationKeepsTopicDiversityAcrossPage() {
        val posts = listOf(post(1, "科技"), post(2, "科技"), post(3, "摄影"))
        val ranked = RecommendationRanker.rank(posts, RecommendationContext(), nowMillis = 1_794_168_000_000)
        assertEquals(listOf(1, 3, 2), ranked.map { it.id })
    }

    @Test
    fun interestSignalRanksMatchingTopicFirst() {
        val posts = listOf(post(1, "科技"), post(2, "摄影"))
        val ranked = RecommendationRanker.rank(posts, RecommendationContext(interests = setOf("摄影")), nowMillis = 1_794_168_000_000)
        assertEquals(2, ranked.first().id)
    }

    @Test
    fun ratingFlagRequiresBothCountAndAverage() {
        assertTrue(!post(1, "科技", average = 5.0, count = 0).hasRating)
        assertTrue(post(2, "科技", average = 4.7, count = 1).hasRating)
    }

    private fun post(id: Int, tag: String, average: Double? = null, count: Int = 0) = HeikaPost(
        id = id,
        cloudId = "cloud-$id",
        channel = "community",
        tag = tag,
        title = "帖子 $id",
        body = "正文",
        tags = emptyList(),
        author = "HEIKA",
        authorId = null,
        authorAvatar = null,
        date = "2026-11-09",
        thumbnails = emptyList(),
        images = emptyList(),
        ratingAverage = average,
        ratingCount = count,
        likeCount = 0,
        contentType = "community_post",
        viewCount = 0,
        saved = false,
        rawJson = "{}",
    )
}
