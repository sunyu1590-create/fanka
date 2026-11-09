package com.heika.nativeapp.data

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeParseException

/** Mirrors the website's client ranking within each fetched discovery page. */
data class RecommendationContext(
    val interests: Set<String> = emptySet(),
    val viewedIds: Set<Int> = emptySet(),
    val personalRatings: Map<Int, Int> = emptyMap(),
)

object RecommendationRanker {
    fun rank(posts: List<HeikaPost>, context: RecommendationContext, nowMillis: Long = System.currentTimeMillis()): List<HeikaPost> {
        if (posts.size < 2) return posts

        val personalByTag = posts.mapNotNull { post ->
            context.personalRatings[post.id]?.let { post.tag to it }
        }.groupBy({ it.first }, { it.second }).mapValues { (_, values) -> values.average() to values.size }

        fun score(post: HeikaPost): Double {
            val (personalSum, personalCount) = personalByTag[post.tag]?.let { (average, count) -> average * count to count } ?: (0.0 to 0)
            val personalAverage = if (personalCount > 0) (personalSum + 3.0 * 2) / (personalCount + 2) else 3.0
            val communityAverage = if (post.ratingCount > 0 && post.ratingAverage != null) {
                (post.ratingAverage * post.ratingCount + 3.0 * 5) / (post.ratingCount + 5)
            } else 3.0
            val timestamp = post.date.toUtcMillisOrNull()
            val ageDays = timestamp?.let { ((nowMillis - it).coerceAtLeast(0)).toDouble() / 86_400_000.0 } ?: Double.POSITIVE_INFINITY
            val freshness = maxOf(0.0, 1.0 - ageDays / 45.0) * 0.2
            return (if (post.tag in context.interests) 1.0 else 0.0) +
                (personalAverage - 3.0) * 0.55 +
                (communityAverage - 3.0) * 0.35 + freshness -
                (if (post.id in context.viewedIds) 0.28 else 0.0)
        }

        val scores = posts.associate { it.id to score(it) }
        val byScore = posts.sortedWith(
            compareByDescending<HeikaPost> { scores[it.id] ?: 0.0 }
                .thenByDescending { it.date }
                .thenBy { it.id },
        )
        val byTag = LinkedHashMap<String, ArrayDeque<HeikaPost>>()
        byScore.forEach { post -> byTag.getOrPut(post.tag) { ArrayDeque() }.addLast(post) }

        val ranked = ArrayList<HeikaPost>(posts.size)
        val tagCounts = mutableMapOf<String, Int>()
        while (ranked.size < posts.size) {
            var bestTag: String? = null
            var bestScore = Double.NEGATIVE_INFINITY
            var bestId = Int.MAX_VALUE
            byTag.forEach { (tag, queue) ->
                val candidate = queue.firstOrNull() ?: return@forEach
                val diversified = (scores[candidate.id] ?: 0.0) - (tagCounts[tag] ?: 0) * 0.18
                if (diversified > bestScore || (diversified == bestScore && candidate.id < bestId)) {
                    bestTag = tag
                    bestScore = diversified
                    bestId = candidate.id
                }
            }
            val tag = bestTag ?: break
            val next = byTag[tag]?.removeFirstOrNull() ?: break
            ranked += next
            tagCounts[tag] = (tagCounts[tag] ?: 0) + 1
        }
        return ranked
    }

    private fun String.toUtcMillisOrNull(): Long? = try {
        LocalDate.parse(take(10)).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    } catch (_: DateTimeParseException) {
        null
    }
}
