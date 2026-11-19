package com.heika.nativeapp.feature.home

object DailyDeckLogic {
    fun flipIdempotencyKey(day: String, postId: Int): String {
        require(day.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { "翻卡日期无效" }
        require(postId > 0) { "卡片编号无效" }
        return "flip:$day:$postId"
    }

    /** The server already ranks and balances channels; keep that stable order locally. */
    fun preserveCandidateOrder(ids: List<Int>): List<Int> =
        ids.filter { it > 0 }.distinct()

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
