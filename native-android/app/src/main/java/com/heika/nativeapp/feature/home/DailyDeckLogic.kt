package com.heika.nativeapp.feature.home

import com.heika.nativeapp.data.HeikaPost

object DailyDeckLogic {
    fun flipIdempotencyKey(day: String, postId: Int): String {
        require(day.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { "翻卡日期无效" }
        require(postId > 0) { "卡片编号无效" }
        return "flip:$day:$postId"
    }

    fun rankCandidates(ids: List<Int>, day: String, interests: Set<String>, posts: Map<Int, HeikaPost>): List<Int> =
        ids.sortedWith { left, right ->
            val leftInterest = if (posts[left]?.tag?.let(interests::contains) == true) 0 else 1
            val rightInterest = if (posts[right]?.tag?.let(interests::contains) == true) 0 else 1
            if (leftInterest != rightInterest) leftInterest.compareTo(rightInterest)
            else Integer.compareUnsigned(seededRank(left, day), seededRank(right, day))
        }

    fun seededRank(id: Int, seed: String): Int {
        var value = 2166136261.toInt()
        "$seed:$id".forEach { value = (value xor it.code) * 16777619 }
        return value
    }

    fun allowanceFor(tier: String?): Int = when (tier) {
        "plus" -> 9
        "pro" -> 13
        else -> 5
    }

    fun luckyBonusFor(roll: Double): Int = when {
        roll < 0.001 -> 10
        roll < 0.016 -> 5
        roll < 0.066 -> 3
        roll < 0.166 -> 2
        else -> 0
    }
}
